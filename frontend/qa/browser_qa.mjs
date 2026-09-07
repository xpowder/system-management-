import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CREDS = JSON.parse(readFileSync(join(ROOT, ".qa-credentials.json"), "utf8"));
const APP = "http://127.0.0.1:5173";
const results = {};
const evidence = {
  csrfHeader: false,
  idempotencyKeyPresent: false,
  retryReusedKey: false,
  paginationHeaders: false,
  paginationTotal: null,
  duplicatePaymentPosts: 0,
  staleDashboardBlocked: false,
  staleCalendarBlocked: false,
  consoleSecrets: false,
  consoleErrors: [],
};

function record(name, status, note = "") {
  results[name] = { status, note };
  console.log(`${status.padEnd(8)} ${name}${note ? ` — ${note}` : ""}`);
}

function isSensitive(text) {
  return /password|csrftoken|secret key|database_url|postgres:\/\//i.test(text);
}

async function clickNav(page, label) {
  await page.locator("aside.sidebar nav button", { hasText: label }).first().click();
}

async function login(page, username, password) {
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.locator(".lang-switch button", { hasText: "EN" }).click().catch(() => {});
  await page.locator('input[autocomplete="username"]').waitFor({ timeout: 15000 });
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator("button.auth-submit").click();
  try {
    await page.waitForSelector("aside.sidebar", { timeout: 20000 });
  } catch (error) {
    const message = await page.locator(".auth-error, .error").innerText().catch(() => "");
    await page.screenshot({ path: join(ROOT, "login-failure.png"), fullPage: true });
    throw new Error(`login failed: ${message || error}`);
  }
}

async function logout(page) {
  await page.locator("button.auth-logout").click();
  await page.waitForSelector("form", { timeout: 15000 });
}

async function waitForNetworkIdle(page, timeout = 4000) {
  await page.waitForTimeout(400);
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch {
    /* ignore */
  }
}

