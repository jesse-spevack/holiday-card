// The counter: a small label in the corner of the room, for example "3 of 12 surprises". It shows as soon as the room shows,
// for every visitor, also on the form. The total counts only the extras that fit the guest. A tap on it gives a hint, and the
// last find makes the room sparkle and the counter show its done state.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, tuckNow, tapRoom, waitForFamilies, animationsDone } from "./harness.mjs";

const env = await e2e();
// The Lees bring a dog, so the pets count. The Parks bring no pet.
const WITH_PET = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] }] };
const NO_PET = { families: [{ id: "other1", name: "The Parks", members: [{ type: "adult", look: "t-dad" }, { type: "kid", look: "t-kid" }], bubbles: ["", ""] }] };
const SIZES = [
  { name: "phone", viewport: { width: 400, height: 844 }, touch: true },
  { name: "small-phone", viewport: { width: 360, height: 640 }, touch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
];

const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// On the form, the counter sits in the corner of the room and clear of the dialog, on a small phone, a phone, a tall phone, and a desktop.
describe("the counter on the form", { concurrency: true }, () => {
  for (const { name, viewport, touch } of [...SIZES, { name: "tall-phone", viewport: { width: 400, height: 932 }, touch: true }]) {
    test(`a first-time visitor sees the counter on the form, clear of the dialog, on ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, hasTouch: touch, party: NO_PET, wait: "eggs" });
      await page.locator("#f-envelope").waitFor();
      await hc.pause();
      await animationsDone(page);
      const c = await hc.counter();
      assert.ok(c.shown);
      // With no family and no pet at the party, the silly looks and the pets do not fit: 11 of the 13 extras.
      assert.equal(c.text, "0 of 11 surprises");
      const [room, stage, dialog] = await page.evaluate(() => ["world", "stage", "dialog"].map((id) => document.getElementById(id).getBoundingClientRect().toJSON()));
      for (const r of [room, stage]) assert.ok(c.box.left >= r.left && c.box.right <= r.right && c.box.top >= r.top && c.box.bottom <= r.bottom, `inside: ${JSON.stringify({ box: c.box, r })}`);
      assert.ok(room.right - c.box.right < 12 && room.bottom - c.box.bottom < 12, `in the corner: ${JSON.stringify({ box: c.box, room })}`);
      // clear of the dialog, with a gap of at least 4 pixels
      const near = { left: dialog.left - 4, top: dialog.top - 4, right: dialog.right + 4, bottom: dialog.bottom + 4 };
      assert.ok(!overlap(c.box, near), `clear of the dialog: ${JSON.stringify({ box: c.box, dialog })}`);
      assert.equal(await page.evaluate(() => { const el = document.querySelector(".counter"); return el.scrollWidth <= el.clientWidth; }), true);
      await page.screenshot({ path: `${OUT}/counter-form-${name}.png` });
    });
  }
});

// With no family, a find counts, a tap on the counter gives a hint, and the last find makes the room sparkle. No host speaks on their own.
test("a first-time visitor on the form counts finds, gets a hint on a tap, and gets the cheer at the last find", async () => {
  const { page, hc, calls } = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, party: NO_PET, wait: "eggs" });
  await page.locator("#f-envelope").waitFor();
  await hc.pause();
  await hc.stillHosts();
  await hc.spySounds(["select", "fanfare"]);
  const start = await hc.counter();
  assert.equal(start.found, 0);
  // a tap on the fire
  const fire = await hc.spotCenter("fire");
  await tapRoom(page, fire.x, fire.y);
  await page.waitForFunction(() => window.__hc.counter().found === 1);
  assert.equal((await hc.counter()).text, `1 of ${start.total} surprises`);
  // A tap on the counter: a host says a hint, since the guest asked.
  const box = (await hc.counter()).box;
  await page.touchscreen.tap((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await page.waitForFunction(() => window.__hc.idle().said.length === 1);
  assert.ok((await hc.idle()).said[0].hint);
  // the last find
  await hc.found(...(await hc.counter()).missing.filter((n) => n !== "presents"));
  const presents = await hc.spotCenter("presents");
  await tapRoom(page, presents.x, presents.y);
  await page.waitForFunction(() => window.__hc.counter().celebrations === 1);
  assert.equal((await hc.counter()).text, `All ${start.total} found!`);
  assert.ok((await hc.sounds()).includes("fanfare"));
  assert.equal((await hc.sprite({ host: true, name: "Jess" })).bubble, "You found every surprise!");
  await hc.advance(0.6);
  assert.ok((await hc.glint()).twinkles >= 10);
  // No family, so no call goes to the Worker, and the form still waits.
  assert.equal(await hc.interactionsSent(), 0);
  assert.deepEqual(calls.filter((c) => c.path === "/api/interaction"), []);
  assert.ok(await page.locator("#f-envelope").isVisible());
  // The hosts never speak on their own while the form shows.
  assert.equal((await hc.idle()).on, false);
});

describe("the counter", { concurrency: true }, () => {
  for (const { name, viewport, touch } of SIZES) {
    test(`the counter sits in the corner, clear of the tap areas and the hosts, on ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, hasTouch: touch, party: NO_PET, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, { other1: 2, fam12345: 2 });
      // during the thank-you too
      assert.ok((await hc.counter()).shown);
      await tuckNow(page);
      await hc.pause();
      const c = await hc.counter();
      assert.ok(c.shown);
      // With no pet at the party, the pets do not count: 12 of the 13 extras fit.
      assert.equal(c.total, 12);
      assert.ok(!c.missing.includes("pets"));
      assert.equal(c.text, `${c.found} of 12 surprises`);
      await animationsDone(page);
      const box = (await hc.counter()).box;
      // inside the room and the stage
      const room = await page.evaluate(() => document.getElementById("world").getBoundingClientRect().toJSON());
      const stage = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
      for (const r of [room, stage]) assert.ok(box.left >= r.left && box.right <= r.right && box.top >= r.top && box.bottom <= r.bottom, `inside: ${JSON.stringify({ box, r })}`);
      // in the bottom right corner
      assert.ok(room.right - box.right < 12 && room.bottom - box.bottom < 12, `in the corner: ${JSON.stringify({ box, room })}`);
      // clear of every tap area
      const { HOTSPOTS, FLOOR } = await hc.constants();
      for (const s of HOTSPOTS) {
        const r = await page.evaluate((s) => window.__hc.toScreen(s.x, s.y), s);
        const end = await page.evaluate((s) => window.__hc.toScreen(s.x + s.w, s.y + s.h), s);
        assert.ok(!overlap(box, { left: r.x, top: r.y, right: end.x, bottom: end.y }), `the counter covers ${s.id}`);
      }
      // below the floor where the hosts and the guests stand, so it covers no one's feet or body
      const floor = await page.evaluate((y) => window.__hc.toScreen(0, y).y, FLOOR.y1);
      assert.ok(box.top > floor, `below the floor: ${box.top} > ${floor}`);
      // the label shows in full
      assert.equal(await page.evaluate(() => { const el = document.querySelector(".counter"); return el.scrollWidth <= el.clientWidth; }), true);
      await page.screenshot({ path: `${OUT}/counter-${name}.png` });
      // the lamp off: the counter keeps its own colors
      const lamp = await hc.spotCenter("lamp");
      await tapRoom(page, lamp.x, lamp.y, { touch });
      await page.mouse.move(1, 1);
      await page.screenshot({ path: `${OUT}/counter-${name}-dark.png` });
    });
  }
});

