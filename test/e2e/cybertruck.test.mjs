// The Cybertruck: now and then it drives past the window, and Eddie calls it out. It never shares the road with the Waymo.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT } from "./harness.mjs";

const env = await e2e();
const SHOUT = "Cybertruck!";
const WAYMO_BLUE = "#86c5ea";

// Watches the road and Eddie in the page, one record each frame, until the road is clear after `cars` cars, or `seconds` pass.
// Each record: t (scene time), car and truck (their x or null), bubble (Eddie's words), nextTruckIn,
// solid (the solid car pixels on the glass), stray (the solid pixels off the glass or not in the truck colors), blue (Waymo pixels).
const watch = (page, { cars, seconds }) => page.evaluate(({ cars, seconds }) => new Promise((done) => {
  const hc = window.__hc;
  const { WINDOW, TRUCK } = hc.constants();
  const { panes, y0, y1 } = WINDOW.glass;
  const onGlass = (x, y) => y >= y0 && y <= y1 && panes.some(([a, b]) => x >= a && x <= b);
  const truckColors = new Set(TRUCK.colors);
  const frames = [];
  const t0 = hc.time();
  let seen = 0;
  let last = null;
  const tick = () => {
    const e = hc.eggs();
    const kind = e.truck !== null ? "truck" : e.car !== null ? "car" : null;
    if (kind && kind !== last) seen++;
    last = kind;
    const px = kind ? hc.carPixels() : [];
    frames.push({
      t: hc.time(), car: e.car, truck: e.truck, nextTruckIn: e.nextTruckIn,
      bubble: hc.sprite({ host: true, name: "Eddie" }).bubble,
      solid: px.length,
      stray: px.filter(([x, y, c]) => !onGlass(x, y) || (kind === "truck" && !truckColors.has(c))).slice(0, 5),
      blue: px.filter(([, , c]) => c === "#86c5ea").length,
    });
    if ((seen >= cars && !kind) || hc.time() - t0 > seconds) done(frames);
    else requestAnimationFrame(tick);
  };
  tick();
}), { cars, seconds });

// The truck shows through the glass: some part of it is between the left edge of the left pane and the right edge of the right pane.
const inSight = (f, w) => f.truck !== null && f.truck + w - 1 >= 166 && f.truck <= 235;

