// The glint: after the thank-you, a small gold twinkle shows now and then on a tap area of a hidden extra that the guest
// has not found. It goes round the extras, skips the extras with no tap area, and stops for an extra once the guest finds it.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, tuckNow, tapRoom, waitForFamilies, advanceUntil } from "./harness.mjs";

const env = await e2e();
// No bubbles, so no bubble covers a glint in the screenshots.
const PARTY = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] }] };
// The extras with a tap area in the room. The cars, the pets, and the silly looks have none.
const IN_ROOM = ["album", "lamp", "star", "menorah", "toast", "plants", "fire", "presents", "dreidel"];

// The glints that show in `seconds` of scene time, in order: [{ egg, id, x, y }]. The clock must be stopped.
async function watch(page, seconds) {
  return page.evaluate((seconds) => {
    const hc = window.__hc;
    const seen = [];
    let age = Infinity;
    // Steps of 0.1 second see every glint, since each one shows for most of a second.
    for (let t = 0; t < seconds; t += 0.1) {
      hc.advance(0.1);
      const s = hc.glint().shown;
      // A new glint is younger than the one before it.
      if (s && s.age < age) seen.push({ egg: s.egg, id: s.id, x: s.x, y: s.y });
      age = s ? s.age : Infinity;
    }
    return seen;
  }, seconds);
}

test("a new guest sees no glint during the form", async () => {
  const { page, hc } = await env.open({ wait: "eggs" });
  await hc.pause();
  await hc.advance(30);
  const g = await hc.glint();
  assert.equal(g.on, false);
  assert.equal(g.shown, null);
  await page.locator("#f-envelope").waitFor();
});

describe("the glint", { concurrency: true }, () => {
  for (const reduce of ["no-preference", "reduce"]) {
    test(`the glint goes round the extras the guest has not found, with reduced motion ${reduce}`, async () => {
      const { page, hc } = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, reducedMotion: reduce, party: PARTY, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, { other1: 2, fam12345: 2 });
      // No glint before the thank-you tucks away.
      assert.equal((await hc.glint()).on, false);
      await tuckNow(page);
      await hc.pause();
      await hc.stillHosts();
      await hc.stillGuests();
      const { GLINT } = await hc.constants();
      const times = reduce === "reduce" ? GLINT.still : GLINT;

      // One glint at a time, every few seconds. In two full rounds, each extra with a tap area glints, and no other extra.
      const rounds = await watch(page, times.every * IN_ROOM.length * 2 + 2);
      assert.deepEqual([...new Set(rounds.map((g) => g.egg))].sort(), [...IN_ROOM].sort());
      // The extras take turns in the order of their list.
      assert.deepEqual(rounds.slice(0, IN_ROOM.length).map((g) => g.egg), rounds.slice(IN_ROOM.length, IN_ROOM.length * 2).map((g) => g.egg));
      // The plants take turns too, so the glint visits more than one plant.
      assert.ok(new Set(rounds.filter((g) => g.egg === "plants").map((g) => g.id)).size > 1);

      // The glint shows for its time, then hides until the next one.
      await advanceUntil(page, (hc) => hc.glint().shown?.age > 0);
      await advanceUntil(page, (hc) => !hc.glint().shown);
      const gap = await advanceUntil(page, (hc) => !!hc.glint().shown, null, { max: times.every + 1 });
      assert.ok(gap > times.every - times.seconds - 0.1, `the gap between two glints: ${gap}`);

      // At its peak, the glint is a white heart with four long gold arms.
      const peak = async () => {
        await advanceUntil(page, (hc) => hc.glint().shown?.egg === "presents", null, { max: times.every * IN_ROOM.length + 1 });
        await hc.advance(times.seconds / 2 - (await hc.glint()).shown.age);
        const { x, y } = (await hc.glint()).shown;
        const ring = (d) => Promise.all([[-d, 0], [d, 0], [0, -d], [0, d]].map(([dx, dy]) => hc.pixel(x + dx, y + dy)));
        return { heart: [await hc.pixel(x, y), ...(await ring(1))], arms: [...(await ring(2)), ...(await ring(3))] };
      };
      const light = await peak();
      assert.deepEqual(light.heart, Array(5).fill("#ffffff"));
      assert.deepEqual(light.arms, Array(8).fill("#ffd27a"));
      await page.screenshot({ path: `${OUT}/glint-${reduce}.png` });

      // The lamp off: the glint keeps its full light on the dark blue room.
      const lamp = await hc.spotCenter("lamp");
      await tapRoom(page, lamp.x, lamp.y);
      assert.equal((await hc.eggs()).lampOn, false);
      const dark = await peak();
      assert.deepEqual(dark.heart, Array(5).fill("#ffffff"));
      assert.deepEqual(dark.arms, Array(8).fill("#ffd27a"));
      await page.screenshot({ path: `${OUT}/glint-dark-${reduce}.png` });

      // The guest found the lamp with that tap, and finds the fire now. Neither glints again.
      const fire = await hc.spotCenter("fire");
      await tapRoom(page, fire.x, fire.y);
      const after = await watch(page, times.every * IN_ROOM.length + 2);
      const eggs = new Set(after.map((g) => g.egg));
      assert.ok(!eggs.has("lamp") && !eggs.has("fire"), `no glint on a found extra: ${[...eggs]}`);
      assert.equal(eggs.size, IN_ROOM.length - 2);

      // A guest who finds every extra in the room sees no glint.
      await hc.found(...IN_ROOM);
      assert.deepEqual(await watch(page, times.every * 2 + 1), []);
    });
  }
});

test("a glint stops at once when the guest finds its extra", async () => {
  const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, party: PARTY, mine: [GARCIA], wait: "eggs" });
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  await tuckNow(page);
  await hc.pause();
  await hc.stillHosts();
  await advanceUntil(page, (hc) => hc.glint().shown?.egg === "presents" && hc.glint().shown.age > 0.2);
  const c = await hc.spotCenter("presents");
  await tapRoom(page, c.x, c.y, { touch: false });
  await hc.advance(1 / 30);
  assert.equal((await hc.glint()).shown, null);
});
