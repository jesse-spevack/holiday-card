// The record of the hidden extras: each tap from a browser with a family tells the Worker, and a fast tapper sends few calls.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, GARCIA, tuckNow, tapRoom, until, interactions } from "./harness.mjs";

const env = await e2e();
const EARLIER = { ...GARCIA, id: "fam00001", token: "old", name: "The Garcias, 2025" };

async function room(options) {
  const opened = await env.open({ hasTouch: true, wait: "eggs", ...options });
  const { page, hc } = opened;
  if (options.mine) await tuckNow(page);
  const tap = async (id) => {
    const c = await hc.spotCenter(id);
    await tapRoom(page, c.x, c.y);
  };
  return { ...opened, tap };
}

// Each test opens its own page, so they run at the same time.
describe("the record of the hidden extras", { concurrency: true }, () => {
  test("a tap sends the egg for the family this browser signed up last, at most once in the gap", async () => {
    const { page, hc, calls, tap } = await room({ mine: [EARLIER, GARCIA] });
    const garcia = (egg) => ({ id: GARCIA.id, token: GARCIA.token, egg });

    // five fast taps on the lamp: the lamp turns each time, and one call goes out
    for (let i = 0; i < 5; i++) await tap("lamp");
    assert.equal((await hc.eggs()).lampOn, false);
    await tap("window");
    await page.waitForFunction(() => window.__hc.eggs().star);
    await tap("menorah");
    await page.waitForFunction(() => window.__hc.eggs().lighting);
    assert.deepEqual(await interactions(page, calls), [garcia("lamp"), garcia("star"), garcia("menorah")]);

    // after the gap, the same egg sends again, because the record counts each visit, not only the first
    await hc.trackGap(0);
    await tap("lamp");
    assert.deepEqual((await interactions(page, calls)).slice(3), [garcia("lamp")]);
  });

  test("a browser with no family sends nothing", async () => {
    const { page, hc, calls, tap } = await room({});
    await tap("lamp");
    assert.equal((await hc.eggs()).lampOn, false);
    await tap("window");
    await page.waitForFunction(() => window.__hc.eggs().star);
    assert.equal(await hc.interactionsSent(), 0);
    assert.deepEqual(await interactions(page, calls), []);
  });

  test("a failed call does not stop the extra and shows no error", async () => {
    const tries = [];
    const finished = [];
    const { page, hc, tap } = await room({
      mine: [GARCIA],
      routes: [["**/api/interaction", (r) => { tries.push(1); return r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"server_error"}' }); }]],
    });
    page.on("requestfinished", (r) => r.url().endsWith("/api/interaction") && finished.push(r));
    await hc.trackGap(0);
    await tap("lamp");
    await tap("lamp");
    await page.waitForFunction(() => window.__hc.eggs().lampOn);
    assert.equal(await hc.interactionsSent(), 2);
    await until(() => finished.length === 2, "the two failed calls finish");
    // A task in the page after the replies, so the page has handled them.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    assert.equal(tries.length, 2);
    assert.equal(await page.locator("#error").filter({ hasText: /./ }).count(), 0);
  });
});
