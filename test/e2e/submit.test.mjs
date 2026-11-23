// The send of the sign-up when something fails: the household read or the submit call.
// Each failure gets its own host line, and the guest can always send again.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, said, OUT, waitForFamilies } from "./harness.mjs";

const env = await e2e();

const SEND = /Yes, send it/;
const json = (data, status = 200) => (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
const submits = (calls) => calls.filter((c) => c.path === "/api/submit");

async function toConfirm(page, household = "Ann and Bo") {
  await said(page, "Whose name goes on the envelope?");
  await page.getByLabel("Name on the envelope").fill("The Test Family");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Who lives at your house").fill(household);
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

  test("a household read that always fails does not block the sign-up: the page guesses one adult for each name", async () => {
    const { page, calls } = await env.open({ routes: [["**/api/household", json({ error: "household_failed" }, 502)]] });
    await toConfirm(page, "Ann, Bo and Cy & Dee + Ed");
    await page.getByRole("button", { name: SEND }).click();
    // The fake API fails the first submit. The guess goes with it, and the family walks in.
    await alert(page, "Something went wrong. Try again? (server)");
    const [first] = submits(calls);
    assert.deepEqual(first.body.members.map((m) => m.type), ["adult", "adult", "adult", "adult", "adult"]);
    await waitForFamilies(page, { pending: 5 });
    await sendEnabled(page);
    await page.getByRole("button", { name: SEND }).click();
    await said(page, "Thank you.");
    await waitForFamilies(page, { fam12345: 5 });
  });

  test("the send carries no bot trap and no check token, and a filled trap goes with the send", async () => {
    const { page, calls } = await env.open({ viewport: { width: 400, height: 860 } });
    await toConfirm(page);
    // The trap is out of sight and out of the tab order.
    const trap = page.locator("#hc-extra");
    assert.equal(await trap.getAttribute("tabindex"), "-1");
    const box = await trap.boundingBox();
    assert.ok(box.x + box.width <= 0, "the trap is off screen");
    await page.getByRole("button", { name: SEND }).click();
    await alert(page, "Something went wrong. Try again? (server)");
    await page.screenshot({ path: `${OUT}/submit-fail-400.png` });
    const [first] = submits(calls);
    assert.deepEqual(Object.keys(first.body).sort(), ["address", "envelope", "household", "members"]);

    // A bot that fills every field fills the trap too.
    await page.evaluate(() => { document.getElementById("hc-extra").value = "https://spam.example"; });
    await sendEnabled(page);
    await page.getByRole("button", { name: SEND }).click();
    await said(page, "Thank you.");
    assert.equal(submits(calls)[1].body.extra, "https://spam.example");
  });

  test("each submit failure code gets its own line", async () => {
    const replies = [
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
