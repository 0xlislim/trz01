import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prompt, promptHidden } from "./prompt.js";
import { login } from "./login.js";

const envPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".env"
);

export async function ensureToken(existing) {
  if (existing) return existing;

  if (!process.stdin.isTTY) {
    throw new Error(
      "no session token and not a terminal — run `node main.js` once in a terminal to save credentials"
    );
  }

  console.log("First run — please enter your zone01 transport credentials.");
  const username = await prompt("Username: ");
  const password = await promptHidden("Password: ");

  const token = await login(username, password);
  await writeFile(envPath, `TOKEN=${token}\n`);
  console.log("Logged in. Session token saved to .env — next runs won't ask again.");
  return token;
}
