// The glint: as soon as the room shows, for every visitor, a gold sparkle shows now and then on a tap area of a hidden extra
// that the guest has not found. It goes round the extras, skips the extras with no tap area, and stops for an extra once the guest finds it.
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

// A first-time visitor has no family in this browser. The glint shows on the room while the form waits for an answer,
// a tap on an extra counts in this browser alone, and the glint then skips that extra.
for (const viewport of [{ width: 400, height: 844 }, { width: 360, height: 640 }, { width: 1440, height: 900 }]) {
  test(`a first-time visitor on the form sees the glint, at ${viewport.width} wide`, async () => {
    const touch = viewport.width < 800;
    const { page, hc, calls } = await env.open({ viewport, hasTouch: touch, party: PARTY, wait: "eggs" });
    await page.locator("#f-envelope").waitFor();
    const focus = () => page.evaluate(() => document.activeElement?.id ?? "");
    const focused = await focus();
    await hc.pause();
    await hc.stillHosts();
    await hc.stillGuests();
    const { GLINT } = await hc.constants();
    assert.equal((await hc.glint()).on, true, "the glint runs with the form on screen");
    const seen = await watch(page, GLINT.every * 3 + 1);
    assert.ok(seen.length >= 3, `three glints in ${GLINT.every * 3 + 1} scene seconds: ${JSON.stringify(seen)}`);
    // The glint shows on the room, inside the stage, and never on the dialog.
    await advanceUntil(page, (hc) => hc.glint().shown?.egg === "presents", null, { max: GLINT.every * IN_ROOM.length + 1 });
    const { x, y } = (await hc.glint()).shown;
    const p = await hc.toScreen(x, y);
    const boxes = await page.evaluate(() => ["stage", "dialog"].map((id) => document.getElementById(id).getBoundingClientRect().toJSON()));
    const [stage, dialog] = boxes;
    const reach = GLINT.peak.arm * (await hc.scale());
    assert.ok(p.x - reach >= stage.left && p.x + reach <= stage.right && p.y - reach >= stage.top && p.y + reach <= stage.bottom, `on the stage: ${JSON.stringify({ p, reach, stage })}`);
    assert.ok(p.y + reach < dialog.top || p.x + reach < dialog.left, `clear of the dialog: ${JSON.stringify({ p, reach, dialog })}`);
    await hc.advance(GLINT.seconds * 0.3 - (await hc.glint()).shown.age);
    assert.equal(await hc.pixel(x, y), "#ffffff");
    await page.screenshot({ path: `${OUT}/glint-form-${viewport.width}.png` });
    // The glint takes no focus from the form.
    assert.equal(await focus(), focused);

    // A tap on the fire, with no family: the extra counts in this browser, no call goes to the Worker, and the fire glints no more.
    const fire = await hc.spotCenter("fire");
    await tapRoom(page, fire.x, fire.y, { touch });
    await page.waitForFunction(() => !window.__hc.counter().missing.includes("fire"));
    assert.equal(await hc.interactionsSent(), 0);
    assert.deepEqual(calls.filter((c) => c.path === "/api/interaction"), []);
    const after = await watch(page, GLINT.every * IN_ROOM.length + 2);
    assert.ok(after.length && !after.some((g) => g.egg === "fire"), `no glint on the fire: ${JSON.stringify(after)}`);
  });
}

describe("the glint", { concurrency: true }, () => {
  for (const reduce of ["no-preference", "reduce"]) {
    test(`the glint goes round the extras the guest has not found, with reduced motion ${reduce}`, async () => {
      const { page, hc } = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, reducedMotion: reduce, party: PARTY, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, { other1: 2, fam12345: 2 });
      // The glint runs during the thank-you too.
      assert.equal((await hc.glint()).on, true);
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

      // At its full size, the glint is a white diamond in a gold star, with four long gold arms.
      const { arm, body, white } = GLINT.peak;
      const peak = async () => {
        await advanceUntil(page, (hc) => hc.glint().shown?.egg === "presents", null, { max: times.every * IN_ROOM.length + 1 });
        await hc.advance(times.seconds * 0.3 - (await hc.glint()).shown.age);
        const { x, y } = (await hc.glint()).shown;
        const at = (points) => Promise.all(points.map(([dx, dy]) => hc.pixel(x + dx, y + dy)));
        const diamond = (from, to) => {
          const points = [];
          for (let dy = -to; dy <= to; dy++) for (let dx = -to; dx <= to; dx++) if (Math.abs(dx) + Math.abs(dy) >= from && Math.abs(dx) + Math.abs(dy) <= to) points.push([dx, dy]);
          return points;
        };
        const arms = [];
        for (let d = body + 1; d <= arm; d++) arms.push([-d, 0], [d, 0], [0, -d], [0, d]);
        return { heart: await at(diamond(0, white)), body: await at(diamond(white + 1, body)), arms: await at(arms) };
      };
      const expectPeak = (got) => {
        assert.ok(got.heart.length >= 13 && got.heart.every((c) => c === "#ffffff"), JSON.stringify(got.heart));
        assert.ok(got.body.every((c) => c === "#ffd27a"), JSON.stringify(got.body));
        assert.deepEqual(got.arms, Array((arm - body) * 4).fill("#ffd27a"));
      };
      expectPeak(await peak());
      await page.screenshot({ path: `${OUT}/glint-${reduce}.png` });

      // The lamp off: the glint keeps its full light on the dark blue room.
      const lamp = await hc.spotCenter("lamp");
      await tapRoom(page, lamp.x, lamp.y);
      assert.equal((await hc.eggs()).lampOn, false);
      expectPeak(await peak());
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
