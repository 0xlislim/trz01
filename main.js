import cron from "node-cron";
import { config as loadenv } from "dotenv";
import { testChromiumBinary } from "./utils/test.js";
import { ensureToken } from "./utils/ensureToken.js";
import { runTask } from "./utils/booking-runner.js";

loadenv();
const { default: config } = await import("./config.json", {
  with: { type: "json" },
});

const TOKEN = await ensureToken(process.env.TOKEN);

async function main() {
  await testChromiumBinary(config.chromiumBinary);

  const slotType = process.argv[2];
  if (slotType) {
    const slot = config.slots.find((s) => s.type === slotType);
    if (!slot) {
      console.error(`unknown slot type: ${slotType}`);
      process.exit(1);
    }
    console.log(
      `Running ${slotType} slot once (${slot.traject} ${slot.from} -> ${slot.to})`
    );
    await runTask(slot, TOKEN, config.chromiumBinary);
    process.exit(0);
  }

  const testSlot = config.test_slot;
  if (testSlot) {
    runTask(
      typeof testSlot === "string" ? { traject: testSlot } : testSlot,
      TOKEN,
      config.chromiumBinary
    ).catch((err) => console.error("test task failed:", err.message));
  }
  config.slots.forEach((slot) => {
    const { run_at } = slot;
    const [hour, minute, seconds] = run_at.split(":");
    cron.schedule(`${seconds} ${minute} ${hour} * * *`, () => {
      runTask(slot, TOKEN, config.chromiumBinary).catch((err) =>
        console.error("scheduled task failed:", err.message)
      );
    });
  });
}

await main();