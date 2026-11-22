// The menorah in the window shows the night of Hanukkah 2026 in the guest's own time.
// A new night starts at 4 pm. One candle burns for each night, from the right end, and the shamash always burns.
// Outside Hanukkah, every candle burns. The tap on the menorah is in eggs.test.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, tapRoom, sceneWait } from "./harness.mjs";
import { hanukkahNight } from "../../public/js/hanukkah.js";

const env = await e2e();

// The local times to check, and the night of Hanukkah then. 0 is outside Hanukkah, when all eight candles burn.
const TIMES = [
  ["2026-11-22T18:00", 0, "before Hanukkah"],
  ["2026-12-04T15:59", 0, "one minute before the first night"],
  ["2026-12-04T18:00", 1, "night 1"],
  ["2026-12-06T15:59", 2, "night 3 at 3:59 pm is still night 2"],
  ["2026-12-06T16:01", 3, "night 3 at 4:01 pm"],
  ["2026-12-11T18:00", 8, "night 8"],
  ["2026-12-12T14:00", 8, "the afternoon of December 12 is still night 8"],
  ["2026-12-12T23:59", 8, "the end of December 12 is still night 8"],
  ["2026-12-13T09:00", 0, "after Hanukkah"],
];

// The candles from left to right, without the shamash, as "x" (burns) or "." (out). For example "......xx" on night 2.
async function row(hc) {
  const { candles } = await hc.eggs();
  return candles.filter((c) => !c.shamash).map((c) => (c.state === "out" ? "." : "x")).join("");
}
const expected = (n) => ".".repeat(8 - n) + "x".repeat(n);

// The color of the canvas at a flame, as [r, g, b]. A flame is warm yellow, and an unlit candle shows the night glass.
async function rgbAt(hc, x, y) {
  const hex = await hc.pixel(x, y);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
const burns = ([r, g, b]) => r > 200 && g > 140 && b < 200;

test("the night of Hanukkah, from the date alone", () => {
  for (const [local, night, what] of TIMES) assert.equal(hanukkahNight(new Date(local)), night, what);
});

describe("the menorah", { concurrency: true }, () => {
  test("one candle for each night, from the right end, and the shamash always burns", async () => {
    const { page, hc } = await env.open({ wait: "eggs" });
    const { flames, candles } = await hc.eggs();
    assert.equal(flames, 9, "the menorah holds eight candles and the shamash");
    assert.equal(candles.filter((c) => c.shamash).length, 1);
    assert.equal(candles[4].shamash, true, "the shamash stands in the middle");
    for (const [local, night, what] of TIMES) {
      const n = night || 8;
      await hc.setNow(local);
      await sceneWait(page, 0.05);
      assert.equal(await row(hc), expected(n), what);
      const now = await hc.eggs();
      assert.equal(now.menorahLit, n + 1, `${what}: the candles and the shamash`);
      assert.equal(now.candles[4].state, "lit", `${what}: the shamash burns`);
      // On the canvas: a flame over each candle that burns, and the night glass over each candle that does not.
      for (const c of now.candles) {
        const color = await rgbAt(hc, c.x, c.y);
        assert.equal(burns(color), c.state !== "out", `${what}: the candle at x ${c.x} shows ${color}`);
      }
    }
  });

  test("at 4 pm, the candle for the new night lights by itself", async () => {
    const { page, hc } = await env.open({ wait: "eggs" });
    await hc.setNow("2026-12-07T15:59:59");
    await sceneWait(page, 0.05);
    assert.equal(await row(hc), expected(3));
    await hc.setNow("2026-12-07T16:00:00");
    await sceneWait(page, 0.05);
    assert.equal(await row(hc), expected(4));
  });

  test("a tap lights only tonight's candles: the shamash first, then the newest candle, then to the right", async () => {
    const { page, hc } = await env.open({ hasTouch: true, wait: "eggs" });
    await hc.setNow("2026-12-06T18:00");
    await sceneWait(page, 0.05);
    assert.equal(await row(hc), expected(3));
    await hc.spySounds(["chime", "snuff"]);

    const c = await hc.spotCenter("menorah");
    await tapRoom(page, c.x, c.y);
    // Each frame, note each candle that comes alight, until the menorah is done.
    const order = await page.evaluate(() => new Promise((done) => {
      const seen = [];
      const look = () => {
        const e = window.__hc.eggs();
        for (const k of e.candles) if (k.state !== "out" && !seen.includes(k.x)) seen.push(k.x);
        if (e.lighting) requestAnimationFrame(look);
        else done(seen);
      };
      look();
    }));
    const { candles } = await hc.eggs();
    const shamash = candles.find((k) => k.shamash).x;
    const lit = candles.filter((k) => !k.shamash).slice(-3).map((k) => k.x);
    assert.deepEqual(order, [shamash, ...lit]);
    assert.equal(await row(hc), expected(3), "the other candles stay out");
    assert.deepEqual(await hc.sounds(), ["snuff", "chime:0", "chime:1", "chime:2", "chime:3"]);
    await page.locator(".wish", { hasText: "What miracles are you grateful for?" }).waitFor({ timeout: 1000 });
  });

  test("the guest's own time zone decides the night", async () => {
    // At 23:30 UTC on December 6, it is 3:30 pm in Los Angeles (night 2) and 8:30 am on December 7 in Tokyo (night 3).
    for (const [timezoneId, n] of [["America/Los_Angeles", 2], ["Asia/Tokyo", 3]]) {
      const { page, hc, ctx } = await env.open({ timezoneId, wait: "eggs" });
      await page.clock.setFixedTime(new Date("2026-12-06T23:30:00Z"));
      await sceneWait(page, 0.05);
      assert.equal(await row(hc), expected(n), timezoneId);
      await ctx.close();
    }
  });

  // The menorah, zoomed, on a phone. Each candle that burns has its flame right on its top.
  for (const [night, local] of [[1, "2026-12-04T18:00"], [4, "2026-12-07T18:00"], [8, "2026-12-11T18:00"]]) {
    test(`the menorah on night ${night}, on a phone`, async () => {
      const { page, hc } = await env.open({ wait: "eggs", deviceScaleFactor: 3, reducedMotion: "reduce" });
      await hc.setNow(local);
      await sceneWait(page, 0.1);
      assert.equal(await row(hc), expected(night));
      const a = await hc.toScreen(184, 32);
      const b = await hc.toScreen(222, 58);
      await page.screenshot({ path: `${OUT}/menorah-night-${night}.png`, clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } });
    });
  }
});
