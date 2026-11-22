// The hosts walk around the room, face the way they walk, stay on the open floor, and stop to talk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT } from "./harness.mjs";

const env = await e2e();

test("the hosts walk around the party", async () => {
  const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, wait: "room" });
  const { FLOOR } = await hc.constants();
  const homes = await hc.sprites({ host: true });
  await page.screenshot({ path: `${OUT}/hosts-walk-1.png` });
  // Watch the hosts for up to 12 seconds, until each one has left home.
  const moved = new Set();
  for (let i = 0; i < 48 && (moved.size < 4 || i < 16); i++) {
    await page.waitForTimeout(250);
    for (const h of await hc.sprites({ host: true })) {
      assert.ok(h.x >= FLOOR.x0 && h.x <= FLOOR.x1 && h.y >= FLOOR.y0 && h.y <= FLOOR.y1, `${h.name} stays on the floor: ${h.x}, ${h.y}`);
      if (h.path && Math.abs(h.path.x - h.x) > 2) assert.equal(h.flip, h.path.x < h.x, `${h.name} faces the way they walk`);
      const home = homes.find((q) => q.name === h.name);
      if (Math.hypot(h.x - home.x, h.y - home.y) > 3) moved.add(h.name);
    }
  }
  assert.deepEqual([...moved].sort(), ["Audrey", "Eddie", "Jess", "Jesse"]);
  await page.screenshot({ path: `${OUT}/hosts-walk-2.png` });

  // Audrey and Eddie walk together
  await page.waitForFunction(() => window.__hc.sprites({ host: true }).filter((s) => !s.mingle).every((s) => !s.path), null, { timeout: 15000 });
  const kids = (await hc.sprites({ host: true })).filter((h) => h.name === "Audrey" || h.name === "Eddie");
  assert.ok(Math.hypot(kids[0].x - kids[1].x, kids[0].y - kids[1].y) < 24, `the kids stand together: ${JSON.stringify(kids)}`);

  // a hover on a walking host shows the names, and they follow the hosts without overlapping
  const walker = await hc.pointOn({ host: true, name: "Jesse" });
  await page.mouse.move(walker.x, walker.y);
  await page.locator(".tag", { hasText: "Eddie" }).waitFor();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    const labels = await page.evaluate(() => window.__hc.sprites({ host: true }).map((s) => ({ name: s.name, at: window.__hc.toScreen(s.x, s.y).x, box: s.nameBox })));
    for (const l of labels) assert.ok(Math.abs((l.box.left + l.box.right) / 2 - l.at) < 1.5, `${l.name}'s name follows them`);
    for (const a of labels) {
      for (const b of labels) {
        if (a === b) continue;
        const overlap = a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom;
        assert.ok(!overlap, `the names ${a.name} and ${b.name} overlap`);
      }
    }
  }
  await page.screenshot({ path: `${OUT}/hosts-walk-names.png` });

  // a tap on a host stops them to talk
  await page.mouse.move(2, 2);
  const talker = await hc.pointOn({ host: true, name: "Jess" });
  await page.mouse.click(talker.x, talker.y);
  await page.waitForFunction(() => window.__hc.sprite({ host: true, name: "Jess" }).bubble);
  assert.equal((await hc.sprite({ host: true, name: "Jess" })).path, null);
});