test("a find adds one, a car counts once the guest sees it, and a tap on the counter gives a hint", async () => {
  const { page, hc } = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, party: WITH_PET, mine: [GARCIA], wait: "eggs" });
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  await tuckNow(page);
  await hc.pause();
  await hc.stillHosts();
  await hc.spySounds(["select"]);
  // The dog at the party makes the pets count: all 13 extras.
  const start = await hc.counter();
  assert.equal(start.total, 13);
  // a tap on the fire
  const fire = await hc.spotCenter("fire");
  await tapRoom(page, fire.x, fire.y);
  await page.waitForFunction((n) => window.__hc.counter().found === n + 1, start.found);
  assert.equal((await hc.counter()).text, `${start.found + 1} of 13 surprises`);
  // the Cybertruck drives past the window
  if ((await hc.counter()).missing.includes("cybertruck")) {
    const before = (await hc.counter()).found;
    await hc.sendCybertruck(1);
    await page.evaluate(() => { const hc = window.__hc; for (let i = 0; i < 1200 && hc.eggs().truck === null; i++) hc.advance(0.05); for (let i = 0; i < 1200 && hc.eggs().truck !== null; i++) hc.advance(0.05); });
    await page.waitForFunction((n) => window.__hc.counter().found === n + 1, before);
    assert.ok(!(await hc.counter()).missing.includes("cybertruck"));
  }
  // A tap on the counter: a host says a hint at an extra that the guest has not found. The room takes no tap.
  await hc.catchHotspots();
  const box = (await hc.counter()).box;
  await page.touchscreen.tap((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await page.waitForFunction(() => window.__hc.idle().said.length === 1);
  const [line] = (await hc.idle()).said;
  assert.ok(line.hint, JSON.stringify(line));
  const { HOST_LINES } = await hc.constants();
  const egg = Object.values(HOST_LINES).flat().find((l) => l.text === line.text)?.egg;
  assert.ok((await hc.counter()).missing.includes(egg), `a hint at an extra the guest has not found: ${egg}`);
  assert.equal((await hc.sprite({ host: true, name: line.host })).bubble, line.text);
  assert.deepEqual(await hc.hotspotHits(), []);
  assert.deepEqual(await hc.sounds(), ["select"]);
  await page.screenshot({ path: `${OUT}/counter-hint.png` });
});

