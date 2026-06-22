// Usage: pnpm bot:login <facebook|kijiji|autotrader>
// Launches a VISIBLE browser, operator logs in by hand, saves storageState.
import { chromium } from "playwright";
import { mkdir, chmod } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

const LOGIN_URLS = {
  facebook: "https://www.facebook.com/login",
  kijiji: "https://www.kijiji.ca/t-login.html",
  autotrader: "https://www.autotrader.ca/login",
};

const platform = process.argv[2];
if (!platform || !(platform in LOGIN_URLS)) {
  console.error(
    `usage: pnpm bot:login <${Object.keys(LOGIN_URLS).join("|")}>`
  );
  process.exit(1);
}

const sessionsDir = path.resolve(process.cwd(), "sessions");
const statePath = path.join(sessionsDir, `${platform}.json`);

function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(prompt, () => {
      rl.close();
      resolve();
    })
  );
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(LOGIN_URLS[platform], { waitUntil: "domcontentloaded" });

console.log(`\nA browser window opened on ${platform}.`);
console.log("Log in by hand (handle 2FA / CAPTCHA / challenges).");
await waitForEnter(
  "When you are fully logged in, press ENTER here to save the session... "
);

await mkdir(sessionsDir, { recursive: true, mode: 0o700 });
await chmod(sessionsDir, 0o700);
await context.storageState({ path: statePath });
await chmod(statePath, 0o600);
await browser.close();

console.log(`\n✓ Saved ${platform} session to ${statePath}`);
console.log("Place this file on the server (scp) or upload via the dashboard.");
