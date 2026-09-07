import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CREDS = JSON.parse(readFileSync(join(ROOT, ".qa-credentials.json"), "utf8"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("request", (request) => {
  if (request.url().includes("/api/")) {
    console.log("REQ", request.method(), request.url(), "csrf", Boolean(request.headers()["x-csrftoken"]));
  }
});
page.on("response", async (response) => {
  if (response.url().includes("/api/")) {
    const body = await response.text().catch(() => "");
    console.log("RES", response.status(), response.url(), body.slice(0, 180));
  }
});
page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
page.on("pageerror", (error) => console.log("PAGEERROR", error));
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.locator('input[autocomplete="username"]').fill(CREDS.reception.username);
await page.locator('input[autocomplete="current-password"]').fill(CREDS.reception.password);
await page.locator("button.auth-submit").click();
await page.waitForTimeout(8000);
console.log("URL", page.url());
console.log("HAS_SIDEBAR", await page.locator("aside.sidebar").count());
console.log("ERROR", await page.locator(".auth-error, .error").innerText().catch(() => ""));
console.log("BUTTON", await page.locator("button.auth-submit").innerText().catch(() => ""));
await browser.close();