describe("the last find", { concurrency: true }, () => {
  for (const reduce of ["no-preference", "reduce"]) {
    test(`the last find makes the room sparkle, and the counter shows its done state, with reduced motion ${reduce}`, async () => {
      const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, reducedMotion: reduce, party: NO_PET, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, { other1: 2, fam12345: 2 });
      await tuckNow(page);
      await hc.pause();
      await hc.stillHosts();
      await hc.spySounds(["fanfare"]);
      // every extra but the presents
      await hc.found(...(await hc.counter()).missing.filter((n) => n !== "presents"));
      await page.waitForFunction(() => window.__hc.counter().text === "11 of 12 surprises");
      assert.equal((await hc.counter()).celebrations, 0);
      // the last one
      const presents = await hc.spotCenter("presents");
      await tapRoom(page, presents.x, presents.y, { touch: false });
      await page.waitForFunction(() => window.__hc.counter().celebrations === 1);
      const c = await hc.counter();
      assert.equal(c.text, "All 12 found!");
      assert.equal(c.celebrations, 1);
      assert.deepEqual(await hc.sounds(), ["fanfare"]);
      assert.equal((await hc.sprite({ host: true, name: "Jess" })).bubble, "You found every surprise!");
      // the room sparkles for a moment: a twinkle on every tap area, then none
      await hc.advance(0.6);
      assert.ok((await hc.glint()).twinkles >= 10, JSON.stringify(await hc.glint()));
      await page.mouse.move(1, 1);
      await animationsDone(page);
      await page.screenshot({ path: `${OUT}/counter-done-${reduce}.png` });
      await hc.advance(2);
      assert.equal((await hc.glint()).twinkles, 0);
      // no glint is left
      await hc.advance(10);
      assert.equal((await hc.glint()).shown, null);
      // A tap on the done counter: a host says a thank-you line.
      const box = (await hc.counter()).box;
      await page.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);
      await page.waitForFunction(() => window.__hc.idle().said.length === 1);
      assert.equal((await hc.idle()).said[0].hint, false);
    });
  }
});

test("when the album is the last find, the cheer waits until the album closes", async () => {
  const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, album: true, party: NO_PET, mine: [GARCIA], wait: "eggs" });
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  await tuckNow(page);
  await hc.found(...(await hc.counter()).missing.filter((n) => n !== "album"));
  const book = await hc.spotCenter("book");
  await tapRoom(page, book.x, book.y, { touch: false });
  await page.getByRole("dialog", { name: "Photo album" }).waitFor();
  await page.waitForFunction(() => window.__hc.counter().done);
  // two frames later, still no cheer
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal((await hc.counter()).celebrations, 0, "no cheer behind the album");
  await page.getByRole("button", { name: "Close the album" }).click();
  await page.waitForFunction(() => window.__hc.counter().celebrations === 1);
});

test("a guest who found everything before sees the done state, with no new cheer", async () => {
  const names = ["album", "lamp", "waymo", "cybertruck", "star", "menorah", "toast", "plants", "fire", "presents", "dreidel", "pets", "silly"];
  const { page, hc } = await env.open({ party: NO_PET, mine: [GARCIA], wait: "eggs", init: [`localStorage.setItem("hc.found", ${JSON.stringify(JSON.stringify(names))})`] });
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  await tuckNow(page);
  const c = await hc.counter();
  assert.ok(c.done);
  assert.equal(c.text, "All 12 found!");
  assert.equal(c.celebrations, 0);
});
