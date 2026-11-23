// Demo mode ("/#demo"): the site as a guest who just signed up, with a made-up family. Nothing leaves the page:
// no write call reaches the API, and the browser's own families and finds stay as they were.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, said, typed, tuckNow, waitForFamilies, tapRoom } from "./harness.mjs";

const env = await e2e();
const READS = ["/api/party", "/api/config", "/api/places", "/api/place"];
const writes = (calls) => calls.filter((c) => !READS.includes(c.path));
const stored = (page) => page.evaluate(() => ({ families: localStorage.getItem("hc.families"), found: localStorage.getItem("hc.found") }));

describe("demo mode", { concurrency: true }, () => {
  test("#demo plays the thank-you with a made-up family, and every write stays in the page", async () => {
    const { page, calls, hc } = await env.open({ query: "#demo", mine: [GARCIA], viewport: { width: 400, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce", wait: "eggs" });
    const before = { families: JSON.stringify([GARCIA]), found: null };

    // The moment after a sign-up: the family walks in, and the hosts thank them.
    await said(page, "Thank you. You mean a lot to us.");
    await waitForFamilies(page, { "demo-family": 4, other1: 2 });
    assert.equal(await page.locator("#demo-tag").innerText(), "Demo");
    assert.equal((await hc.sprites({ familyId: GARCIA.id })).length, 0, "the browser's own family stays out of the demo");
    await typed(page);
    await page.screenshot({ path: `${OUT}/demo-thanks.png` });
    await tuckNow(page);
    assert.equal((await hc.idle()).on, true, "the hosts give hints, as to a guest who signed up");
    await page.screenshot({ path: `${OUT}/demo-party.png` });

    // My family: a new line and a new look.
    await page.getByRole("button", { name: "My family" }).click();
    await said(page, "Who do you want to change?");
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Demo Family");
    await page.locator('.fam-card[data-index="1"]').click();
    await page.getByLabel("What should they say").fill("Hello from the demo");
    await page.getByRole("button", { name: "Save" }).click();
    await page.locator(".bubble", { hasText: "Hello from the demo" }).waitFor();
    await page.locator('.fam-card[data-index="3"]').click();
    await page.getByRole("button", { name: "New look" }).click();
    await page.getByRole("dialog", { name: "Pick a look" }).locator('[data-look="t-robodog"]').click();
    await page.getByRole("dialog", { name: "Pick a look" }).waitFor({ state: "detached" });

    // Change address shows a made-up address and saves it in the page only.
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Change address" }).click();
    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Demo Family\n1428 Maple Ave\nEvanston, IL 60201");
    await page.getByRole("button", { name: "Change it" }).click();
    await page.getByLabel("Name on the envelope").fill("The Demo Crew");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Same address" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Yes, save it" }).click();
    await said(page, "Got it. Thank you for telling us!");
    await page.locator("#dialog .speaker", { hasText: "The Demo Crew" }).waitFor();
    await page.getByRole("button", { name: "Change address" }).click();
    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Demo Crew\n1428 Maple Ave\nEvanston, IL 60201");
    await page.getByRole("button", { name: "Yes, all good" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.locator("#dialog").waitFor({ state: "hidden" });
    await hc.advance(3);

    // A hidden extra counts in the page, and no record goes out. The silly look on the dog counted already.
    const found = (await hc.counter()).found;
    const lamp = await hc.spotCenter("lamp");
    await tapRoom(page, lamp.x, lamp.y, { touch: false });
    await page.waitForFunction(() => window.__hc.interactionsSent() > 1);
    assert.equal((await hc.counter()).found, found + 1);

    assert.deepEqual(writes(calls), [], "no write call reaches the API");
    assert.deepEqual(await stored(page), before, "the browser's own families and finds stay as they were");

    // A reload of #demo starts fresh.
    await page.reload();
    await said(page, "Thank you. You mean a lot to us.");
    await waitForFamilies(page, { "demo-family": 4 });
    await tuckNow(page);
    assert.equal((await hc.counter()).found, 0);
    await page.getByRole("button", { name: "My family" }).click();
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Demo Family");
    assert.equal(await page.locator('.fam-card[data-index="1"] .fam-line').innerText(), "No line yet");

    // The site with no #demo shows the browser's real state.
    await page.goto(env.base);
    await page.waitForFunction(() => window.__hc);
    await said(page, "Thank you. You mean a lot to us.");
    await waitForFamilies(page, { [GARCIA.id]: GARCIA.members.length });
    assert.ok(await page.locator("#demo-tag").isHidden());
    assert.equal((await hc.sprites({ familyId: "demo-family" })).length, 0);
    await tuckNow(page);
    await page.getByRole("button", { name: "My family" }).click();
    assert.equal(await page.locator("#dialog .speaker").innerText(), "The Garcia Family");
    assert.deepEqual(writes(calls), []);
  });

  test("a browser with no family sees the demo, and then the form again", async () => {
    const { page, calls } = await env.open({ query: "#demo", reducedMotion: "reduce" });
    await said(page, "Thank you. You mean a lot to us.");
    await page.goto(env.base);
    await said(page, "We're sending holiday cards! Whose name goes on the envelope?");
    assert.ok(await page.locator("#demo-tag").isHidden());
    assert.deepEqual(writes(calls), []);
  });

  test("a guest never sees the Demo label", async () => {
    const { page } = await env.open({ mine: [GARCIA], reducedMotion: "reduce", wait: "room" });
    await said(page, "Thank you. You mean a lot to us.");
    assert.ok(await page.locator("#demo-tag").isHidden());
  });
});