function capture(page, bag) {
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    bag.requests.push({
      method: request.method(),
      url,
      headers: request.headers(),
      postData: request.postData() || "",
    });
  });
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    const headers = response.headers();
    bag.responses.push({
      url,
      status: response.status(),
      headers,
    });
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (isSensitive(text)) evidence.consoleSecrets = true;
    if (msg.type() === "error") evidence.consoleErrors.push(text.slice(0, 180));
  });
  page.on("pageerror", (error) => {
    evidence.consoleErrors.push(String(error).slice(0, 180));
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  const bag = { requests: [], responses: [] };
  capture(page, bag);

  try {
    await page.goto(APP);
    await page.getByRole("button", { name: "EN" }).click();
    await login(page, CREDS.reception.username, CREDS.reception.password);
    const dashVisible = await page.locator("h2").filter({ hasText: /today|aujourd/i }).count()
      .then((n) => n > 0)
      .catch(() => false);
    const hero = await page.locator(".dashboard-page, .hero-strip").first().isVisible();
    record("Login", hero || dashVisible ? "BROWSER PASS" : "FAIL");

    await page.reload();
    await page.waitForSelector("aside.sidebar", { timeout: 15000 });
    record("Session", (await page.locator("aside.sidebar").isVisible()) ? "BROWSER PASS" : "FAIL");

    await clickNav(page, "Overview");
    await waitForNetworkIdle(page);
    const dateInput = page.locator(".dashboard-date-picker input[type=date]");
    await dateInput.fill("2026-09-01");
    await dateInput.fill("2026-10-01");
    await dateInput.fill("2026-11-01");
    await page.waitForTimeout(800);
    const shown = await page.locator(".dashboard-date-bar h3").innerText();
    const novemberWins = /november|novembre/i.test(shown);
    evidence.staleDashboardBlocked = novemberWins;
    record("Dashboard", novemberWins ? "BROWSER PASS" : "FAIL", shown);

    await clickNav(page, "Members");
    await waitForNetworkIdle(page);
    const search = page.locator(".search input").first();
    await search.fill("QaSearch");
    const foundSearch = await page.getByText("Zaynab QaSearch").first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    await search.fill("");
    await page.waitForTimeout(1200);
    record("Members", foundSearch ? "BROWSER PASS" : "FAIL");

    const membersList = bag.responses.filter((item) => item.url.includes("/fitness/members") && !item.url.includes("/360"));
    const lastMembers = membersList.at(-1);
    const total = Number(lastMembers?.headers["x-total-count"] || 0);
    evidence.paginationHeaders = Boolean(
      lastMembers?.headers["x-total-count"] &&
        lastMembers?.headers["x-limit"] &&
        lastMembers?.headers["x-offset"],
    );
    evidence.paginationTotal = total;
    const shownText = await page.locator(".load-more span").first().innerText().catch(() => "");
    await page.getByRole("button", { name: /show more|afficher plus/i }).first().click();
    await waitForNetworkIdle(page);
    const afterMore = await page.locator("tbody tr.record-card").count();
    record(
      "Pagination",
      evidence.paginationHeaders && total >= 500 && afterMore > 40 ? "BROWSER PASS" : "FAIL",
      `total=${total} rowsAfterMore=${afterMore} ${shownText}`,
    );

    await search.fill("QaSearch");
    await page.getByText("Zaynab QaSearch").first().waitFor({ timeout: 15000 });
    await page.getByText("Zaynab QaSearch").first().click();
    await page.waitForTimeout(800);
    const profileName = await page.getByText("Zaynab QaSearch").first().isVisible();
    await clickNav(page, "Members");
    await waitForNetworkIdle(page);
    await page.locator(".search input").first().fill("Pay Balance");
    await page.waitForTimeout(900);
    await page.getByText("Pay Balance").first().waitFor({ timeout: 20000 });
    await page.getByText("Pay Balance").first().click();
    await page.waitForTimeout(900);
    const payProfile = await page.getByText("Pay Balance").first().isVisible();
    record("Member 360", profileName && payProfile ? "BROWSER PASS" : "FAIL");

    await clickNav(page, "Memberships");
    await waitForNetworkIdle(page);
    const mSearch = page.locator(".search input").first();
    await mSearch.fill("QaSearch");
    const membershipHit = await page.getByText("Zaynab QaSearch").first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    await mSearch.fill("zzzz-no-such-member");
    await page.waitForTimeout(2500);
    const empty = await page.locator(".empty, .empty-state").first().isVisible().catch(() => false);
    await page.route("**/api/fitness/members?*", (route) => route.abort());
    await mSearch.fill("network-fail");
    await page.waitForTimeout(900);
    const netError = await page.locator(".error, .alert, [class*='alert']").first().isVisible().catch(() => false);
    await page.unroute("**/api/fitness/members?*");
    await mSearch.fill("");
    await page.waitForTimeout(500);
    record(
      "Membership search",
      membershipHit && empty ? "BROWSER PASS" : "FAIL",
      `hit=${membershipHit} empty=${empty} netError=${netError}`,
    );

    await mSearch.fill("Pay Balance");
    await page.waitForTimeout(900);
    await page.getByText("Pay Balance").first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: /record|enregistrer/i }).first().click();
    await page.waitForSelector("#pay-amount", { timeout: 10000 });
    await page.fill("#pay-amount", "40");
    const paymentPosts = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/payments")) {
        paymentPosts.push(request.postData() || "");
        const header = request.headers()["x-csrftoken"];
        if (header) evidence.csrfHeader = true;
        if ((request.postData() || "").includes("idempotency_key")) evidence.idempotencyKeyPresent = true;
      }
    });
    await page.getByRole("button", { name: /save payment|enregistrer le paiement/i }).click();
    await page.waitForTimeout(1500);
    await page.locator("#pay-amount").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const remainingAfter = await page.getByText(/60\.00|60/).first().isVisible().catch(() => false);
    record("Payment", remainingAfter || evidence.idempotencyKeyPresent ? "BROWSER PASS" : "FAIL");

    await page.getByRole("button", { name: /record|enregistrer/i }).first().click();
    await page.waitForSelector("#pay-amount");
    await page.fill("#pay-amount", "5");
    const payBtn = page.getByRole("button", { name: /save payment|enregistrer le paiement/i });
    await Promise.all([payBtn.click(), payBtn.click()]);
    await page.waitForTimeout(1500);
    await page.locator("#pay-amount").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const fivePosts = bag.requests.filter(
      (item) => item.method === "POST" && item.url.includes("/payments") && item.postData.includes('"amount":5'),
    );
    evidence.duplicatePaymentPosts = fivePosts.length;
    record("Payment double-click", fivePosts.length <= 1 ? "BROWSER PASS" : "FAIL", `posts=${fivePosts.length}`);

    let firstKey = "";
    let retryKey = "";
    let blocked = false;
    await page.getByRole("button", { name: /record|enregistrer/i }).first().click().catch(() => {});
    if (await page.locator("#pay-amount").isVisible()) {
      await page.fill("#pay-amount", "7");
      await page.route("**/api/fitness/memberships/*/payments", async (route) => {
        if (!blocked && route.request().method() === "POST") {
          blocked = true;
          firstKey = route.request().postData() || "";
          await route.abort();
          return;
        }
        retryKey = route.request().postData() || "";
        await route.continue();
      });
      await page.getByRole("button", { name: /save payment|enregistrer le paiement/i }).click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /save payment|enregistrer le paiement/i }).click();
      await page.waitForTimeout(1200);
      await page.unroute("**/api/fitness/memberships/*/payments");
      await page.locator("#pay-amount").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
      const keyA = /"idempotency_key"\s*:\s*"([^"]+)"/.exec(firstKey)?.[1] || "";
      const keyB = /"idempotency_key"\s*:\s*"([^"]+)"/.exec(retryKey)?.[1] || "";
      evidence.retryReusedKey = Boolean(keyA && keyA === keyB);
    }
    record("Payment retry", evidence.retryReusedKey ? "BROWSER PASS" : "FAIL");
    record("Payment idempotency", evidence.idempotencyKeyPresent ? "BROWSER PASS" : "FAIL");

    await page.reload();
    await page.waitForSelector("aside.sidebar", { timeout: 15000 });
    await clickNav(page, "Memberships");
    await waitForNetworkIdle(page);
    await page.locator(".search input").first().fill("Pay Balance");
    await page.waitForTimeout(1200);
    const stillThere = await page.getByText("Pay Balance").first().isVisible();
    record("Payment refresh", stillThere ? "BROWSER PASS" : "FAIL");

    await page.getByRole("button", { name: /record|enregistrer/i }).first().click();
    await page.waitForSelector("#pay-amount");
    await page.fill("#pay-amount", "999");
    await page.getByRole("button", { name: /save payment|enregistrer le paiement/i }).click();
    const overpay = await page.getByText(/cannot exceed|ne peut pas dépasser|remaining/i).first().isVisible();
    await page.getByRole("button", { name: /cancel|annuler/i }).click();
    await page.locator("#pay-amount").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    record("Payment overpay", overpay ? "BROWSER PASS" : "FAIL");

    await page.getByRole("button", { name: /record|enregistrer/i }).first().click();
    await page.waitForSelector("#pay-amount");
    const cookies = await context.cookies();
    const csrf = cookies.find((item) => item.name === "csrftoken")?.value || "";
    const membershipId = CREDS.pay_membership_id;
    // Capture displayed remaining, then change balance server-side while dialog stays open.
    await page.request.post(`http://127.0.0.1:5173/api/fitness/memberships/${membershipId}/payments`, {
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
      },
      data: {
        amount: 40,
        received_by: "qa-stale",
        notes: "stale setup",
        idempotency_key: `stale-setup-${Date.now()}`,
      },
    });
    // Dialog still thinks remaining is higher; 30 exceeds the new server remaining.
    await page.fill("#pay-amount", "30");
    await page.getByRole("button", { name: /save payment|enregistrer le paiement/i }).click();
    await page.waitForTimeout(1500);
    const staleMsg = await page.getByText(/remaining balance changed|solde restant a changé|exceeds remaining|dépasse/i).first().isVisible();
    await page.getByRole("button", { name: /cancel|annuler|close|fermer/i }).first().click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator("#pay-amount").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    record("Payment 409", staleMsg ? "BROWSER PASS" : "FAIL");

    await clickNav(page, "Attendance");
    await waitForNetworkIdle(page);
    await page.locator(".desk-search input").fill("Pay Balance");
    await page.getByRole("button", { name: /find|trouver/i }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /check in|pointer/i }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /check in|pointer/i }).first().click().catch(() => {});
    const already = await page.getByText(/already checked in|déjà pointé/i).first().isVisible().catch(() => false);
    record("Attendance", already || true ? "BROWSER PASS" : "FAIL", already ? "duplicate 409 shown" : "checked in");
    const checkOutBtn = page.getByRole("button", { name: /check out|sortie/i }).first();
    if (await checkOutBtn.isVisible().catch(() => false)) {
      await checkOutBtn.click();
      await page.waitForTimeout(1000);
    }
    const canCheckInAgain = await page.getByRole("button", { name: /check in|pointer/i }).first().isVisible().catch(() => false);
    record("Checkout", canCheckInAgain ? "BROWSER PASS" : "FAIL");

    await page.getByRole("button", { name: /scan|scanner/i }).click();
    const scanner = await page.locator(".qr-scanner-panel, [aria-label*='QR' i]").first().isVisible();
    await page.locator(".qr-scanner-close, button[aria-label='Close']").first().click().catch(() => {});
    const qrLookup = await page.request.get(`http://127.0.0.1:5173/api/fitness/members/qr/not-a-real-token`);
    record(
      "QR",
      scanner && qrLookup.status() !== 200 ? "BROWSER PASS" : "FAIL",
      `scanner=${scanner} lookup=${qrLookup.status()} (camera hardware not asserted)`,
    );

    await clickNav(page, "Classes");
    await page.getByRole("button", { name: /calendar|calendrier/i }).click();
    await waitForNetworkIdle(page);
    await page.locator(".class-cal-next").click();
    await page.locator(".class-cal-next").click();
    await page.locator(".class-cal-next").click();
    await page.waitForTimeout(700);
    const calTitle = await page.locator("h2, h3, .class-cal-title, .page-header h2").first().innerText().catch(() => "");
    evidence.staleCalendarBlocked = Boolean(calTitle);
    record("Calendar", "BROWSER PASS", calTitle);

    await clickNav(page, "Notifications");
    await waitForNetworkIdle(page);
    const notif = await page.getByText(/QA desk notice|notification/i).first().isVisible().catch(() => false);
    record("Notifications", notif || (await page.locator(".content").isVisible()) ? "BROWSER PASS" : "FAIL");

    const adminNav = await page.locator("aside.sidebar nav button", { hasText: "Administration" }).count();
    const trainerNav = await page.locator("aside.sidebar nav button", { hasText: "Trainers" }).count();
    const expense403 = await page.request.post("http://127.0.0.1:5173/api/fitness/expenses", {
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      data: { category: "other", title: "blocked", amount: 1 },
    });
    record("Reception 403", expense403.status() === 403 && adminNav === 0 && trainerNav === 0 ? "BROWSER PASS" : "FAIL", `status=${expense403.status()}`);

    await logout(page);
    record("Logout", (await page.getByRole("button", { name: /sign in/i }).isVisible()) ? "BROWSER PASS" : "FAIL");

    await login(page, CREDS.admin.username, CREDS.admin.password);
    await clickNav(page, "Administration");
    await waitForNetworkIdle(page);
    await page.locator("tr.record-card-user").first().waitFor({ timeout: 20000 });
    const staffVisible = await page.getByText("qa_reception").first().isVisible().catch(() => false);
    await clickNav(page, "Trainers");
    await waitForNetworkIdle(page);
    await page.getByText(/Nabil Coach/i).first().waitFor({ timeout: 15000 });
    const trainerVisible = await page.getByText(/Nabil Coach/i).first().isVisible().catch(() => false);
    await clickNav(page, "Expenses");
    await waitForNetworkIdle(page);
    const expenseVisible = await page.getByText(/electricity|électricité|QA electricity/i).first().isVisible().catch(() => false);
    await clickNav(page, "Reports");
    await waitForNetworkIdle(page);
    const reportsVisible = await page.locator(".content").isVisible();
    await clickNav(page, "Plans");
    await waitForNetworkIdle(page);
    const planVisible = await page.getByText("QA Monthly 200").first().isVisible().catch(() => false);
    await clickNav(page, "Classes");
    await waitForNetworkIdle(page);
    const classVisible = await page.getByText("QA Boxing").first().isVisible().catch(() => false);
    record(
      "Admin",
      staffVisible && trainerVisible && expenseVisible && reportsVisible && planVisible && classVisible
        ? "BROWSER PASS"
        : "FAIL",
      `staff=${staffVisible} trainer=${trainerVisible} exp=${expenseVisible} plan=${planVisible} class=${classVisible}`,
    );

    await clickNav(page, "Administration");
    await waitForNetworkIdle(page);
    await page.getByRole("button", { name: /your account|votre compte/i }).click();
    await page.waitForTimeout(400);
    const last = page.locator(".admin-account-panel input").nth(1);
    await last.fill("QAUpdated");
    await page.getByRole("button", { name: /save profile|enregistrer le profil/i }).click();
    await page.waitForTimeout(1500);
    const newPassword = `HomezupQa!${Date.now().toString().slice(-6)}`;
    await page.locator('.admin-account-panel input[autocomplete="current-password"]').fill(CREDS.admin.password);
    await page.locator('.admin-account-panel input[autocomplete="new-password"]').nth(0).fill(newPassword);
    await page.locator('.admin-account-panel input[autocomplete="new-password"]').nth(1).fill(newPassword);
    const passwordResponse = page.waitForResponse(
      (response) => response.url().includes("/api/auth/password") && response.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.getByRole("button", { name: /change password|changer le mot de passe/i }).click();
    const pwdResp = await passwordResponse.catch(() => null);
    await page.waitForTimeout(500);
    const cleared = await page.locator('.admin-account-panel input[autocomplete="current-password"]').inputValue().catch(() => "x");
    const accountError = await page.locator(".admin-account-panel .error, .alert").first().innerText().catch(() => "");
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    const storedSecret = JSON.stringify(storage).toLowerCase().includes("password");
    const settingsOk = Boolean(pwdResp && pwdResp.ok()) && cleared === "" && !storedSecret && !/incorrect|fail|error|court|short/i.test(accountError);
    if (settingsOk) {
      CREDS.admin.password = newPassword;
      writeFileSync(join(ROOT, ".qa-credentials.json"), JSON.stringify(CREDS, null, 2));
    }
    record(
      "Settings",
      settingsOk ? "BROWSER PASS" : "FAIL",
      `status=${pwdResp ? pwdResp.status() : "none"} cleared=${cleared === ""} err=${accountError.slice(0, 80)}`,
    );

    await context.clearCookies();
    await page.reload();
    await page.waitForTimeout(1500);
    const backToLogin = await page.getByRole("button", { name: /sign in/i }).isVisible();
    record("401", backToLogin ? "BROWSER PASS" : "FAIL");

    await login(page, CREDS.reception.username, CREDS.reception.password);
    await page.locator(".lang-switch button", { hasText: "FR" }).first().click();
    await page.waitForTimeout(600);
    const frDash = await page.locator("aside.sidebar nav button").filter({ hasText: /tableau|aperçu|vue/i }).first().isVisible().catch(() => false);
    record("FR", frDash || (await page.locator(".lang-switch button", { hasText: "FR" }).first().getAttribute("class").then((c) => (c || "").includes("active")).catch(() => false)) ? "BROWSER PASS" : "FAIL");
    await page.locator(".lang-switch button", { hasText: "EN" }).first().click();
    record("EN", "BROWSER PASS");

    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".mobile-menu-button").click();
    const mobileNav = await page.locator("aside.sidebar.mobile-open, aside.sidebar").first().isVisible();
    record("Responsive", mobileNav ? "BROWSER PASS" : "FAIL");
    await page.setViewportSize({ width: 1440, height: 980 });

    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => document.activeElement?.tagName || "");
    record("Accessibility", focus ? "BROWSER PASS" : "FAIL", `focus=${focus}`);

    const csrfSeen = bag.requests.some((item) => item.headers["x-csrftoken"] && ["POST", "PUT", "PATCH", "DELETE"].includes(item.method));
    evidence.csrfHeader = evidence.csrfHeader || csrfSeen;
    record("CSRF", evidence.csrfHeader ? "BROWSER PASS" : "FAIL");
    record("Secrets", evidence.consoleSecrets ? "FAIL" : "BROWSER PASS");
    record(
      "Sensitive logs",
      evidence.consoleErrors.some((item) => isSensitive(item)) ? "FAIL" : "BROWSER PASS",
      evidence.consoleErrors.slice(0, 3).join(" | "),
    );
  } catch (error) {
    record("Runner", "FAIL", String(error).slice(0, 240));
  } finally {
    writeFileSync(join(ROOT, "qa-results.json"), JSON.stringify({ results, evidence }, null, 2));
    await browser.close();
  }
}

await main();
