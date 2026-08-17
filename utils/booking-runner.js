import puppeteer from "puppeteer";
import { CaptchaSolver, CaptchaError } from "../reCaptchaSovler/solver.js";
import { intoUTC } from "./time.js";
import { Signal } from "./signal.js";
import {
  listReservations,
  cancelReservation,
  formatReservation,
} from "./reservations.js";
import { writeFile, rm } from "node:fs/promises";

const BROWSER_PID_FILE = "/tmp/trz01-browser.pid";
const BROWSER_PROFILE = "/tmp/trz01-profile";
const TASK_TIMEOUT = Number(process.env.TRZ01_TIMEOUT || 5 * 60 * 1000);
const BOOKING_RESPONSE_TIMEOUT = 30 * 1000;

const POLL_INTERVAL = 2000;
const API_URL = "https://transport.zone01oujda.ma/api/buses";

async function bookSeat(page, time, waitForSeat = false) {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto("https://transport.zone01oujda.ma/");
      const solver = new CaptchaSolver(page);

      const timeXPath = `//td[text() = '${time}']/following-sibling::*[3]`;
      const bookButton = page.locator(`::-p-xpath(${timeXPath})`);

      const handle = await page.$(`::-p-xpath(${timeXPath})`).catch(() => null);
      let disabled = false;
      if (handle) {
        disabled = await handle
          .evaluate((el) => {
            const btn = el.tagName === "BUTTON" ? el : el.querySelector("button");
            return btn
              ? btn.disabled === true || btn.hasAttribute("disabled")
              : false;
          })
          .catch(() => false);
        await handle.dispose();
      }

      if (disabled) {
        if (waitForSeat) {
          throw new CaptchaError(
            `bus at ${time} is full right now (button disabled) — rechecking...`
          );
        }
        throw new Error(
          `bus at ${time} is already booked or full (book button disabled)`
        );
      }

      await bookButton.click();

      await solver.execFlow([
        "[CAPTCHA]",
        "::-p-xpath(//button[text() = 'Confirm'])",
      ]);
      return;
    } catch (err) {
      if (!(err instanceof CaptchaError) || attempt === MAX_RETRIES) {
        throw err;
      }
      console.log(
        `Booking attempt ${attempt} failed (${err.message}) — reloading page...`
      );
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function pollBuses(
  { hour, minute, from, to },
  token,
  { waitForSeat = false, waitForSeatTimeout = 60 } = {}
) {
  const start = Date.now();
  const capMs = waitForSeatTimeout * 60 * 1000;
  return await new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(API_URL, {
          cache: "no-store",
          credentials: "include",
          headers: {
            Cookie: `__Secure-elgencia.session_token=${token}`,
          },
        });

        if (!res.ok) throw new Error(`sattus code: ${res.status}`);
        const data = await res.json();

        const targetBus = data.buses.find((bus) => {
          const date = new Date(bus.date);
          return (
            date.getUTCHours() === hour &&
            date.getUTCMinutes() === minute &&
            (!from || bus.busFrom === from) &&
            (!to || bus.busTo === to)
          );
        });

        if (targetBus) {
          if (waitForSeat && targetBus.availableSeats === 0) {
            const waited = Date.now() - start;
            console.log(
              `${from} -> ${to} bus full (0 seats) — waiting for a free seat... (${Math.round(
                waited / 1000
              )}s)`
            );
            if (waited >= capMs) {
              clearInterval(intervalId);
              reject(
                new Error(
                  `no free seat on ${from} -> ${to} within ${waitForSeatTimeout} min`
                )
              );
            }
            return;
          }
          clearInterval(intervalId);
          resolve(targetBus);
        }
      } catch (err) {
        console.error("Error polling buses:", err);
      }
    }, POLL_INTERVAL);
  });
}

async function runTask(slot, token, chromiumBinary) {
  const { traject, from, to } = slot;
  const waitForSeat = slot.waitForSeat === true;
  const waitForSeatTimeout = Number(slot.waitForSeatTimeout || 60);
  const rebookBackup = slot.rebookBackup === true;
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromiumBinary,
    args: [`--user-data-dir=${BROWSER_PROFILE}`],
  });
  await writeFile(BROWSER_PID_FILE, String(browser.process().pid));

  browser.setCookie({
    domain: "transport.zone01oujda.ma",
    name: "__Secure-elgencia.session_token",
    value: token,
    path: "/",
    secure: true,
    httpOnly: true,
  });

  const page = await browser.newPage();

  const hardClose = async () => {
    try {
      await browser.close();
    } catch {
      /* already closed */
    }
    try {
      browser.process().kill("SIGKILL");
    } catch {
      /* already dead */
    }
    await rm(BROWSER_PID_FILE, { force: true });
    await rm(BROWSER_PROFILE, { recursive: true, force: true });
  };

  const effectiveTimeout = waitForSeat
    ? Math.max(TASK_TIMEOUT, waitForSeatTimeout * 60 * 1000 + 5 * 60 * 1000)
    : TASK_TIMEOUT;

  let timeoutTimer;
  const timeout = new Promise((_, reject) => {
    timeoutTimer = setTimeout(() => {
      console.log("Task timed out — closing booking browser.");
      reject(new Error("booking task timed out"));
    }, effectiveTimeout);
  });

  try {
    const flow = (async () => {
      console.log(`Starting polling for ${traject} bus...`);
      const [hour, minute] = traject.split(":");
      const targetBus = await pollBuses(
        { ...intoUTC(hour, minute), from, to },
        token,
        { waitForSeat, waitForSeatTimeout }
      );

      if (rebookBackup) {
        const reservations = await listReservations(token);
        const backups = reservations.filter(
          (r) => r.busId !== targetBus.id
        );
        for (const backup of backups) {
          const f = formatReservation(backup);
          console.log(
            `Canceling backup reservation ${f.time} ${f.from} -> ${f.to} (seat ${f.seatNo})...`
          );
          await cancelReservation(token, backup);
        }
      }

      const waitForBooking = new Signal();
      page.on("response", (e) => e.url().includes("booking") && waitForBooking.resolve());

      await bookSeat(page, [hour, minute].join(":"), waitForSeat);

      let responseTimer;
      const responseTimeout = new Promise((_, reject) => {
        responseTimer = setTimeout(
          () => reject(new Error("no booking response received")),
          BOOKING_RESPONSE_TIMEOUT
        );
      });
      try {
        await Promise.race([waitForBooking.promise, responseTimeout]);
      } finally {
        clearTimeout(responseTimer);
      }
    })();

    await Promise.race([flow, timeout]);
  } finally {
    clearTimeout(timeoutTimer);
    await hardClose();
  }
}

export { runTask };