// The sign-up form, the party after it, the sprite editor, the look picker, and a return visit.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, assertWholeRoom, wholeRoom, nightState, assertTucks, said, typed, waitForFamilies } from "./harness.mjs";

const env = await e2e();

// Each test opens its own page, so they run at the same time.
describe("the form", { concurrency: true }, () => {
  test("a new guest signs up on a phone, edits a sprite, and comes back", async () => {
    const { page, calls, hc } = await env.open({ deviceScaleFactor: 1, reducedMotion: "reduce" });
    const spriteCalls = () => calls.filter((c) => c.path === "/api/sprite");

    await said(page, "Whose name goes on the envelope?");
    // the hosts sign as "Jesse, Jess, Eddie & Audrey Spevack"
    assert.equal(await page.title(), "Holiday cards from Jesse, Jess, Eddie & Audrey Spevack");
    assert.equal(await page.locator("#dialog .speaker").innerText(), "Jesse, Jess, Eddie & Audrey Spevack");
    // a phone shows the whole room, wall to wall
    await page.waitForFunction(() => window.__hc.loaded().room);
    await assertWholeRoom(page, "phone, step 1");
    assert.ok(await page.getByRole("button", { name: "Add another address" }).isHidden());
    // The glint and the counter help a first-time visitor from the start. The hosts do not speak on their own over the form.
    await page.waitForFunction(() => window.__hc.glint().on && window.__hc.counter().shown);
    assert.equal((await hc.idle()).on, false);
    // password managers stay out of the dialog
    assert.equal(await page.getByLabel("Name on the envelope").getAttribute("data-1p-ignore"), "");
    assert.equal(await page.getByLabel("Name on the envelope").getAttribute("autocomplete"), "off");

    // blank answer
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("alert").filter({ hasText: "We need something here." }).waitFor();

    await page.getByLabel("Name on the envelope").fill("The Garcia Family");
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "Who lives at your house?");
    await page.getByLabel("Who lives at your house").fill("Sofia, Dan, Mia, and Biscuit the corgi");
    await page.getByLabel("Who lives at your house").press("Enter");

    await said(page, "Where should we mail your card?");
    // the household is read while the guest types the address, and 4 sprites wait at the door
    await waitForFamilies(page, { pending: 4 });
    assert.equal(calls.filter((c) => c.path === "/api/household").length, 1);

    // no match offers to use the typed address
    await page.getByLabel("Street address").fill("zzzz nowhere");
    await page.getByText("We can't find that one.").waitFor();
    await page.getByRole("button", { name: "Use what I typed" }).waitFor();

    await page.getByLabel("Street address").fill("1428 Maple");
    await page.getByRole("button", { name: /1428 Maple Avenue/ }).click();
    await page.screenshot({ path: `${OUT}/3-address.png` });

    await said(page, "Apartment or unit?");
    await page.getByLabel("Apartment or unit").fill("Apt 2B");
    await page.getByRole("button", { name: "Next" }).click();

    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Garcia Family\n1428 Maple Ave, Apt 2B\nEvanston, IL 60201");
    await page.screenshot({ path: `${OUT}/4-confirm.png` });

    // first save fails, retry works
    await page.getByRole("button", { name: "Yes, send it" }).click();
    await page.getByRole("alert").filter({ hasText: "Something went wrong. Try again?" }).waitFor();
    await page.getByRole("button", { name: "Yes, send it" }).click();
    await said(page, "Thank you. You mean a lot to us.");
    await page.locator("#dialog .hint").filter({ hasText: "Your family is at our party now. Tap them to change a look or say something." }).waitFor();
    // the thank-you tells the guest that the room hides surprises
    await page.locator("#dialog .hint.surprise").filter({ hasText: "Tap around the room. We hid some surprises." }).waitFor();
    assert.ok(await page.locator("#dialog").isVisible());
    // while the dialog shows, the greeting stays away
    assert.equal((await nightState(page)).greeting, false);
    assert.equal((await hc.idle()).on, false, "no host line of their own over the thank-you");
    await assertTucks(page);
    // After the sign-up and the thank-you, the hosts speak on their own.
    assert.equal((await hc.idle()).on, true);
    await assertWholeRoom(page, "phone, thank-you hidden");
    // a tall phone fills the bands: a night sky with a snowy roof above the room, and the greeting below it
    await page.locator(".night-greeting").waitFor();
    const night = await nightState(page);
    assert.ok(night.sky && night.aboveRoom, JSON.stringify(night));
    assert.deepEqual(night.gable, [0x34, 0x40, 0x5f], `the gable wall sits above the room: ${JSON.stringify(night)}`);
    assert.ok(night.sky0.every((c, i) => Math.abs(c - [0x1b, 0x1a, 0x2e][i]) <= 6), `the sky starts at the page color: ${JSON.stringify(night)}`);
    assert.equal(night.greeting, "Happy holidays from Jesse, Jess, Eddie & Audrey Spevack");
    assert.ok(night.greetingBelowRoom, JSON.stringify(night));
    await assertWholeRoom(page, "phone, with the night around the room");
    await page.screenshot({ path: `${OUT}/5-tucked.png` });

    const submitted = calls.filter((c) => c.path === "/api/submit").at(-1).body;
    assert.equal(submitted.envelope, "The Garcia Family");
    assert.equal(submitted.address.unit, "Apt 2B");
    assert.deepEqual(submitted.members.map((m) => m.type), ["adult", "adult", "kid", "dog"]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families")));
    assert.equal(saved[0].id, "fam12345");
    // the family's name shows only on hover
    assert.equal(await page.locator(".tag").count(), 0);
    const garcia = await hc.pointOn({ familyId: "fam12345" });
    await page.mouse.move(garcia.x, garcia.y);
    await page.locator(".tag", { hasText: "The Garcia Family" }).waitFor();
    await page.mouse.move(2, 2);
    await page.locator(".tag").waitFor({ state: "detached" });

    // hovering over the hosts shows each of their names (the camera is back on the whole room)
    const host = await hc.pointOn({ host: true, name: "Jesse" });
    await page.mouse.move(host.x, host.y);
    await page.locator(".tag", { hasText: "Eddie" }).waitFor();
    assert.deepEqual((await page.locator(".tag").allInnerTexts()).sort(), ["Audrey", "Eddie", "Jess", "Jesse"]);
    await page.mouse.move(2, 2);
    await page.screenshot({ path: `${OUT}/5-done.png` });

    // tap your own sprite, say something
    const mine = await hc.pointOn({ familyId: "fam12345" });
    await page.mouse.click(mine.x, mine.y);
    await page.getByLabel("Say something").fill("We love you guys");
    await page.getByRole("button", { name: "Save" }).click();
    await page.locator(".bubble", { hasText: "We love you guys" }).waitFor();
    const bubbleCall = spriteCalls().at(-1).body;
    assert.deepEqual({ id: bubbleCall.id, token: bubbleCall.token, bubble: bubbleCall.bubble }, { id: "fam12345", token: "tok", bubble: "We love you guys" });
    await page.screenshot({ path: `${OUT}/6-bubble.png` });

    // "New look" opens the look picker: people oldest first, silly looks last, and the current look marked
    const parent = await hc.pointOn({ familyId: "fam12345", index: 0 });
    await page.mouse.click(parent.x, parent.y);
    await page.getByRole("button", { name: "New look" }).click();
    const picker = page.getByRole("dialog", { name: "Pick a look" });
    await picker.waitFor();
    assert.deepEqual(await picker.locator("h3").allInnerTexts(), ["Grown-ups", "Teens", "Kids", "Babies", "Silly"]);
    assert.deepEqual(await picker.locator(".look-tile").evaluateAll((ts) => ts.map((t) => t.dataset.look)),
      ["t-gran", "t-mom", "t-dad", "t-teen", "t-kid", "t-baby", "t-robot", "t-ninja"]);
    assert.deepEqual(await picker.locator(".look-tile[aria-current]").evaluateAll((ts) => ts.map((t) => t.dataset.look)), [parent.look]);
    const tileBox = await picker.locator(".look-tile").first().boundingBox();
    assert.ok(tileBox.width >= 44 && tileBox.height >= 44, JSON.stringify(tileBox));
    await page.screenshot({ path: `${OUT}/9-picker.png` });

    // Escape leaves the look as it was
    const before = spriteCalls().length;
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    assert.equal(spriteCalls().length, before);

    // picking a silly look changes the sprite and saves it
    await page.getByRole("button", { name: "New look" }).click();
    await picker.locator('[data-look="t-ninja"]').click();
    await picker.waitFor({ state: "detached" });
    assert.deepEqual(spriteCalls().at(-1).body, { id: "fam12345", token: "tok", index: 0, look: "t-ninja" });
    assert.equal((await hc.sprite({ familyId: "fam12345", index: 0 })).look, "t-ninja");
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families"))))[0].members[0].look, "t-ninja");

    // a pet sees only pets
    await page.mouse.click(2, 2);
    const pet = await hc.pointOn({ familyId: "fam12345", index: 3 });
    await page.mouse.click(pet.x, pet.y);
    await page.getByRole("button", { name: "New look" }).click();
    assert.deepEqual(await picker.locator("h3").allInnerTexts(), ["Dogs", "Cats", "Silly"]);
    assert.deepEqual(await picker.locator(".look-tile").evaluateAll((ts) => ts.map((t) => t.dataset.look)), ["t-dog", "t-cat", "t-robodog"]);
    await picker.getByRole("button", { name: "Close" }).click();
    await picker.waitFor({ state: "detached" });

    // the editor stays inside the stage when its sprite stands at the room's right edge
    await hc.place({ familyId: "fam12345", index: 1 }, 196, 150);
    const edge = await hc.pointOn({ familyId: "fam12345", index: 1 });
    await page.mouse.click(edge.x, edge.y);
    await page.getByLabel("Say something").waitFor();
    const popFit = await page.evaluate(() => {
      const st = document.getElementById("stage").getBoundingClientRect();
      const pop = document.querySelector(".pop").getBoundingClientRect();
      return { st: [st.left, st.top, st.right, st.bottom], pop: [pop.left, pop.top, pop.right, pop.bottom] };
    });
    assert.ok(popFit.pop[0] >= popFit.st[0] && popFit.pop[1] >= popFit.st[1] && popFit.pop[2] <= popFit.st[2] && popFit.pop[3] <= popFit.st[3], JSON.stringify(popFit));
    await page.screenshot({ path: `${OUT}/6-edge-editor.png` });

    // coming back on the same browser goes straight to the party, and the thank-you hides again
    await page.reload();
    await said(page, "Thank you. You mean a lot to us.");
    await page.waitForFunction(() => window.__hc);
    await waitForFamilies(page, { fam12345: 4, other1: 2 });
    await page.screenshot({ path: `${OUT}/7-return.png` });
    await assertTucks(page);
    await assertWholeRoom(page, "phone, return visit");
    await page.screenshot({ path: `${OUT}/7-return-tucked.png` });

    // "Add another address" in the top bar brings back step 1
    await page.getByRole("button", { name: "Add another address" }).click();
    await said(page, "Whose name goes on the envelope?");
    assert.ok(await page.locator("#dialog").isVisible());
    await page.locator(".night-greeting").waitFor({ state: "hidden" });
    assert.ok(await page.getByRole("button", { name: "Add another address" }).isHidden());
    await assertWholeRoom(page, "phone, after restart");

    // "?new" forgets this browser's families, starts at step 1, keeps the sound setting, and leaves the address clean
    await page.evaluate(() => localStorage.setItem("hc.sound", "off"));
    await page.goto(`${env.base}&new`);
    await said(page, "Whose name goes on the envelope?");
    assert.equal(await page.evaluate(() => localStorage.getItem("hc.families")), null);
    assert.equal(await page.evaluate(() => localStorage.getItem("hc.sound")), "off");
    assert.equal(await page.locator("#sound").getAttribute("aria-pressed"), "false");
    assert.equal(new URL(page.url()).search, "?test");
    await page.waitForFunction(() => window.__hc);
    await waitForFamilies(page, { other1: 2 });
    assert.equal((await hc.sprites({ mine: true })).length, 0);
    await page.reload();
    await said(page, "Whose name goes on the envelope?");
  });

  test("the first screen shows the whole room on phones of two sizes", async () => {
    const { page } = await env.open({ deviceScaleFactor: 2 });
    await said(page, "Whose name goes on the envelope?");
    await typed(page);
    await page.screenshot({ path: `${OUT}/1-start.png` });
    await assertWholeRoom(page, "phone 390x844");
    await page.setViewportSize({ width: 375, height: 667 });
    await assertWholeRoom(page, "phone 375x667");
    await page.screenshot({ path: `${OUT}/1-start-small.png` });
  });

  test("every look in the real library loads, and a new family wears them", async () => {
    const { page } = await env.open({ realLooks: true, reducedMotion: "reduce" });
    const broken = await page.evaluate(async () => {
      const looks = await (await fetch("/assets/looks.json")).json();
      const all = Object.values(looks).flat();
      const bad = [];
      await Promise.all(all.map((l) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok();
        img.onerror = () => { bad.push(l.id); ok(); };
        img.src = "/" + l.src;
      })));
      return { count: all.length, bad };
    });
    assert.deepEqual(broken.bad, []);
    assert.ok(broken.count >= 25, `looks: ${broken.count}`);
    // the look picker sorts people by age, so every person look needs one
    const ageless = await page.evaluate(async () => {
      const looks = await (await fetch("/assets/looks.json")).json();
      const ages = ["older", "adult", "teen", "kid", "baby"];
      return ["adult", "kid", "baby"].flatMap((t) => looks[t]).filter((l) => !ages.includes(l.age)).map((l) => l.id);
    });
    assert.deepEqual(ageless, []);
    await page.getByLabel("Name on the envelope").fill("The Garcia Family");
    await page.getByLabel("Name on the envelope").press("Enter");
    await page.getByLabel("Who lives at your house").fill("Sofia, Dan, Mia, and Biscuit");
    await page.getByLabel("Who lives at your house").press("Enter");
    await waitForFamilies(page, { pending: 4 });
  });

  test("a wide screen shows the whole room, and a return visit gives the room the dialog's column", async () => {
    const { page, hc } = await env.open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", wait: "room" });
    await assertWholeRoom(page, "desktop");
    const host = await hc.pointOn({ host: true, name: "Jesse" });
    await page.mouse.move(host.x, host.y);
    await page.locator(".tag", { hasText: "Eddie" }).waitFor();
    await page.screenshot({ path: `${OUT}/8-desktop.png` });
    // with reduced motion, the hosts stay at home
    await hc.advance(5);
    const { HOSTS } = await hc.constants();
    const away = (await hc.sprites({ host: true })).filter((s) => {
      const home = HOSTS.find((h) => h.name === s.name);
      return s.x !== home.x || s.y !== home.y || s.path;
    });
    assert.deepEqual(away.map((s) => s.name), []);

    // on a return visit to a wide screen, the dialog column hides too and the room grows into it
    const stageWidth = (await wholeRoom(page)).stage[2];
    await page.evaluate((f) => localStorage.setItem("hc.families", JSON.stringify([f])), { ...GARCIA, members: [GARCIA.members[0]], bubbles: [] });
    await page.reload();
    await said(page, "Thank you. You mean a lot to us.");
    await assertTucks(page);
    await assertWholeRoom(page, "desktop, thank-you hidden");
    // This page has reduced motion, so the column does not slide: the stage has its new width at once.
    // The reduced-motion rule in style.css comes after the wide-screen rules. In the other order, the column slides here too.
    const grown = await wholeRoom(page);
    assert.ok(grown.stage[2] > stageWidth + 300, `the stage grows from ${stageWidth}: ${JSON.stringify(grown)}`);
    await assertWholeRoom(page, "desktop, room grown");
    // a wide desktop has no bands above and below the room, so it stays plain
    assert.deepEqual(await nightState(page), { sky: false, greeting: false });
    await page.screenshot({ path: `${OUT}/8-desktop-tucked.png` });
  });
});
