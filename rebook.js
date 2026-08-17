import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadenv } from "dotenv";
import { prompt } from "./utils/prompt.js";
import { ensureToken } from "./utils/ensureToken.js";
import { runTask } from "./utils/booking-runner.js";
import { listReservations, cancelReservation, formatReservation } from "./utils/reservations.js";

loadenv();
const root = path.dirname(fileURLToPath(import.meta.url));
const REBOOK_FILE = "/tmp/trz01-rebook.json";

const { default: config } = await import("./config.json", { with: { type: "json" } });
const TOKEN = await ensureToken(process.env.TOKEN);

const answer = await prompt(
  "Old time to cancel -> new time to book (e.g. 18:15->09:00): "
);
const match = answer.match(/(\d{1,2}:\d{2})\s*->\s*(\d{1,2}:\d{2})/);
if (!match) {
  console.error("Could not parse. Expected format: OLD->NEW  (e.g. 18:15->09:00)");
  process.exit(1);
}
const [_, cancelTime, bookTime] = match;

await writeFile(
  REBOOK_FILE,
  JSON.stringify({ cancel: cancelTime, book: bookTime }, null, 2) + "\n"
);
console.log(`Saved rebook request to ${REBOOK_FILE}`);

const reservations = await listReservations(TOKEN);
if (reservations.length === 0) {
  console.error("No reservations found to cancel.");
  process.exit(1);
}

const normalized = (t) => t.replace(":", "");
const target = reservations.find(
  (r) => normalized(formatReservation(r).time) === normalized(cancelTime)
);

if (!target) {
  console.error(`No reservation at ${cancelTime}. Your reservations:`);
  reservations.forEach((r) => {
    const f = formatReservation(r);
    console.log(`  ${f.time}  ${f.from} -> ${f.to}  (seat ${f.seatNo})`);
  });
  process.exit(1);
}

console.log(
  `Canceling ${formatReservation(target).time} ${target.bus?.busFrom} -> ${target.bus?.busTo} (seat ${target.seatNo})...`
);
await cancelReservation(TOKEN, target);
console.log("Reservation canceled.");

const slot = config.slots.find((s) => s.traject === bookTime);
const book = slot ? { traject: bookTime, from: slot.from, to: slot.to } : { traject: bookTime };

console.log(`Booking new bus at ${bookTime}...`);
await runTask(book, TOKEN, config.chromiumBinary);