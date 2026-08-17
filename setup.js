import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prompt, promptHidden } from "./utils/prompt.js";
import { login } from "./utils/login.js";
import {
  listReservations,
  cancelReservation,
  formatReservation,
} from "./utils/reservations.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, ".env");
const cfgPath = path.join(root, "config.json");

const mode = process.argv[2];

const readEnvToken = async () => {
  try {
    const env = await readFile(envPath, "utf8");
    return env.match(/^TOKEN=(.*)/m)?.[1]?.trim() || "";
  } catch {
    return "";
  }
};

async function setCredentials() {
  const username = await prompt("Username: ");
  const password = await promptHidden("Password: ");
  console.log("Logging in...");
  const token = await login(username, password);
  await writeFile(envPath, `TOKEN=${token}\n`);
  console.log("Credentials saved. Session token stored in .env.");
}

async function setSlot() {
  const config = JSON.parse(await readFile(cfgPath, "utf8"));
  const prev = config.slots.find((s) => s.type === mode);
  config.slots = config.slots.filter((s) => s.type !== mode);

  const busTime = await prompt(`${mode} bus time (HH:MM): `);
  const from = await prompt(`${mode} departure: `);
  const to = await prompt(`${mode} destination: `);
  const defaultLaunch = mode === "morning" ? "16:00" : "12:00";
  const launchRaw = await prompt(
    `Booking opens at (HH:MM) [${defaultLaunch}]: `
  );
  const launch = launchRaw.trim() || defaultLaunch;

  config.slots.push({
    type: mode,
    run_at: `${launch}:00`,
    traject: busTime,
    from,
    to,
    waitForSeat: prev?.waitForSeat ?? false,
    waitForSeatTimeout: prev?.waitForSeatTimeout ?? 60,
  });
  await writeFile(cfgPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Saved ${mode} slot: ${from} -> ${to} at ${busTime} (books at ${launch}).`);
}

async function toggleWaitSeat() {
  const config = JSON.parse(await readFile(cfgPath, "utf8"));
  const which = await prompt("Which slot? (morning/evening): ");
  const slot = config.slots.find((s) => s.type === which.trim().toLowerCase());
  if (!slot) {
    console.error(`No ${which.trim()} slot configured.`);
    process.exit(1);
  }
  const onRaw = await prompt(
    `Wait for a free seat if ${slot.type} time (${slot.traject}) is full? (y/N): `
  );
  const on = onRaw.trim().toLowerCase() === "y";
  slot.waitForSeat = on;
  if (on) {
    const capRaw = await prompt(
      `How long to keep waiting (minutes) [${slot.waitForSeatTimeout ?? 60}]: `
    );
    const cap = Number(capRaw.trim());
    slot.waitForSeatTimeout = Number.isFinite(cap) && cap > 0 ? cap : slot.waitForSeatTimeout ?? 60;
  }
  await writeFile(cfgPath, JSON.stringify(config, null, 2) + "\n");
  console.log(
    `${slot.type} slot: wait-for-seat ${on ? "ON" : "OFF"}` +
      (on ? ` (up to ${slot.waitForSeatTimeout} min)` : "")
  );
}

async function checkConfig() {
  let ok = true;
  const fail = (msg) => {
    console.error("  [FAIL] " + msg);
    ok = false;
  };
  const pass = (msg) => console.log("  [ok] " + msg);

  console.log("Checking .env...");
  const token = await readEnvToken();
  if (!token) fail("TOKEN missing/empty in .env (run option 1)");
  else pass("token present");

  console.log("Checking config.json...");
  let config;
  try {
    config = JSON.parse(await readFile(cfgPath, "utf8"));
    pass("config.json parses");
  } catch (e) {
    fail("config.json invalid: " + e.message);
    console.log(ok ? "All good." : "Fixes needed above.");
    process.exit(ok ? 0 : 1);
  }

  if (Array.isArray(config.slots) && config.slots.length) {
    config.slots.forEach((s, i) => {
      const name = s.type || `slot ${i + 1}`;
      if (!/^\d{2}:\d{2}:\d{2}$/.test(s.run_at || ""))
        fail(`${name}: run_at '${s.run_at}' not HH:MM:SS`);
      if (!/^\d{2}:\d{2}$/.test(s.traject || ""))
        fail(`${name}: traject '${s.traject}' not HH:MM`);
      if (!s.from || !s.to) fail(`${name}: from/to missing`);
      else pass(`${name}: ${s.from} -> ${s.to} at ${s.traject} (release ${s.run_at.slice(0, 5)})`);
      if (s.waitForSeat)
        pass(`${name}: wait-for-seat ON (up to ${s.waitForSeatTimeout ?? 60} min)`);
    });
  } else {
    pass("no slots configured");
  }

  console.log("Checking Chromium...");
  try {
    await access(config.chromiumBinary);
    pass(`binary exists: ${config.chromiumBinary}`);
  } catch {
    fail(`chromiumBinary not found: ${config.chromiumBinary}`);
  }

  console.log("Checking API with token...");
  try {
    const r = await fetch("https://transport.zone01oujda.ma/api/buses", {
      headers: {
        Cookie: `__Secure-elgencia.session_token=${token}`,
      },
    });
    if (r.ok) pass(`token works (${r.status})`);
    else fail(`token rejected (${r.status})`);
  } catch (e) {
    fail("API unreachable: " + e.message);
  }

  if (token) {
    try {
      const res = await listReservations(token);
      if (res.length) {
        console.log("  Current reservations:");
        res.forEach((r) =>
          console.log(`    ${formatReservation(r).time}  ${r.bus?.busFrom} -> ${r.bus?.busTo}  (seat ${r.seatNo})`)
        );
      } else {
        pass("no reservations");
      }
    } catch {
      /* skip */
    }
  }

  console.log(ok ? "All good." : "Fixes needed above.");
}

async function manageReservations() {
  const token = await readEnvToken();
  if (!token) {
    console.error("No TOKEN in .env — run option 1 first.");
    process.exit(1);
  }
  const res = await listReservations(token);
  if (res.length === 0) {
    console.log("No reservations.");
    return;
  }
  console.log("Your reservations:");
  res.forEach((r, i) => {
    const f = formatReservation(r);
    console.log(`  ${i + 1}) ${f.time}  ${f.from} -> ${f.to}  (seat ${f.seatNo}, id ${r.id})`);
  });
  const raw = await prompt("Cancel which? (number, or empty to keep): ");
  const idx = Number(raw.trim()) - 1;
  if (!raw.trim() || !res[idx]) {
    console.log("Nothing canceled.");
    return;
  }
  const confirm = await prompt(`Cancel ${formatReservation(res[idx]).time}? (y/N): `);
  if (confirm.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    return;
  }
  await cancelReservation(token, res[idx]);
  console.log("Reservation canceled.");
}

const actions = {
  credentials: setCredentials,
  morning: setSlot,
  evening: setSlot,
  check: checkConfig,
  reservations: manageReservations,
  waitseat: toggleWaitSeat,
};
if (!actions[mode]) {
  console.error(
    "usage: node setup.js <credentials|morning|evening|check|reservations|waitseat>"
  );
  process.exit(1);
}

await actions[mode]();
