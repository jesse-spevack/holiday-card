// The hosts speak on their own. After the thank-you, a host says a line about every 20 seconds while the guest does nothing.
// The line is a hint at an extra that the guest has not found. A tap starts the wait again. An open window or editor, or a
// hidden tab, stops the wait. After the guest finds every extra, the hosts speak much less often, with the thanks only.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, tuckNow, tapRoom, waitForFamilies, animationsDone } from "./harness.mjs";

const env = await e2e();
// One guest family with no pet and no bubbles. So the pets hints do not fit, and only the test makes a guest speak.
const PARTY = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "kid", look: "t-kid" }], bubbles: ["", ""] }] };

// Opens the party of a return guest after the thank-you, with the scene clock stopped.
async function party(options = {}) {
  const opened = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, party: PARTY, mine: [GARCIA], wait: "eggs", ...options });
  const { page, hc } = opened;
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  assert.equal((await hc.idle()).on, false, "no host line of their own before the thank-you tucks");
  await tuckNow(page);
  await hc.pause();
  return opened;
}

// Moves the stopped clock `seconds` ahead, or until a host says a new line of their own with `untilLine`.
// A bubble lasts a few seconds of wall time, and the stopped clock moves much faster. So each step takes away every bubble,
// as the wall clock would. Else an old bubble, such as a host's call of a passing car, blocks each new line.
// Returns the scene seconds that it took, or null when no line came.
function quietly(page, seconds, { untilLine = false } = {}) {
  return page.evaluate(({ seconds, untilLine }) => {
    const hc = window.__hc;
    const n = hc.idle().said.length;
    const t0 = hc.time();
    while (hc.time() - t0 < seconds - 1e-6) {
      for (const s of hc.sprites()) {
        if (s.bubble !== null) hc.say(s.host ? { host: true, name: s.name } : { familyId: s.familyId, index: s.index }, "");
      }
      hc.advance(Math.min(1 / 30, seconds - (hc.time() - t0)));
      if (untilLine && hc.idle().said.length > n) return hc.time() - t0;
    }
    return untilLine ? null : hc.time() - t0;
  }, { seconds, untilLine });
}
const nextLine = async (page, max) => assert.notEqual(await quietly(page, max, { untilLine: true }), null, `a host line within ${max} scene seconds`);

// The lines that the hosts said on their own.
const said = async (hc) => (await hc.idle()).said;

