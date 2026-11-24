// The page reports each failure that the guest sees to the error log (public/js/report.js, POST /api/log).
// A report holds codes and flags only, never the guest's answers. Demo mode sends none.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, GARCIA, said, until } from "./harness.mjs";

const env = await e2e();
const reports = (calls) => calls.filter((c) => c.path === "/api/log").map((c) => c.body);
const FIELDS = ["code", "family", "online", "step", "where"];

async function toConfirm(page) {
  await said(page, "Whose name goes on the envelope?");
  await page.getByLabel("Name on the envelope").fill("The Report Family");
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

describe("the error reports", { concurrency: true }, () => {
  test("a failed send reports its step and code, and none of the guest's answers", async () => {
    const { page, calls } = await env.open();
    await toConfirm(page);
    // The fake API fails the first submit with the code "server".
    await page.getByRole("button", { name: /Yes, send it/ }).click();
    await page.getByRole("alert").filter({ hasText: "(server)" }).waitFor();
    await until(() => reports(calls).length === 1, "the report");
    const [sent] = reports(calls);
    assert.equal(sent.step, "submit");
    assert.equal(sent.code, "server");
    assert.equal(sent.online, true);
    assert.ok(Object.keys(sent).every((k) => FIELDS.includes(k)), `only allowed fields: ${Object.keys(sent)}`);
    const text = JSON.stringify(sent);
    for (const answer of ["Report Family", "Ann", "Maple", "Evanston", "60201"]) assert.ok(!text.includes(answer), `the report holds "${answer}"`);
  });

  test("a call that never reaches the Worker reports the path and the step", async () => {
    const { page, calls } = await env.open({ routes: [["**/api/submit", (r) => r.abort()]] });
    await toConfirm(page);
    await page.getByRole("button", { name: /Yes, send it/ }).click();
    await page.getByRole("alert").filter({ hasText: "We can't reach our server." }).waitFor();
    await until(() => reports(calls).length === 2, "two reports");
    assert.deepEqual(reports(calls).map((r) => [r.step, r.code]).sort(), [["fetch:/api/submit", "network"], ["submit", "network"]]);
  });

  test("an error that nothing caught is reported with the family id", async () => {
    const { page, calls } = await env.open({ mine: [GARCIA] });
    await page.evaluate(() => setTimeout(() => { throw new Error("report-test-boom"); }));
    await until(() => reports(calls).some((r) => r.step === "uncaught"), "the uncaught report");
    const sent = reports(calls).find((r) => r.step === "uncaught");
    assert.equal(sent.code, "report-test-boom");
    assert.equal(sent.family, GARCIA.id);
    // The harness fails a file that has a page error. This one is on purpose.
    env.errors.splice(0, env.errors.length, ...env.errors.filter((e) => !e.includes("report-test-boom")));
  });

  test("the harmless ResizeObserver warning of iOS Safari is not reported", async () => {
    const { page, calls } = await env.open();
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
      window.dispatchEvent(new ErrorEvent("error", { message: "after-the-warning" }));
    });
    await until(() => reports(calls).some((r) => r.code === "after-the-warning"), "the report after the warning");
    assert.deepEqual(reports(calls).map((r) => r.code), ["after-the-warning"]);
  });

  test("the same failure reports once in 30 seconds", async () => {
    const { page, calls, hc } = await env.open({ wait: "room", routes: [["**/api/party", (r) => r.abort()]] });
    await hc.pollParty();
    await hc.pollParty();
    await hc.pollParty();
    await until(() => reports(calls).length >= 1, "the report");
    assert.deepEqual(reports(calls).map((r) => r.step), ["fetch:/api/party"]);
  });

  test("demo mode sends no report", async () => {
    const { page, calls, hc } = await env.open({ query: "#demo", wait: "room", routes: [["**/api/party", (r) => r.abort()]] });
    await hc.pollParty();
    // A last call after the failed poll. When it arrives, a report from the poll would have arrived too.
    await page.evaluate(() => fetch("/api/after-poll").catch(() => {}));
    await until(() => calls.some((c) => c.path === "/api/after-poll"), "the last call");
    assert.deepEqual(reports(calls), []);
  });
});
