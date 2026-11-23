// The hidden pet reactions: a tap on a dog or a cat makes it hop or stretch, with a sound.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, tuckNow, waitForFamilies } from "./harness.mjs";

const env = await e2e();
const PARKS = { families: [{ id: "pets1", name: "The Parks", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }, { type: "cat", look: "t-cat" }], bubbles: ["", "", ""] }] };
const GARCIAS = [{ id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] }];

// Each test opens its own page, so they run at the same time.
describe("the pets", { concurrency: true }, () => {
  test("a tap on a pet makes it react, and your own pet opens the editor too", async () => {
    const { page, hc } = await env.open({ deviceScaleFactor: 2, hasTouch: true, party: PARKS, mine: GARCIAS, wait: "room" });
    await waitForFamilies(page, { pets1: 3, fam12345: 2 });
    await tuckNow(page);
    // the guests stand still in clear spots, so a tap lands where the test aims
    const spots = [[{ familyId: "pets1", index: 0 }, 104, 118], [{ familyId: "pets1", index: 1 }, 124, 118], [{ familyId: "pets1", index: 2 }, 144, 118],
      [{ familyId: "fam12345", index: 0 }, 132, 148], [{ familyId: "fam12345", index: 1 }, 152, 148]];
    for (const [want, x, y] of spots) await hc.place(want, x, y);
    await hc.stillGuests();
    await hc.stillHosts();
    await hc.spySounds(["woof", "mrrp", "select"]);
    // The scene clock stops, so each screenshot shows the reaction at a set time after the tap.
    await hc.pause();
    const reaction = async (want) => (await hc.sprite(want)).react;

    // another family's dog hops, woofs, and still shows the family's name
    const dog = await hc.pointOn({ familyId: "pets1", type: "dog" });
    await page.touchscreen.tap(dog.x, dog.y);
    await page.locator(".tag", { hasText: "The Parks" }).waitFor();
    assert.equal((await reaction({ familyId: "pets1", type: "dog" }))?.kind, "dog");
    assert.deepEqual(await hc.sounds(), ["woof"]);
    await hc.advance(0.09);
    await page.screenshot({ path: `${OUT}/pet-dog.png` });

    // another family's cat stretches, says mrrp, and shows a heart
    const cat = await hc.pointOn({ familyId: "pets1", type: "cat" });
    await page.touchscreen.tap(cat.x, cat.y);
    await page.locator(".tag", { hasText: "The Parks" }).waitFor();
    assert.equal((await reaction({ familyId: "pets1", type: "cat" }))?.kind, "cat");
    assert.deepEqual(await hc.sounds(), ["mrrp"]);
    await hc.advance(0.3);
    await page.screenshot({ path: `${OUT}/pet-cat.png` });
    assert.equal(await page.locator(".fam-grid").count(), 0, "another family's pet never opens My family");

    // your own pet reacts, and My family opens on it too, with the woof in place of the chime.
    // A pet gets a line and a new look, as a person does.
    const ownDog = await hc.pointOn({ familyId: "fam12345", type: "dog" });
    await page.touchscreen.tap(ownDog.x, ownDog.y);
    await page.getByLabel("What should they say").waitFor();
    await page.getByRole("button", { name: "New look" }).waitFor();
    assert.equal((await reaction({ familyId: "fam12345", type: "dog" }))?.kind, "dog");
    assert.deepEqual(await hc.sounds(), ["woof"]);
    // a person in your family opens My family with its chime, and does not react
    const ownMom = await hc.pointOn({ familyId: "fam12345", type: "adult" });
    await page.touchscreen.tap(ownMom.x, ownMom.y);
    await page.waitForFunction(() => document.querySelector('.fam-card[aria-pressed="true"]')?.dataset.index === "0");
    assert.equal(await reaction({ familyId: "fam12345", type: "adult" }), null);
    assert.deepEqual(await hc.sounds(), ["select"]);
  });

  test("the pet moves, the silly pets, reduced motion, and soft sounds", async () => {
    const { page } = await env.open();
    const facts = await page.evaluate(async () => {
      const { petPose, reactionKind, drawPet } = await import("/js/extras/pets.js");
      const { woof, mrrp, puff } = await import("/js/sound.js");
      const lift = (still) => {
        const moves = [];
        const g = { save() {}, restore() {}, rotate() {}, scale() {}, drawImage() {}, translate: (x, y) => moves.push(y) };
        drawPet(g, { img: { width: 10, height: 20 }, react: { kind: "dog", at: 0 } }, 0, 0, 0.11, still);
        return 20 - moves[0];
      };
      const loud = async (play) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        play(ctx, ctx.destination);
        const data = (await ctx.startRendering()).getChannelData(0);
        let peak = 0, last = 0;
        data.forEach((v, i) => { if (Math.abs(v) > peak) peak = Math.abs(v); if (Math.abs(v) > 0.001) last = i; });
        return { peak, ms: (last / 48000) * 1000 };
      };
      return {
        dogHop: petPose("dog", 0.11).dy,
        catStretch: petPose("cat", 0.3).stretch,
        after: petPose("dog", 5),
        silly: ["dog-11", "dog-12", "cat-07", "cat-08", "dog-01", "cat-01"].map((look) => reactionKind({ look, type: look.slice(0, 3) })),
        lift: lift(false),
        stillLift: lift(true),
        sounds: { woof: await loud(woof), mrrp: await loud(mrrp), puff: await loud(puff) },
      };
    });
    assert.ok(facts.dogHop >= 3, `dog hop ${facts.dogHop}`);
    assert.ok(facts.catStretch >= 2, `cat stretch ${facts.catStretch}`);
    assert.deepEqual(facts.after, { dx: 0, dy: 0, tilt: 0, stretch: 0 });
    assert.deepEqual(facts.silly, ["robot", "dragon", "alien", "penguin", "dog", "cat"]);
    assert.ok(facts.lift >= 3, `a dog lifts ${facts.lift} pixels`);
    assert.equal(facts.stillLift, 0, "with reduced motion, a pet does not hop");
    for (const [name, { peak, ms }] of Object.entries(facts.sounds)) {
      assert.ok(peak > 0.01 && peak < 0.2, `${name} peak ${peak}`);
      assert.ok(ms > 100 && ms < 700, `${name} length ${ms} ms`);
    }
  });
});