describe("the hosts speak on their own", { concurrency: true }, () => {
  test("a host says a hint after 20 quiet seconds, and a tap starts the wait again", async () => {
    const { page, hc } = await party();
    const { IDLE, HOST_LINES } = await hc.constants();
    // the wait starts at the tuck. Just before 20 quiet seconds, no host speaks.
    const { quiet } = await hc.idle();
    await quietly(page, IDLE.every - quiet - 0.5);
    assert.deepEqual(await said(hc), []);
    await hc.advance(1);
    const [first] = await said(hc);
    assert.ok(first?.hint, `a hint: ${JSON.stringify(first)}`);
    // the line is a hint of that host, for an extra that the guest has not found and that fits
    const egg = Object.values(HOST_LINES).flat().find((l) => l.text === first.text)?.egg;
    assert.ok(egg && egg !== "pets", `a hint at an extra that fits: ${egg}`);
    const sprite = await hc.sprite({ host: true, name: first.host });
    assert.equal(sprite.bubble, first.text, "the line shows in a bubble over the host");
    assert.equal(sprite.bubbleClipped, false);
    await animationsDone(page);
    await page.screenshot({ path: `${OUT}/idle-hint.png` });

    // a tap on the wall starts the wait again
    await quietly(page, IDLE.every - 5);
    await tapRoom(page, 100, 20);
    assert.ok((await hc.idle()).quiet < 0.1, "a tap starts the wait again");
    await quietly(page, IDLE.every - 1);
    assert.equal((await said(hc)).length, 1);
    await quietly(page, 1.5);
    assert.equal((await said(hc)).length, 2);

    // A found extra drops out of the hints. With every extra but the presents found, each hint is the presents hint.
    // Only Eddie has it, and a host never says the same line twice in a row, so his hint comes every other time.
    const { missing } = await hc.counter();
    await hc.found(...missing.filter((n) => n !== "presents"));
    for (let i = 0; i < 4; i++) await nextLine(page, IDLE.every + 1);
    const last = (await said(hc)).slice(2);
    const hints = last.filter((l) => l.hint);
    assert.ok(hints.length >= 2, `at least every other line is a hint: ${JSON.stringify(last)}`);
    assert.ok(hints.every((l) => l.text === "Psst. Tap the presents!" && l.host === "Eddie"), JSON.stringify(hints));
  });

  test("no host speaks while the editor, the album, or the dreidel game is open, or while the tab hides", async () => {
    const { page, hc } = await party({ album: true });
    const { IDLE } = await hc.constants();
    // the sprite editor of the guest's own family
    const p = await hc.pointOn({ familyId: "fam12345", index: 0 });
    await page.touchscreen.tap(p.x, p.y);
    await page.locator(".pop").waitFor();
    await hc.advance(IDLE.every * 2);
    assert.deepEqual(await said(hc), []);
    // the photo album: a window over the whole page
    const book = await hc.spotCenter("book");
    await tapRoom(page, book.x, book.y);
    await page.getByRole("dialog", { name: "Photo album" }).waitFor();
    assert.ok(await page.evaluate(() => document.getElementById("app").hasAttribute("inert")));
    await hc.advance(IDLE.every * 2);
    assert.deepEqual(await said(hc), []);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("app").hasAttribute("inert"));
    // the dreidel game
    const top = await hc.spotCenter("dreidel-left");
    await tapRoom(page, top.x, top.y);
    await page.waitForFunction(() => window.__hc.dreidelReady());
    await hc.advance(IDLE.every * 2);
    assert.deepEqual(await said(hc), []);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("app").hasAttribute("inert"));
    // a hidden tab
    await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => true }));
    await hc.advance(IDLE.every * 2);
    assert.deepEqual(await said(hc), []);
    await page.evaluate(() => delete document.hidden);
    await quietly(page, IDLE.every + 1);
    assert.equal((await said(hc)).length, 1);
  });

  test("a host line never covers another bubble", async () => {
    const { page, hc } = await party();
    const { IDLE } = await hc.constants();
    await quietly(page, 1 / 30);
    // Every host stands right under a guest who speaks, so each host's bubble would cover the guest's bubble.
    await hc.stillGuests();
    await hc.place({ familyId: "other1", index: 0 }, 140, 130);
    await hc.place({ host: true }, 140, 132);
    await hc.say({ familyId: "other1", index: 0 }, "Happy Hanukkah!", 60);
    await hc.advance(IDLE.every + 1);
    assert.deepEqual(await said(hc), [], "no host speaks over the guest's bubble");
    // The guest moves away. The hosts try again soon, and the new bubble is clear of the guest's bubble.
    await hc.place({ familyId: "other1", index: 0 }, 100, 166);
    await hc.advance(IDLE.retry + 0.5);
    const [line] = await said(hc);
    assert.ok(line, "a host speaks once the way is clear");
    await animationsDone(page);
    await page.screenshot({ path: `${OUT}/idle-clear.png` });
    const boxes = (await hc.sprites()).filter((s) => s.bubbleBox).map((s) => s.bubbleBox);
    assert.equal(boxes.length, 2);
    const [a, b] = boxes;
    assert.ok(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top, `the bubbles overlap: ${JSON.stringify(boxes)}`);
  });

  test("a guest's own bubble waits while it would cover a host's line", async () => {
    const party = { families: [{ ...PARTY.families[0], bubbles: ["Happy Hanukkah!", ""] }] };
    const { page, hc } = await env.open({ viewport: { width: 400, height: 844 }, party, mine: [GARCIA], wait: "eggs" });
    await waitForFamilies(page, { other1: 2 });
    await hc.pause();
    await hc.stillGuests();
    await hc.stillHosts();
    // Jesse stands right under the guest and talks. For two turns of the guest bubbles (3.5 seconds each), the guest waits.
    await hc.place({ familyId: "other1", index: 0 }, 150, 130);
    await hc.place({ host: true, name: "Jesse" }, 150, 132);
    await hc.say({ host: true, name: "Jesse" }, "Happy holidays!", 60);
    const shows = () => page.evaluate(() => new Promise((done) => {
      const t0 = performance.now();
      const look = () => {
        if (window.__hc.sprite({ familyId: "other1", index: 0 }).bubble) return done(true);
        if (performance.now() - t0 > 8000) return done(false);
        requestAnimationFrame(look);
      };
      look();
    }));
    assert.equal(await shows(), false, "the guest's bubble covers Jesse's line");
    // Jesse stops talking. The guest's bubble shows on its next turn.
    await hc.say({ host: true, name: "Jesse" }, "");
    assert.equal(await shows(), true);
  });

  test("after the guest finds every extra, the hosts speak much less often, with the thanks only", async () => {
    const { page, hc } = await party();
    const { IDLE, HOST_LINES } = await hc.constants();
    await hc.found(...(await hc.counter()).missing);
    assert.equal((await hc.idle()).wait, IDLE.done);
    await hc.advance(IDLE.every + 1);
    assert.deepEqual(await said(hc), []);
    await nextLine(page, IDLE.done + 1);
    const [line] = await said(hc);
    assert.equal(line.hint, false);
    const thanks = Object.values(HOST_LINES).flat().filter((l) => typeof l === "string");
    assert.ok(thanks.includes(line.text), `a thank-you line: ${line.text}`);
  });
});
