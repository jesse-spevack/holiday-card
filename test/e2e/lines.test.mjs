// The guests' own lines. After the thank-you, each line shows once in a visit, one line at a time, and never on top of
// another bubble. A tap on a guest shows the line again. A new or changed line shows once when it arrives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, tuckNow, waitForFamilies } from "./harness.mjs";

const env = await e2e();
const LEE = { familyId: "other1", index: 0 };

// Watches every frame for `ms` of wall time, from the page, and returns each text that the sprite `want` showed.
const watchLines = (page, want, ms) => page.evaluate(({ want, ms }) => new Promise((done) => {
  const seen = [];
  const t0 = performance.now();
  const look = () => {
    const text = window.__hc.sprite(want).bubble;
    if (text && seen.at(-1) !== text) seen.push(text);
    if (performance.now() - t0 > ms) return done(seen);
    requestAnimationFrame(look);
  };
  look();
}), { want, ms });

test("a guest's line shows once a visit, waits for a clear space, and shows again on a tap", async () => {
  const party = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["Happy Hanukkah!", ""] }] };
  const { page, hc, ctx, calls } = await env.open({ viewport: { width: 400, height: 844 }, hasTouch: true, party, mine: [GARCIA], wait: "eggs" });
  await waitForFamilies(page, { other1: 2, fam12345: 2 });
  await hc.pause();
  await hc.stillGuests();
  await hc.stillHosts();
  // During the thank-you, no guest line shows.
  await hc.lineTurn();
  assert.equal((await hc.sprite(LEE)).bubble, null);

  // Jesse stands right under the guest and talks, so the guest's line waits.
  await hc.place(LEE, 150, 130);
  await hc.place({ host: true, name: "Jesse" }, 150, 132);
  await hc.say({ host: true, name: "Jesse" }, "Happy holidays!", 60);
  await tuckNow(page);
  for (let i = 0; i < 3; i++) await hc.lineTurn();
  assert.equal((await hc.sprite(LEE)).bubble, null, "the guest's line covers Jesse's line");

  // Jesse stops. The line shows on the next turn.
  await hc.say({ host: true, name: "Jesse" }, "");
  await hc.lineTurn();
  await page.waitForFunction((want) => window.__hc.sprite(want).bubble === "Happy Hanukkah!", LEE);
  await page.screenshot({ path: `${OUT}/lines-once.png` });

  // After it goes, it does not show again on its own: not on many turns, and not in 8 seconds of the real timer (2 turns).
  await hc.say(LEE, "");
  for (let i = 0; i < 10; i++) await hc.lineTurn();
  await hc.advance(120);
  assert.deepEqual(await watchLines(page, LEE, 8000), []);

  // A tap on the guest shows the line again, each time. The guest first steps away from Jesse.
  await hc.place(LEE, 110, 166);
  for (let i = 0; i < 2; i++) {
    await hc.say(LEE, "");
    const p = await hc.pointOn(LEE);
    await page.touchscreen.tap(p.x, p.y);
    assert.equal((await hc.sprite(LEE)).bubble, "Happy Hanukkah!");
  }
  await hc.say(LEE, "");

  // A changed line from the party poll shows once.
  party.families[0].bubbles[0] = "Latkes for everyone!";
  await hc.pollParty();
  await hc.lineTurn();
  await page.waitForFunction((want) => window.__hc.sprite(want).bubble === "Latkes for everyone!", LEE);
  await hc.say(LEE, "");
  for (let i = 0; i < 5; i++) await hc.lineTurn();
  assert.equal((await hc.sprite(LEE)).bubble, null);

  // Another tab changes the line of this browser's own family. The new line shows once.
  const other = await ctx.newPage();
  await other.goto(new URL("/style.css", page.url()).href);
  await other.evaluate((f) => localStorage.setItem("hc.families", JSON.stringify([f])), { ...GARCIA, bubbles: ["Hi from the other tab", ""] });
  const mine = { familyId: "fam12345", index: 0 };
  await page.waitForFunction(() => { window.__hc.lineTurn(); return window.__hc.sprite({ familyId: "fam12345", index: 0 }).bubble === "Hi from the other tab"; });
  await hc.say(mine, "");
  for (let i = 0; i < 5; i++) await hc.lineTurn();
  assert.equal((await hc.sprite(mine)).bubble, null);
  // the other tab sends nothing to the Worker from this page
  assert.equal(calls.filter((c) => c.path === "/api/sprite").length, 0);
});