describe("the Cybertruck", { concurrency: true }, () => {
  for (const reduce of ["no-preference", "reduce"]) {
    test(`the Cybertruck drives past, with reduced motion ${reduce}`, async () => {
      const { page, hc } = await env.open({ hasTouch: true, reducedMotion: reduce, wait: "eggs" });
      const { TRUCK } = await hc.constants();
      const start = await hc.eggs();
      assert.equal(start.truck, null);
      assert.ok(start.nextTruckIn > 50 && start.nextTruckIn <= 120, `the truck comes 60 to 120 seconds after the page opens: ${start.nextTruckIn}`);

      // The truck drives right. A Waymo sent at the same time waits until the road is clear.
      await hc.sendCybertruck(1);
      await hc.sendWaymo();
      const frames = await watch(page, { cars: 2, seconds: 30 });
      const truck = frames.filter((f) => f.truck !== null);
      const sight = frames.filter((f) => inSight(f, TRUCK.w));
      assert.ok(sight.length > 10, `the truck shows in the window: ${sight.length} frames`);

      // It draws only on the glass, in its own colors, with crisp pixels, and the Waymo is not on the road with it.
      for (const f of truck) {
        assert.deepEqual(f.stray, [], `at ${f.t.toFixed(2)} s, every truck pixel is on the glass and in the truck colors`);
        assert.equal(f.car, null);
        assert.equal(f.blue, 0, "no Waymo pixel while the truck is on the road");
      }
      assert.ok(Math.max(...truck.map((f) => f.solid)) > 120, "most of the truck shows at some point");

      // It drives right at a steady speed, or with reduced motion it stops in the window for about 5 seconds.
      const span = truck.at(-1).t - truck[0].t;
      if (reduce === "reduce") {
        assert.ok(truck.every((f) => f.truck === truck[0].truck), "the parked truck holds still");
        assert.ok(span > 4.5 && span < 5.5, `the truck stays about 5 seconds: ${span}`);
      } else {
        const speed = (truck.at(-1).truck - truck[0].truck) / span;
        assert.ok(speed > 14 && speed < 18, `the truck drives right at about 16 room pixels a second: ${speed}`);
        assert.ok(truck.every((f, i) => i === 0 || f.truck >= truck[i - 1].truck), "the truck never backs up");
      }

      // Eddie calls it out as it shows in the window, once, for about 4 seconds.
      const said = frames.findIndex((f) => f.bubble === SHOUT);
      assert.ok(said >= 0, "Eddie says Cybertruck!");
      assert.ok(inSight(frames[said], TRUCK.w), "Eddie talks while the truck shows");
      assert.ok(frames[said].t - sight[0].t < 0.1, `Eddie talks as the truck shows: ${frames[said].t - sight[0].t} s later`);
      const talk = frames.filter((f) => f.bubble === SHOUT);
      const length = talk.at(-1).t - talk[0].t;
      assert.ok(length > 3.5 && length < 4.6, `the bubble shows for about 4 seconds: ${length}`);
      assert.equal(frames.filter((f, i) => f.bubble === SHOUT && frames[i - 1]?.bubble !== SHOUT).length, 1, "Eddie says it once");

      // The Waymo comes after the truck is gone, with a short gap, and the truck comes back 60 to 120 seconds later.
      const gone = frames.indexOf(truck.at(-1)) + 1;
      assert.ok(frames[gone].nextTruckIn > 59 && frames[gone].nextTruckIn <= 120, `next truck in ${frames[gone].nextTruckIn}`);
      const waymo = frames.find((f) => f.car !== null);
      assert.ok(waymo, "the Waymo drives after the truck");
      assert.ok(waymo.t - frames[gone].t > 2.5, `the road stays clear a moment between cars: ${waymo.t - frames[gone].t} s`);
      assert.ok(frames.filter((f) => f.car !== null).every((f) => f.truck === null));

      // If Eddie talks already, he calls out the truck after he finishes, while the truck still shows.
      await hc.stillHosts();
      const eddie = await hc.pointOn({ host: true, name: "Eddie" });
      await page.touchscreen.tap(eddie.x, eddie.y);
      await page.waitForFunction(() => window.__hc.sprite({ host: true, name: "Eddie" }).bubble);
      const line = (await hc.sprite({ host: true, name: "Eddie" })).bubble;
      assert.notEqual(line, SHOUT);
      await hc.sendCybertruck(-1);
      const busy = await watch(page, { cars: 1, seconds: 15 });
      const shown = busy.findIndex((f) => inSight(f, TRUCK.w));
      assert.equal(busy[shown].bubble, line, "Eddie finishes his line first");
      const late = busy.findIndex((f) => f.bubble === SHOUT);
      assert.ok(late > shown, "then he says Cybertruck!");
      assert.ok(inSight(busy[late], TRUCK.w), "while the truck still shows");
      assert.ok(busy.slice(shown, late).every((f) => f.bubble === line || f.bubble === null));
      if (reduce === "no-preference") assert.ok(busy.filter((f) => f.truck !== null).every((f, i, a) => i === 0 || f.truck <= a[i - 1].truck), "the truck drives left");
    });
  }

  // For the PR: the truck in the window, on a phone and on a computer, and a close view of the window.
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
    test(`a screenshot of the Cybertruck, ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, wait: "eggs" });
      await hc.sendCybertruck(1);
      await page.waitForFunction(() => window.__hc.eggs().truck >= 157);
      await page.screenshot({ path: `${OUT}/cybertruck-${name}.png` });
      const a = await hc.toScreen(156, 2);
      const b = await hc.toScreen(246, 64);
      await page.screenshot({ path: `${OUT}/cybertruck-${name}-window.png`, clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } });
      assert.equal((await hc.sprite({ host: true, name: "Eddie" })).bubble, SHOUT);
    });
  }
});
