// The send of the sign-up when something fails: the household read, the Turnstile check, or the submit call.
// Each failure gets its own host line, and the guest can always send again.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, said, OUT } from "./harness.mjs";

const env = await e2e();

const SEND = /Yes, send it/;
const json = (data, status = 200) => (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
const submits = (calls) => calls.filter((c) => c.path === "/api/submit");

// A fake Turnstile script. window.__ts.mode picks what the check does after it renders:
// "tap" wants a tap, and "none" does nothing. The test gives the token with window.__ts.token.
const fakeTurnstile = `window.turnstile = {
  render(sel, opts) {
    const ts = window.__ts;
    ts.renders++;
    if (ts.mode === "tap") setTimeout(() => opts["before-interactive-callback"](), 100);
    return "w1";
  },
  getResponse() { return window.__ts.token; },
  reset() { window.__ts.token = ""; },
};`;

// A page with the Turnstile check on. script: false makes the script fail to load, as a content blocker does.
function openWithTurnstile(mode, { script = true, routes = [], ...options } = {}) {
  return env.open({
    ...options,
    init: [`window.__ts = { mode: ${JSON.stringify(mode)}, token: "", renders: 0 };`],
    routes: [
      ["**/api/config", json({ turnstileSiteKey: "test-key" })],
      ["https://challenges.cloudflare.com/**", (r) => (script ? r.fulfill({ contentType: "text/javascript", body: fakeTurnstile }) : r.abort())],
      ...routes,
    ],
  });
}

async function toConfirm(page) {
  await said(page, "Whose name goes on the envelope?");
  await page.getByLabel("Name on the envelope").fill("The Test Family");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Who lives at your house").fill("Ann and Bo");
  await page.getByLabel("Who lives at your house").press("Enter");
  await said(page, "Where should we mail your card?");
  await page.getByLabel("Street address").fill("1428 Maple");
  await page.getByRole("button", { name: /1428 Maple Avenue/ }).click();
  await said(page, "Apartment or unit?");
  await page.getByRole("button", { name: "Skip" }).click();
  await said(page, "We'll mail your card to:");
}

const alert = (page, text) => page.getByRole("alert").filter({ hasText: text }).waitFor();
const sendEnabled = (page) => page.waitForFunction(() => document.getElementById("send") && !document.getElementById("send").disabled);

describe("the send", { concurrency: true }, () => {
  test("a household read that fails while the guest types is asked again at the send", async () => {
    let reads = 0;
    const household = (r) => (reads++ === 0 ? json({ error: "household_failed" }, 502)(r) : json({ members: [{ type: "adult" }, { type: "adult" }] })(r));
    const { page, calls } = await env.open({ routes: [["**/api/household", household]] });
    await toConfirm(page);
    assert.equal(reads, 1);

    // The tap reads the household again and sends. The fake API fails the first submit, so a second tap signs up.
    await page.getByRole("button", { name: SEND }).click();
    await alert(page, "Something went wrong. Try again? (server)");
    assert.equal(reads, 2);
    await sendEnabled(page);
    await page.getByRole("button", { name: SEND }).click();
    await said(page, "Thank you.");
    assert.equal(submits(calls).length, 2);
  });

  test("a household read that fails at the send gets its own line", async () => {
    const { page, calls } = await env.open({ routes: [["**/api/household", json({ error: "household_failed" }, 502)]] });
    await toConfirm(page);
    await page.getByRole("button", { name: SEND }).click();
    await alert(page, "We couldn't read who lives at your house.");
    assert.equal(submits(calls).length, 0);
    await sendEnabled(page);
  });

  test("a tap before the check has its token waits for the token", async () => {
    const { page, calls } = await openWithTurnstile("none");
    await toConfirm(page);
    // The check has no token yet, for example on a slow phone. The send waits and sends nothing.
    await page.getByRole("button", { name: SEND }).click();
    await page.waitForFunction(() => document.getElementById("send").disabled);
    assert.equal(submits(calls).length, 0);
    await page.evaluate(() => { window.__ts.token = "fake-token"; });
    await alert(page, "Something went wrong");
    assert.deepEqual(submits(calls).map((c) => c.body.turnstileToken), ["fake-token"]);

    // The page resets the check after a failure. A quick second tap waits for the new token, and sends no empty token.
    await sendEnabled(page);
    assert.equal(await page.evaluate(() => window.__ts.token), "");
    await page.getByRole("button", { name: SEND }).click();
    await page.evaluate(() => { window.__ts.token = "fake-token-2"; });
    await said(page, "Thank you.");
    assert.deepEqual(submits(calls).map((c) => c.body.turnstileToken), ["fake-token", "fake-token-2"]);
  });

  test("a check that wants a tap asks the guest to tap it", async () => {
    const { page, calls } = await openWithTurnstile("tap");
    await toConfirm(page);
    await page.getByRole("button", { name: SEND }).click();
    await alert(page, "Tap the box below so we know you're not a robot.");
    // The guest taps the check box, and the token arrives. The send that waits goes on.
    await page.evaluate(() => { window.__ts.token = "tapped-token"; });
    await page.waitForFunction(() => document.querySelector("#error")?.textContent.includes("Something went wrong") || document.querySelector("#say")?.textContent.includes("Thank you"));
    assert.deepEqual(submits(calls).map((c) => c.body.turnstileToken), ["tapped-token"]);
  });

  test("a check that cannot load says so, and sends nothing", async () => {
    const { page, calls } = await openWithTurnstile("none", { script: false, viewport: { width: 400, height: 860 } });
    await toConfirm(page);
    await page.getByRole("button", { name: SEND }).click();
    await alert(page, "Our robot check didn't load.");
    await page.screenshot({ path: `${OUT}/submit-no-check-400.png` });
    assert.equal(submits(calls).length, 0);
    await sendEnabled(page);
  });

  test("each submit failure code gets its own line", async () => {
    const replies = [
      [json({ error: "missing_turnstileToken" }, 400), "Our robot check didn't finish."],
      [json({ error: "turnstile_failed" }, 403), "Our robot check didn't pass."],
      [json({ error: "slow_down" }, 429), "That's a lot of tries!"],
      [json({ error: "sheet_failed" }, 502), "We can't reach our address book right now."],
      [(r) => r.abort(), "We can't reach our server."],
      [json({ error: "server_error" }, 500), "Something went wrong. Try again? (server_error)"],
    ];
    let n = 0;
    const { page } = await env.open({ routes: [["**/api/submit", (r) => replies[n++][0](r)]] });
    await toConfirm(page);
    for (const [, line] of replies) {
      await sendEnabled(page);
      await page.getByRole("button", { name: SEND }).click();
      await alert(page, line);
    }
  });
});
