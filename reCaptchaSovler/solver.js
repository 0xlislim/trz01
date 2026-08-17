import { convertMp3BufferToWav, waveBufferToF64 } from "./audio.js";
import { pipeline } from "@xenova/transformers";
import { Signal } from "../utils/signal.js";

export class CaptchaError extends Error {}

const transcriber = await pipeline(
  "automatic-speech-recognition",
  "Xenova/whisper-tiny"
);

export class CaptchaSolver {
  #answer = null;
  #page = null;
  constructor(page) {
    this.#page = page;
    this.#answer = new Signal();
    page.on("response", async (response) => {
      try {
        if (
          response.url().includes("payload") &&
          response.request().resourceType() === "media"
        ) {
          const buffer = await response.buffer();
          console.log("Got media response bytes:", buffer.length);
          let audioData = waveBufferToF64(await convertMp3BufferToWav(buffer));
          const result = await transcriber(audioData);
          console.log("result:", result.text);
          this.#answer.resolve(result.text);
        }
      } catch (err) {
        console.error("Error handling response:", err);
      }
    });
  }

  async execFlow(flow) {
    for (const selector of flow) {
      if (selector == "[CAPTCHA]") {
        await this.solveCaptcha();
        continue;
      }
      await this.#page.locator(selector).click();
    }
  }

  async solveCaptcha() {
    const iframe = await this.#page
      .waitForSelector('iframe[title="reCAPTCHA"]', { timeout: 15000 })
      .catch(() => {
        throw new CaptchaError("reCAPTCHA iframe never appeared");
      });
    const frame = await iframe.contentFrame();
    await frame.waitForSelector("#rc-anchor-container");

    const alreadyChecked = await frame
      .$(".recaptcha-checkbox-checked")
      .catch(() => null);
    if (!alreadyChecked) {
      await frame.locator("#rc-anchor-container").click();
    }

    const needsAudio = await this.#waitForChallenge(frame);
    if (!needsAudio) {
      console.log("No audio challenge — checkbox checked, proceeding to Confirm.");
      return;
    }

    const challenge_iframe = await this.#page
      .waitForSelector(
        'iframe[title="recaptcha challenge expires in two minutes"]',
        { timeout: 10000 }
      )
      .catch(() => {
        throw new CaptchaError("captcha challenge iframe never appeared");
      });

    const challenge_frame = await challenge_iframe.contentFrame();
    await challenge_frame.waitForSelector(".audio-button-holder");
    await challenge_frame.locator(".audio-button-holder").click();

    frame
      .waitForSelector(".recaptcha-checkbox-checked", { timeout: 60000 })
      .then(() => this.#answer.reject());

    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    while (true) {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        throw new CaptchaError(
          `captcha solving failed after ${MAX_ATTEMPTS} attempts (automation detected?)`
        );
      }
      try {
        const text = await this.#answer.promise;
        this.#answer.reset();
        if (text.trim().length === 0) {
          await challenge_frame.click("#recaptcha-reload-button", {
            delay: 4.2,
          });
          continue;
        }
        await challenge_frame.type("#audio-response", text, { delay: 20 });
        await challenge_frame.click("#recaptcha-verify-button", { delay: 10 });
      } catch {
        break;
      }
    }
  }

  async #waitForChallenge(frame) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      this.#page
        .waitForSelector(
          'iframe[title="recaptcha challenge expires in two minutes"]',
          { timeout: 8000 }
        )
        .then(() => finish(true))
        .catch(() => finish(false));

      frame
        .waitForSelector(".recaptcha-checkbox-checked", { timeout: 8000 })
        .then(() => finish(false))
        .catch(() => finish(false));
    });
  } 
}
