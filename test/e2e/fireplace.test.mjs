// The fire: a tap on the fireplace makes the fire crackle, flare, and throw a burst of sparks and embers up the chimney.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { e2e, OUT, GARCIA, tuckNow, tapRoom, waitForFamilies, interactions } from "./harness.mjs";

const env = await e2e();
const HINT = "Poke the fire. It likes attention.";
// One guest family with no bubbles, so no bubble covers the fireplace in the screenshots.
const PARTY = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] }] };

const VARIANTS = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true, reduce: "no-preference" },
  { name: "phone-still", viewport: { width: 390, height: 844 }, touch: true, reduce: "reduce" },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false, reduce: "no-preference" },
];

// The room canvas around the fireplace, k screen pixels for each room pixel, as a PNG.
const zoom = (page, file) => page.evaluate(({ x, y, w, h, k }) => {
  const out = document.createElement("canvas");
  out.width = w * k;
  out.height = h * k;
  const g = out.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(document.getElementById("canvas"), x, y, w, h, 0, 0, w * k, h * k);
  return out.toDataURL("image/png").split(",")[1];
}, { x: 100, y: 16, w: 56, h: 58, k: 10 }).then((png) => writeFile(`${OUT}/${file}`, Buffer.from(png, "base64")));

test("the crackle is loud but does not clip, and it ends in under a second", async () => {
  const { page } = await env.open();
  const takes = await page.evaluate(async () => {
    const { crackle } = await import("/js/sound.js");
    const out = [];
    for (let i = 0; i < 5; i++) {
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      crackle(ctx, ctx.destination);
      const data = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, last = 0, sum = 0;
      data.forEach((v, j) => { sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); if (Math.abs(v) > 0.001) last = j; });
      out.push({ peak, ms: (last / 48000) * 1000, rms: Math.sqrt(sum / (last + 1)) });
    }
    return out;
  });
  for (const { peak, ms, rms } of takes) {
    // Louder than the soft pet sounds (peak under 0.2), but well under clipping.
    assert.ok(peak > 0.15 && peak < 0.7, `crackle peak ${peak}`);
    assert.ok(rms > 0.01, `crackle rms ${rms}`);
    assert.ok(ms > 300 && ms < 1000, `crackle length ${ms} ms`);
  }
  // Each crackle is a little different.
  assert.ok(new Set(takes.map((t) => t.peak.toFixed(4))).size > 1, "the crackles differ");
});

