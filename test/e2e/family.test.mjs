// "My family": a panel in the dialog with a card for each person of this browser's family. A pick marks the person
// in the room with a gold arrow, and edits their line and look. A tap on your own sprite opens the same panel.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, said, typed, tuckNow, waitForFamilies, advanceUntil } from "./harness.mjs";

const env = await e2e();
const SIX = {
  ...GARCIA,
  members: [
    { type: "adult", look: "t-mom" }, { type: "adult", look: "t-dad" }, { type: "kid", look: "t-kid" },
    { type: "dog", look: "t-dog" }, { type: "baby", look: "t-baby" }, { type: "cat", look: "t-cat" },
  ],
  bubbles: ["Happy holidays!", "", "Is it snowing in Denver this year?", "", "", ""],
};
const LEES = { id: "fam-lee", token: "tok-lee", name: "The Lee Family", members: [{ type: "adult", look: "t-dad" }, { type: "kid", look: "t-teen" }], bubbles: ["", "Hi!"] };

async function party(options = {}) {
  const mine = options.mine || [SIX];
  const opened = await env.open({ mine, reducedMotion: "reduce", wait: "room", ...options });
  await waitForFamilies(opened.page, Object.fromEntries(mine.map((f) => [f.id, f.members.length])));
  await tuckNow(opened.page);
  return opened;
}

const card = (page, index) => page.locator(`.fam-card[data-index="${index}"]`);
const cardLines = (page) => page.locator(".fam-card .fam-line").allInnerTexts();
const spriteCalls = (calls) => calls.filter((c) => c.path === "/api/sprite").map((c) => c.body);

