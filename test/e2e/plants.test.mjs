// The plants: a tap on a potted plant makes it bloom, with a sparkle and a chime. When every plant blooms, the whole room blooms:
// petals drift down, every plant sparkles, a chord plays, and Audrey says so. The flowers stay for the rest of the visit.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { e2e, OUT, GARCIA, assertTucks, tapRoom, sceneWait } from "./harness.mjs";

const env = await e2e();
const HINT = "I bet the plants would love some attention.";
const BLOOM_LINE = "Everything is blooming!";

const VARIANTS = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true, reduce: "no-preference" },
  { name: "phone-still", viewport: { width: 390, height: 844 }, touch: true, reduce: "reduce" },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false, reduce: "no-preference" },
];

// The room canvas at k screen pixels for each room pixel, as a PNG file.
async function zoomShot(page, path, { x, y, w, h, k }) {
  const png = await page.evaluate(({ x, y, w, h, k }) => {
    const out = document.createElement("canvas");
    out.width = w * k;
    out.height = h * k;
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(document.getElementById("canvas"), x, y, w, h, 0, 0, w * k, h * k);
    return out.toDataURL("image/png").split(",")[1];
  }, { x, y, w, h, k });
  await writeFile(path, Buffer.from(png, "base64"));
}

describe("the plants", { concurrency: true }, () => {
  for (const { name, viewport, touch, reduce } of VARIANTS) {
    test(`a tap blooms a plant, and every plant in bloom blooms the room, on ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: reduce, wait: "eggs" });
      await hc.stillHosts();
      const { PLANTS } = await hc.constants();
      const ids = Object.keys(PLANTS);
      assert.equal(ids.length, 6);
      const center = (id) => ({ x: PLANTS[id].x + PLANTS[id].w / 2, y: PLANTS[id].y + PLANTS[id].h / 2 });
      const tap = (at) => tapRoom(page, at.x, at.y, { touch });
      // Waits until every flower on a plant is open and the sparkles are gone, so each flower center shows.
      const allOpen = (id) => page.waitForFunction((p) => {
        const s = window.__hc.plants();
        return s.bloomed.includes(p) && s.flowers.filter((f) => f.plant === p).every((f) => f.stage === "full") && !s.twinkles;
      }, id);

      // Before any tap, no plant blooms, and Audrey hints at the plants. The other hidden things are found, so the hint comes soon.
      assert.deepEqual((await hc.plants()).bloomed, []);
      if (name === "phone") {
        await hc.found("album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly", "toast");
        const lines = [];
        for (let i = 0; i < 8; i++) {
          const p = await hc.pointOn({ host: true, name: "Audrey" });
          await page.touchscreen.tap(p.x, p.y);
          lines.push((await hc.sprite({ host: true, name: "Audrey" })).bubble);
        }
        assert.ok(lines.includes(HINT), `Audrey hints at the plants: ${lines}`);
        await hc.stillHosts();
      }

      // A tap on each plant but the last blooms that plant only, with a twinkle and a chime one note higher each time.
      await hc.spySounds(["chime", "bouquet"]);
      for (const [k, id] of ids.slice(0, -1).entries()) {
        await tap(center(id));
        const s = await hc.plants();
        assert.deepEqual(s.bloomed, ids.slice(0, k + 1), `${id} blooms`);
        assert.ok(s.twinkles > 0, `${id} sparkles`);
        assert.equal(await hc.pressed(), id);
        assert.deepEqual(await hc.sounds(), [`chime:${k}`]);
        await allOpen(id);
        // Each flower sits on its plant, with its center color on the canvas at its center.
        for (const f of (await hc.plants()).flowers.filter((q) => q.plant === id)) {
          const p = PLANTS[id];
          assert.ok(f.x >= p.x - 2 && f.x < p.x + p.w + 2 && f.y >= p.y - 6 && f.y < p.y + p.h, `${id}: the flower at ${f.x}, ${f.y} is on the plant`);
          assert.equal(await hc.pixel(f.x, f.y), f.center, `${id}: the flower at ${f.x}, ${f.y}`);
        }
        if (k === 0 && name !== "phone-still") {
          await page.waitForFunction(() => window.__hc.sprites({ host: true }).every((s) => !s.bubble));
          await page.screenshot({ path: `${OUT}/plants-${name}-one.png` });
          if (name === "phone") await zoomShot(page, `${OUT}/plants-zoom-one.png`, { x: 40, y: 8, w: 56, h: 32, k: 10 });
        }
      }
      const found = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.found")));
      assert.ok(found.includes("plants"), `the plants count as found: ${found}`);
      // With one plant left, the room does not bloom yet.
      await sceneWait(page, 1);
      assert.equal((await hc.plants()).moment, null);

      // A second tap on a plant in bloom sparkles and chimes its own note again. It changes nothing else.
      await tap(center(ids[0]));
      assert.deepEqual((await hc.plants()).bloomed, ids.slice(0, -1));
      assert.deepEqual(await hc.sounds(), ["chime:0"]);

      // The last plant blooms the whole room a moment later: petals, a sparkle on every plant, a chord, and Audrey's line.
      const last = ids.at(-1);
      await tap(center(last));
      await page.waitForFunction(() => window.__hc.plants().moment, null, { timeout: 3000 });
      assert.deepEqual(await hc.sounds(), [`chime:${ids.length - 1}`, "bouquet"]);
      assert.equal((await hc.sprite({ host: true, name: "Audrey" })).bubble, BLOOM_LINE);
      await sceneWait(page, reduce === "reduce" ? 0.5 : 1.6);
      const moment = (await hc.plants()).moment;
      assert.ok(moment.petals.length >= 40, `petals fill the room: ${moment.petals.length}`);
      // Most petals show in their own color. A few hide behind a twinkle, a person, or another petal.
      const shown = await page.evaluate((ps) => ps.filter((p) => window.__hc.pixel(p.x, p.y) === p.color).length, moment.petals);
      assert.ok(shown >= moment.petals.length * 0.6, `${shown} of ${moment.petals.length} petals show`);
      if (name !== "phone-still") {
        await page.screenshot({ path: `${OUT}/plants-${name}-room.png` });
        if (name === "phone") await zoomShot(page, `${OUT}/plants-zoom-room.png`, { x: 0, y: 0, w: 256, h: 192, k: 4 });
      }
      if (reduce === "reduce") {
        // With reduced motion, the petals rest on the floor and do not move.
        assert.ok(moment.petals.every((p) => p.y >= 90), "the petals rest on the floor");
        await sceneWait(page, 0.3);
        assert.deepEqual((await hc.plants()).moment.petals, moment.petals);
      }

      // The moment ends. The flowers stay, and the room does not bloom again.
      await page.waitForFunction(() => !window.__hc.plants().moment, null, { timeout: 9000 });
      const after = await hc.plants();
      assert.deepEqual(after.bloomed, ids);
      assert.ok(after.momentDone);
      for (const f of after.flowers) assert.equal(await hc.pixel(f.x, f.y), f.center, `${f.plant}: the flower stays`);
      await tap(center(last));
      await sceneWait(page, 1);
      assert.equal((await hc.plants()).moment, null, "the room blooms once a visit");
      assert.deepEqual(await hc.sounds(), [`chime:${ids.length - 1}`]);
    });
  }

  test("each plant takes a finger-sized tap on a phone, and the things near the plants keep their own taps", async () => {
    const { page, hc } = await env.open({ hasTouch: true, isMobile: true, wait: "eggs" });
    await hc.stillHosts();
    await hc.catchHotspots();
    const { PLANTS, TAP_PX } = await hc.constants();
    const tapFinds = async (x, y) => {
      await tapRoom(page, x, y);
      return (await hc.hotspotHits()).join(",") || null;
    };
    // The center of each plant finds it, and so does a near miss just past its edge.
    for (const [id, p] of Object.entries(PLANTS)) {
      assert.equal(await tapFinds(p.x + p.w / 2, p.y + p.h / 2), id, `the center of ${id}`);
      assert.equal(await tapFinds(p.x + p.w / 2, p.y + p.h + 1), id, `just below ${id}`);
    }
    // The plants stand close to other things, so each one gets most of a finger: about 30 CSS pixels or more each way.
    const areas = await hc.hotspotAreas(TAP_PX.touch);
    for (const id of Object.keys(PLANTS)) assert.ok(areas[id].w >= 30 && areas[id].h >= 39, `${id}: ${JSON.stringify(areas[id])}`);
    // The lamp and the book still take a full finger.
    for (const id of ["lamp", "book"]) assert.ok(areas[id].w >= 43 && areas[id].h >= 43, `${id}: ${JSON.stringify(areas[id])}`);
    // Between the lamp and the plant by the armchair, and between the lamp and the plant on the wall shelf, each side finds its own thing.
    assert.equal(await tapFinds(40, 53), "lamp");
    assert.equal(await tapFinds(47, 66), "plant-armchair");
    assert.equal(await tapFinds(25, 75), "lamp");
    assert.equal(await tapFinds(17, 75), "plant-wall");
    // The two floor plants touch. A tap on each pot finds its own plant.
    assert.equal(await tapFinds(22, 180), "plant-floor-big");
    assert.equal(await tapFinds(40, 180), "plant-floor-small");
    // The book on the sofa below the armchair plant still opens the album.
    assert.equal(await tapFinds(49, 105), "book");
    // A host by a plant still wins a tap on the host.
    await hc.place({ host: true, name: "Audrey" }, 100, 160);
    const p = await hc.pointOn({ host: true, name: "Audrey" });
    await page.touchscreen.tap(p.x, p.y);
    assert.deepEqual(await hc.hotspotHits(), []);
  });

  test("a tap on a plant tells the Worker for the family this browser signed up", async () => {
    const { page, hc, calls } = await env.open({ hasTouch: true, isMobile: true, mine: [GARCIA], wait: "eggs" });
    await assertTucks(page);
    const { PLANTS } = await hc.constants();
    // Two fast taps on two plants bloom both, and one call goes out in the gap.
    for (const p of Object.values(PLANTS).slice(0, 2)) await tapRoom(page, p.x + p.w / 2, p.y + p.h / 2);
    assert.equal((await hc.plants()).bloomed.length, 2);
    await page.waitForTimeout(300);
    const sent = calls.filter((c) => c.path === "/api/interaction").map((c) => c.body);
    assert.deepEqual(sent, [{ id: GARCIA.id, token: GARCIA.token, egg: "plants" }]);
  });

  test("with the lamp off, the flowers and the petals take the dark blue of the room", async () => {
    const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, wait: "eggs" });
    await hc.stillHosts();
    const { PLANTS, HOTSPOTS } = await hc.constants();
    const lamp = HOTSPOTS.find((h) => h.id === "lamp");
    await tapRoom(page, lamp.x + lamp.w / 2, lamp.y + lamp.h / 2, { touch: false });
    assert.equal((await hc.eggs()).lampOn, false);
    for (const p of Object.values(PLANTS)) await tapRoom(page, p.x + p.w / 2, p.y + p.h / 2, { touch: false });
    await page.waitForFunction(() => window.__hc.plants().moment, null, { timeout: 3000 });
    await sceneWait(page, 1.6);
    // No flower and no petal shows its color in full light.
    const { flowers, moment } = await hc.plants();
    for (const f of flowers) assert.notEqual(await hc.pixel(f.x, f.y), f.center, `${f.plant}: the flower at ${f.x}, ${f.y} is dark`);
    assert.ok(moment.petals.length >= 40);
    const bright = await page.evaluate((ps) => ps.filter((p) => window.__hc.pixel(p.x, p.y) === p.color).length, moment.petals);
    assert.equal(bright, 0, "no petal shows in full light");
    await zoomShot(page, `${OUT}/plants-zoom-dark.png`, { x: 0, y: 0, w: 256, h: 192, k: 4 });
  });
});