// Each variant opens its own page, so they run at the same time.
describe("the fire", { concurrency: true }, () => {
  for (const { name, viewport, touch, reduce } of VARIANTS) {
    test(`a tap on the fire throws sparks, on ${name}`, async () => {
      const { page, hc, calls } = await env.open({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: reduce, party: PARTY, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, { other1: 2, fam12345: 2 });
      await tuckNow(page);
      await hc.stillHosts();
      await hc.stillGuests();
      // The guests stand at the front of the room, clear of the fire and the hosts.
      for (const [familyId, index, x] of [["fam12345", 0, 132], ["fam12345", 1, 148], ["other1", 0, 172], ["other1", 1, 188]]) await hc.place({ familyId, index }, x, 166);
      const { HOTSPOTS, TAP_PX } = await hc.constants();
      const fire = HOTSPOTS.find((h) => h.id === "fire");
      const center = { x: fire.x + fire.w / 2, y: fire.y + fire.h / 2 };
      const tapFire = (at = center) => tapRoom(page, at.x, at.y, { touch });

      // Jess hints at the fire until the guest finds it. The other hidden things are found, so the hint comes up soon.
      const hear = async (host) => {
        const p = await hc.pointOn({ host: true, name: host });
        await (touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
        return (await hc.sprite({ host: true, name: host })).bubble;
      };
      await hc.found("album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly", "toast");
      if (name === "phone") {
        let heard = false;
        for (let i = 0; i < 40 && !heard; i++) heard = (await hear("Jess")) === HINT;
        assert.ok(heard, "Jess hints at the fire");
        await page.waitForFunction(() => window.__hc.sprites({ host: true }).every((s) => !s.bubble));
      }

      // The tap: a burst of sparks and embers, a flare, a crackle, and the corners round the fireplace.
      // The scene clock stops, so the sparks and the corners wait for the checks, and the test moves the clock by hand.
      await hc.spySounds(["crackle", "select"]);
      assert.equal((await hc.fire()).bursts, 0);
      await hc.pause();
      await tapFire();
      const start = await hc.fire();
      assert.equal(start.bursts, 1);
      assert.ok(start.sparks > 0, `sparks: ${start.sparks}`);
      assert.ok(start.flare > 0, `the fire flares: ${start.flare}`);
      assert.equal(await hc.pressed(), "fire");
      assert.deepEqual(await hc.sounds(), ["crackle"]);
      const found = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.found")));
      assert.ok(found.includes("fire"), `the fire counts as found: ${found}`);
      // The tap goes on the record for the family this browser signed up.
      assert.deepEqual((await interactions(page, calls)).map((c) => c.egg).filter((e) => e === "fire"), ["fire"]);

      // The sparks fly up out of the fireplace and stay in the box over the fire and the chimney.
      // With reduced motion, a few sparks glow above the flames and fade where they are.
      // The page notes the fire at each step of 1/30 second, for 2 seconds.
      const steps = await page.evaluate(() => Array.from({ length: 60 }, () => ({ at: window.__hc.advance(1 / 30), ...window.__hc.fire() })));
      for (const { at, box, bounds, moving } of steps.filter((s) => s.box)) {
        assert.ok(box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1, `at ${at}, the sparks stay over the fire: ${JSON.stringify(box)}`);
        assert.equal(moving, reduce === "no-preference", "the sparks move");
      }
      const top = Math.min(...steps.filter((s) => s.box).map((s) => s.box.y0));
      if (reduce === "no-preference") assert.ok(top < fire.y, `the sparks fly up out of the fireplace: ${top}`);
      else assert.ok(top >= fire.y, `the still sparks stay in the fireplace: ${top}`);
      // The flare dies down, and the sparks and the flare go out in about 2 seconds.
      assert.ok(steps[5].flare < start.flare, "the flare dies down");
      assert.deepEqual([steps.at(-1).box, steps.at(-1).flare], [null, 0], "the sparks and the flare go out in 2 seconds");

      // A screenshot of the sparks 0.22 seconds after a tap, on the stopped clock.
      if (reduce === "no-preference") {
        await tapFire();
        await hc.advance(0.22);
        await page.screenshot({ path: `${OUT}/fire-${name}.png` });
        if (name === "phone") await zoom(page, "fire-zoom.png");
        await hc.advance(2);
      }

      // Each fast tap gives its own burst and crackle, but the sparks never pass the cap.
      const taps = 20;
      const before = (await hc.fire()).bursts;
      await hc.sounds();
      for (let i = 0; i < taps; i++) await tapFire();
      const many = await hc.fire();
      assert.equal(many.bursts, before + taps);
      const live = many.sparks + many.embers;
      assert.ok(live <= many.max, `${live} sparks and embers, cap ${many.max}`);
      // With motion, 20 bursts throw far more than the cap, so the cap holds them back. Reduced motion throws only a few.
      if (reduce === "no-preference") assert.ok(live > many.max / 2, `the cap is full: ${live}`);
      assert.deepEqual(await hc.sounds(), Array(taps).fill("crackle"));
      await hc.advance(2);
      assert.equal((await hc.fire()).box, null, "the sparks of the fast taps go out");

      if (!touch) return;
      // The fire takes a finger-sized tap on a phone.
      const areas = await hc.hotspotAreas(TAP_PX.touch);
      assert.ok(areas.fire.w >= 43 && areas.fire.h >= 43, `fire: ${JSON.stringify(areas.fire)}`);
      // The things round the room still find their own taps, and the chimney and the wall find nothing.
      await hc.catchHotspots();
      const finds = async ({ x, y }) => {
        await tapRoom(page, x, y);
        return (await hc.hotspotHits()).join(",") || null;
      };
      for (const h of HOTSPOTS) assert.equal(await finds({ x: h.x + h.w / 2, y: h.y + h.h / 2 }), h.id, `a tap on the center of ${h.id}`);
      assert.equal(await finds({ x: fire.x + 1, y: fire.y + 1 }), "fire", "a tap on the corner of the frame");
      assert.equal(await finds({ x: 128, y: 28 }), null, "a tap on the chimney");
      assert.equal(await finds({ x: 100, y: 20 }), null, "a tap on the wall");
      // A host who stands in front of the fire takes a tap on the host, and the fire above still takes its own tap.
      await hc.place({ host: true, name: "Jesse" }, 128, 104);
      const bursts = (await hc.fire()).bursts;
      const line = await hear("Jesse");
      assert.ok(line, "Jesse says a line");
      assert.deepEqual(await hc.hotspotHits(), [], "a tap on Jesse by the fire finds no hidden thing");
      assert.equal((await hc.fire()).bursts, bursts);
      assert.equal(await finds(center), "fire", "the fire over Jesse's head");

      if (name === "phone") {
        // After the guest finds the fire, Jess drops the hint.
        const after = [];
        for (let i = 0; i < 12; i++) after.push(await hear("Jess"));
        assert.ok(!after.includes(HINT), `no fire hint after the fire: ${after}`);
        // With the lamp off, the sparks glow in the dark room.
        // After the reload, the camera zooms in on the family behind the thank-you. tuckNow brings back the whole room,
        // so the tap on the lamp lands on the lamp.
        await page.reload();
        await page.waitForFunction(() => window.__hc?.loaded().eggs);
        await tuckNow(page);
        await hc.stillHosts();
        const lamp = HOTSPOTS.find((h) => h.id === "lamp");
        await tapRoom(page, lamp.x + lamp.w / 2, lamp.y + lamp.h / 2);
        await page.waitForFunction(() => !window.__hc.eggs().lampOn);
        await hc.pause();
        await tapFire();
        await hc.advance(0.12);
        await zoom(page, "fire-zoom-dark.png");
        await page.screenshot({ path: `${OUT}/fire-phone-dark.png` });
      }
    });
  }
});