describe("my family", { concurrency: true }, () => {
  test("the panel lists the family, edits a line, and Done goes back to the party", async () => {
    const { page, calls, hc } = await party({ viewport: { width: 400, height: 844 }, deviceScaleFactor: 2 });
    // One browser holds one family: no second sign-up.
    assert.equal(await page.getByRole("button", { name: "Add another address" }).count(), 0);
    await page.getByRole("button", { name: "My family" }).click();

    await said(page, "Who do you want to change?");
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Garcia Family");
    assert.deepEqual(await cardLines(page), ["Happy holidays!", "No line yet", "Is it snowing in Denver this year?", "No line yet", "No line yet", "No line yet"]);
    assert.deepEqual(await page.locator(".fam-card").evaluateAll((cs) => cs.map((c) => c.getAttribute("aria-label"))), [
      "Grown-up 1: Happy holidays!", "Grown-up 2: No line yet", "Kid: Is it snowing in Denver this year?", "Dog: No line yet", "Baby: No line yet", "Cat: No line yet",
    ]);
    assert.equal((await hc.marker()).on, false);
    assert.ok(await page.getByRole("button", { name: "My family" }).isHidden());
    await typed(page);
    await page.screenshot({ path: `${OUT}/family-list.png` });

    // A pick marks the card and the person, and asks for the line.
    await card(page, 2).click();
    await said(page, "What should they say?");
    assert.equal(await card(page, 2).getAttribute("aria-pressed"), "true");
    assert.equal(await card(page, 0).getAttribute("aria-pressed"), "false");
    assert.deepEqual(await hc.marker().then(({ on, familyId, index }) => ({ on, familyId, index })), { on: true, familyId: GARCIA.id, index: 2 });
    assert.equal(await page.getByLabel("What should they say").inputValue(), "Is it snowing in Denver this year?");
    assert.equal(await page.getByLabel("What should they say").getAttribute("maxlength"), "40");
    await typed(page);
    await page.screenshot({ path: `${OUT}/family-picked.png` });

    // Save: the same path as before. The person says it in the room, and the panel thanks the guest.
    await page.getByLabel("What should they say").fill("See you in the new year!");
    await page.getByRole("button", { name: "Save" }).click();
    await said(page, "Thank you! Who else do you want to change?");
    await page.locator(".bubble", { hasText: "See you in the new year!" }).waitFor();
    assert.deepEqual(spriteCalls(calls).at(-1), { id: GARCIA.id, token: GARCIA.token, index: 2, bubble: "See you in the new year!" });
    assert.equal((await cardLines(page))[2], "See you in the new year!");
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families"))))[0].bubbles[2], "See you in the new year!");
    assert.equal((await hc.marker()).on, false);

    await page.getByRole("button", { name: "Done" }).click();
    await page.locator("#dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "My family" }).waitFor();
  });

  test("New look in the panel changes the person and the card", async () => {
    const { page, calls, hc } = await party();
    await page.getByRole("button", { name: "My family" }).click();
    await card(page, 3).click();
    await page.getByRole("button", { name: "New look" }).click();
    const picker = page.getByRole("dialog", { name: "Pick a look" });
    // A dog sees the pets only, as in the room.
    assert.deepEqual(await picker.locator("h3").allInnerTexts(), ["Dogs", "Cats", "Silly"]);
    await picker.locator('[data-look="t-robodog"]').click();
    await picker.waitFor({ state: "detached" });
    assert.deepEqual(spriteCalls(calls).at(-1), { id: GARCIA.id, token: GARCIA.token, index: 3, look: "t-robodog" });
    assert.equal((await hc.sprite({ familyId: GARCIA.id, index: 3 })).look, "t-robodog");
    // The panel still edits the same person, and New look has the focus again.
    assert.equal(await card(page, 3).getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => document.activeElement?.textContent === "New look");
  });

  test("a tap on your own sprite opens the panel on that person, and Escape steps back", async () => {
    const { page, hc } = await party();
    const p = await hc.pointOn({ familyId: GARCIA.id, index: 1 });
    await page.mouse.click(p.x, p.y);
    await said(page, "What should they say?");
    assert.equal(await card(page, 1).getAttribute("aria-pressed"), "true");
    assert.equal((await hc.marker()).index, 1);
    await page.keyboard.press("Escape");
    await said(page, "Who do you want to change?");
    assert.equal((await hc.marker()).on, false);
    await page.keyboard.press("Escape");
    await page.locator("#dialog").waitFor({ state: "hidden" });
  });

  test("the gold arrow follows the person as they walk", async () => {
    const { page, hc } = await party();
    await hc.pause();
    await hc.stillGuests();
    await page.getByRole("button", { name: "My family" }).click();
    await card(page, 0).click();
    await said(page, "What should they say?");
    const want = { familyId: GARCIA.id, index: 0 };
    await hc.place(want, 60, 150);
    await hc.advance(0.05);
    const at = async () => {
      const [m, s] = [await hc.marker(), await hc.sprite(want)];
      return { tip: m.tip, x: Math.round(s.x), head: Math.round(s.y - s.h) };
    };
    const first = await at();
    assert.equal(first.tip.x, first.x);
    assert.ok(first.tip.y < first.head && first.tip.y >= first.head - 12, JSON.stringify(first));
    // The person moves across the room. The arrow goes with them.
    await hc.place(want, 180, 120);
    await hc.advance(0.05);
    const second = await at();
    assert.equal(second.tip.x, second.x);
    assert.ok(second.tip.y < second.head && second.tip.y >= second.head - 12, JSON.stringify(second));
    // A walk moves the arrow on each frame.
    await page.evaluate(() => window.__hc.place({ familyId: "fam12345", index: 0 }, 180, 120));
    await advanceUntil(page, (h) => h.marker().tip.x === Math.round(h.sprite({ familyId: "fam12345", index: 0 }).x));
  });

  test("on the thank-you, the zoomed camera keeps the picked person in view", async () => {
    const opened = await env.open({ mine: [SIX], reducedMotion: "reduce", wait: "room" });
    const { page, hc } = opened;
    await waitForFamilies(page, { [GARCIA.id]: SIX.members.length });
    await said(page, "Thank you. You mean a lot to us.");
    await hc.pause();
    await hc.stillGuests();
    const p = await hc.pointOn({ familyId: GARCIA.id, index: 4 });
    await page.mouse.click(p.x, p.y);
    await said(page, "What should they say?");
    // The person walks to the far corner. The camera follows, so they stay on the stage.
    await hc.place({ familyId: GARCIA.id, index: 4 }, 30, 175);
    await hc.advance(3);
    const s = await hc.sprite({ familyId: GARCIA.id, index: 4 });
    const point = await hc.toScreen(s.x, s.y - s.h / 2);
    const stage = await page.locator("#stage").boundingBox();
    assert.ok(point.x > stage.x && point.x < stage.x + stage.width && point.y > stage.y && point.y < stage.y + stage.height, JSON.stringify({ point, stage }));
  });

  test("Change address runs the address steps and comes back", async () => {
    const { page, calls } = await party();
    await page.getByRole("button", { name: "My family" }).click();
    await page.getByRole("button", { name: "Change address" }).click();
    await said(page, "We'll mail your card to:");
    assert.equal(calls.filter((c) => c.path === "/api/address/read").at(-1).body.id, GARCIA.id);
    await page.getByRole("button", { name: "Yes, all good" }).click();
    await said(page, "Who do you want to change?");
  });

  test("a browser with two saved families shows the last one, with a switch", async () => {
    const { page } = await party({ mine: [GARCIA, LEES], viewport: { width: 400, height: 844 }, deviceScaleFactor: 2 });
    await page.getByRole("button", { name: "My family" }).click();
    await said(page, "Who do you want to change?");
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Lee Family");
    assert.deepEqual(await cardLines(page), ["No line yet", "Hi!"]);
    await typed(page);
    await page.screenshot({ path: `${OUT}/family-two.png` });
    await page.getByRole("button", { name: "Switch to The Garcia Family" }).click();
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Garcia Family");
    assert.equal(await page.locator(".fam-card").count(), GARCIA.members.length);
    await page.getByRole("button", { name: "Switch to The Lee Family" }).click();
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Lee Family");
  });
});

// The panel fits each screen: four cards on a row, a second row past four, and every button in view.
describe("my family on each screen", { concurrency: true }, () => {
  const SCREENS = [[360, 740], [400, 844], [400, 932], [1440, 900]];
  for (const [width, height] of SCREENS) {
    for (const count of [1, 4, 6]) {
      test(`${count} people at ${width}x${height}`, async () => {
        const fam = { ...SIX, members: SIX.members.slice(0, count), bubbles: SIX.bubbles.slice(0, count) };
        const { page } = await party({ mine: [fam], viewport: { width, height } });
        await page.getByRole("button", { name: "My family" }).click();
        await said(page, "Who do you want to change?");
        await card(page, Math.min(count - 1, 2)).click();
        await said(page, "What should they say?");
        const box = await page.evaluate(() => {
          const r = (el) => el.getBoundingClientRect().toJSON();
          const dialog = document.getElementById("dialog");
          return {
            dialog: r(dialog), cards: [...document.querySelectorAll(".fam-card")].map(r),
            imgs: [...document.querySelectorAll(".fam-card img")].map(r),
            input: r(document.getElementById("f-line")), actions: r(dialog.querySelector(".actions")),
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
        const what = `${width}x${height}, ${count}: ${JSON.stringify(box)}`;
        assert.ok(box.scrollWidth <= width, `no side scroll: ${what}`);
        const rows = [...new Set(box.cards.map((c) => Math.round(c.top)))];
        assert.equal(rows.length, count > 4 ? 2 : 1, `rows: ${what}`);
        assert.ok(box.cards.every((c) => c.left >= box.dialog.left && c.right <= box.dialog.right), `cards inside: ${what}`);
        assert.ok(box.imgs.every((im, i) => im.left >= box.cards[i].left && im.right <= box.cards[i].right && im.height > 0), `figures inside: ${what}`);
        assert.ok(box.cards.every((c) => c.height >= 44 && c.width >= 44), `tap size: ${what}`);
        // The line and the buttons show in the dialog, also when it scrolls.
        assert.ok(box.input.top >= box.dialog.top && box.input.bottom <= box.actions.top + 1, `input in view: ${what}`);
        assert.ok(box.actions.bottom <= box.dialog.bottom + 1 && box.actions.bottom <= height, `buttons in view: ${what}`);
      });
    }
  }
});
