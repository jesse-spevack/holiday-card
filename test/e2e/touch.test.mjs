// Touch targets on a phone, and the host lines with their hints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { e2e, HOSTS_BY_NAME, tapRoom } from "./harness.mjs";

const env = await e2e();

test("each hidden thing takes a finger-sized tap, and the hosts hint at the things a guest has not found", async () => {
  const { page, hc } = await env.open({ hasTouch: true, isMobile: true, wait: "eggs" });
  await hc.stillHosts();
  // Note each hidden thing that a tap finds, but open nothing.
  await hc.catchHotspots();
  const { HOTSPOTS, TAP_PX, HOST_LINES } = await hc.constants();
  const box = (id) => HOTSPOTS.find((h) => h.id === id);
  const center = (id) => ({ x: box(id).x + box(id).w / 2, y: box(id).y + box(id).h / 2 });
  const between = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const tapFinds = async ({ x, y }) => {
    await tapRoom(page, x, y);
    return (await hc.hotspotHits()).join(",") || null;
  };

  // The center of each hidden thing always finds it, and a tap between two things on the sill finds the nearer one.
  for (const h of HOTSPOTS) assert.equal(await tapFinds(center(h.id)), h.id, `a tap on the center of ${h.id}`);
  for (const [a, b] of [["dreidel-left", "menorah"], ["menorah", "dreidel-right"]]) {
    assert.equal(await tapFinds(between(center(a), center(b), 0.25)), a, `a quarter of the way from ${a} to ${b}`);
    assert.equal(await tapFinds(between(center(a), center(b), 0.75)), b, `three quarters of the way from ${a} to ${b}`);
  }
  // In the 3-pixel gap between the menorah (x 194-210) and the right dreidel (x 214-224), each side finds its own thing.
  assert.equal(await tapFinds({ x: 211.5, y: 50 }), "menorah");
  assert.equal(await tapFinds({ x: 213.5, y: 50 }), "dreidel-right");
  // Under the sill things, a tap finds the closer one: the menorah's base ends 2 pixels higher than the dreidels.
  assert.equal(await tapFinds({ x: 200, y: 61 }), "menorah");
  assert.equal(await tapFinds({ x: 192, y: 62 }), "dreidel-left");
  // a near miss just above a dreidel finds the dreidel, not the window behind it, and the open sky still finds the window
  assert.equal(await tapFinds({ x: center("dreidel-right").x, y: box("dreidel-right").y - 3 }), "dreidel-right");
  assert.equal(await tapFinds({ x: 176, y: 22 }), "window");
  // the thing a tap found shows its corners for a moment
  await tapFinds(center("menorah"));
  assert.equal(await hc.pressed(), "menorah");
  // Each thing takes a finger-sized area where the room allows, in CSS pixels, through its center.
  const areas = await hc.hotspotAreas(TAP_PX.touch);
  for (const id of ["book", "lamp"]) assert.ok(areas[id].w >= 43 && areas[id].h >= 43, `${id}: ${JSON.stringify(areas[id])}`);
  // The things on the sill stand closer than a finger, so each one gets a full finger of height and its share of the width.
  for (const id of ["dreidel-left", "menorah", "dreidel-right"]) assert.ok(areas[id].w >= 27 && areas[id].h >= 40, `${id}: ${JSON.stringify(areas[id])}`);

  // A tapped host says a line of their own, never the same line twice in a row, and a found thing drops out of the hints.
  const text = (l) => (typeof l === "string" ? l : l.text);
  const hear = async (name, times) => {
    const lines = [];
    for (let i = 0; i < times; i++) {
      const p = await hc.pointOn({ host: true, name });
      await page.touchscreen.tap(p.x, p.y);
      lines.push((await hc.sprite({ host: true, name })).bubble);
    }
    return lines;
  };
  for (const host of HOSTS_BY_NAME) {
    const lines = await hear(host.name, 16);
    const own = HOST_LINES[host.id].map(text);
    for (const [i, line] of lines.entries()) {
      assert.ok(own.includes(line), `${host.name} says their own line: ${line}`);
      if (i) assert.notEqual(line, lines[i - 1], `${host.name} repeats "${line}"`);
    }
    // the guest is a first-time guest with no family of their own, so no hint about silly looks
    assert.ok(!lines.includes("My favorite looks are the silly ones."), `${host.name} hints at silly looks with no family to dress`);
  }
  // a bubble near the edge of a phone stays on the screen
  const jesse = await hc.sprite({ host: true, name: "Jesse" });
  await hc.place({ host: true, name: "Jesse" }, 180, jesse.y);
  await hear("Jesse", 1);
  const edge = (await hc.sprite({ host: true, name: "Jesse" })).bubbleBox.right;
  assert.ok(edge <= 390, `the bubble stays on the screen: ${edge}`);
  // after the guest finds every hidden thing, the hosts only thank them
  await hc.found("album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly", "toast");
  const thanks = HOST_LINES.jesse.filter((l) => typeof l === "string");
  for (const line of await hear("Jesse", 8)) assert.ok(thanks.includes(line), `Jesse only thanks the guest now: ${line}`);
});
