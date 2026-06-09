#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const EXTENSION = "/Users/sashikantkumar/Desktop/Projects/focus-lock/extension";
const PROFILE = "/private/tmp/focus-lock-e2e-profile";

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`
    ]
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent("serviceworker", { timeout: 10000 });
    }

    assert.ok(worker.url().startsWith("chrome-extension://"), "extension service worker loaded");
    const extensionId = new URL(worker.url()).host;

    const driver = await context.newPage();
    await driver.goto(`chrome-extension://${extensionId}/popup.html`);

    const invalid = await driver.evaluate(() =>
      chrome.runtime.sendMessage({ type: "START_LOCK", minutes: 0 })
    );
    assert.equal(invalid.ok, false, "invalid timer is rejected");

    const validation = await driver.evaluate(() =>
      chrome.runtime.sendMessage({ type: "VALIDATE_RULES" })
    );
    assert.equal(validation.ok, true, "Chrome accepts DNR regex rules");

    const added = await driver.evaluate(() =>
      chrome.runtime.sendMessage({ type: "ADD_SITE", site: "example.com" })
    );
    assert.equal(added.ok, true, "custom site can be added");
    assert.equal(added.sites.custom.some((site) => site.domain === "example.com"), true);

    const started = await driver.evaluate(() =>
      chrome.runtime.sendMessage({ type: "START_LOCK", minutes: 1 })
    );
    assert.equal(started.ok, true, "one-minute lock starts");
    assert.equal(started.state.active, true, "started lock is active");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await assertText(popup, "Locked");

    const selfTest = await context.newPage();
    await selfTest.goto(`chrome-extension://${extensionId}/self-test.html`);
    await selfTest.getByRole("button", { name: "Run" }).click();
    await selfTest.waitForFunction(() => {
      const statuses = [...document.querySelectorAll("#results li span:last-child")];
      return statuses.length >= 5 && statuses.every((node) => node.textContent !== "Running");
    });
    const failed = await selfTest.locator(".fail").count();
    assert.equal(failed, 0, "self-test page reports no failures");

    const instagram = await context.newPage();
    const instagramResponse = await instagram.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded",
      timeout: 10000
    }).catch((error) => error);
    assert.match(String(instagramResponse), /ERR_BLOCKED_BY_CLIENT|net::ERR_BLOCKED_BY_CLIENT|blocked/i);

    const customSite = await context.newPage();
    const customResponse = await customSite.goto("https://example.com/", {
      waitUntil: "domcontentloaded",
      timeout: 10000
    }).catch((error) => error);
    assert.match(String(customResponse), /ERR_BLOCKED_BY_CLIENT|net::ERR_BLOCKED_BY_CLIENT|blocked/i);

    const neutral = await context.newPage();
    await neutral.goto("data:text/html,<h1>ok</h1>");
    await assertText(neutral, "ok");

    console.log(`extension e2e tests ok (${extensionId})`);
  } finally {
    await context.close();
  }
}

async function assertText(page, text) {
  await page.waitForFunction(
    (expected) => document.body && document.body.innerText.includes(expected),
    text
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
