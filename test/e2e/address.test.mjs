// "Change address" in "My family": a guest with a family in this browser sees the address on file and changes it.
// Also the US-only lines on the sign-up form.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, ON_FILE, said, typed, tuckNow, waitForFamilies } from "./harness.mjs";

const env = await e2e();
const LEES = { id: "fam-lee", token: "tok-lee", name: "The Lee Family", members: [{ type: "adult", look: "t-dad" }], bubbles: [""] };

// A return visit, after the thank-you, with the top bar in view.
async function returnVisit(options = {}) {
  const opened = await env.open({ mine: [GARCIA], reducedMotion: "reduce", wait: "room", ...options });
  await waitForFamilies(opened.page, { [GARCIA.id]: GARCIA.members.length });
  await tuckNow(opened.page);
  return opened;
}

const changeCalls = (calls) => calls.filter((c) => c.path === "/api/address/change");
// "My family" in the top bar, then "Change address" in it.
async function openAddress(page) {
  await page.getByRole("button", { name: "My family" }).click();
  await page.getByRole("button", { name: "Change address" }).click();
}

describe("my address", { concurrency: true }, () => {
  test("a returning guest changes the address and the envelope name", async () => {
    const { page, calls, hc } = await returnVisit({ viewport: { width: 400, height: 844 }, deviceScaleFactor: 2 });
    await openAddress(page);

    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Garcia Family\n1428 Maple Ave, Apt 2B\nEvanston, IL 60201");
    const read = calls.find((c) => c.path === "/api/address/read");
    assert.deepEqual(read.body, { id: GARCIA.id, token: GARCIA.token });
    // The top bar buttons hide while the dialog shows.
    assert.ok(await page.getByRole("button", { name: "My family" }).isHidden());
    await typed(page);
    await page.screenshot({ path: `${OUT}/address-on-file.png` });

    await page.getByRole("button", { name: "Change it" }).click();
    await said(page, "Whose name goes on the envelope?");
    assert.equal(await page.getByLabel("Name on the envelope").inputValue(), "The Garcia Family");
    await page.getByLabel("Name on the envelope").fill("The Garcia-Lee Family");
    await page.getByRole("button", { name: "Next" }).click();

    // The household step is not part of a change.
    await said(page, "Where should we mail your card?");
    await page.getByLabel("Street address").fill("1428 Maple");
    await page.getByRole("button", { name: /1428 Maple Street/ }).click();
    await said(page, "Apartment or unit?");
    assert.equal(await page.getByLabel("Apartment or unit").inputValue(), "Apt 2B");
    await page.getByLabel("Apartment or unit").fill("");
    await page.getByRole("button", { name: "Next" }).click();

    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Garcia-Lee Family\n1428 Maple Ave\nEvanston, IL 60201");
    assert.equal(calls.filter((c) => c.path === "/api/submit").length, 0);
    await page.getByRole("button", { name: "Yes, save it" }).click();

    await said(page, "Got it. Thank you for telling us!");
    const [change] = changeCalls(calls);
    assert.deepEqual(change.body, {
      id: GARCIA.id, token: GARCIA.token, envelope: "The Garcia-Lee Family",
      address: { street: "1428 Maple Ave", city: "Evanston", state: "IL", zip: "60201", formatted: "1428 Maple Ave, Evanston, IL 60201, USA", unit: "" },
    });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families")));
    assert.equal(saved[0].name, "The Garcia-Lee Family");
    // The thank-you goes back to My family on its own, with the new name. Done shows the party with the new name.
    await page.locator("#dialog .speaker", { hasText: "The Garcia-Lee Family" }).waitFor();
    await said(page, "Who do you want to change?");
    await page.getByRole("button", { name: "Done" }).click();
    await page.locator("#dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "My family" }).waitFor();
    const at = await hc.pointOn({ familyId: GARCIA.id });
    await page.mouse.move(at.x, at.y);
    await page.locator(".tag", { hasText: "The Garcia-Lee Family" }).waitFor();
  });

  test("'Yes, all good' closes with no change, and 'Same address' keeps the address", async () => {
    const { page, calls } = await returnVisit();
    await openAddress(page);
    await page.getByRole("button", { name: "Yes, all good" }).click();
    await said(page, "Who do you want to change?");
    assert.equal(changeCalls(calls).length, 0);

    // A second look reads the address again, and a new envelope name can keep the old address.
    await page.getByRole("button", { name: "Change address" }).click();
    await page.getByRole("button", { name: "Change it" }).click();
    await page.getByLabel("Name on the envelope").fill("The Garcias");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Same address" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    assert.equal(await page.locator(".address").innerText(), "The Garcias\n1428 Maple Ave, Apt 2B\nEvanston, IL 60201");
    await page.getByRole("button", { name: "Yes, save it" }).click();
    await said(page, "Got it.");
    assert.equal(calls.filter((c) => c.path === "/api/address/read").length, 2);
    assert.deepEqual(changeCalls(calls)[0].body.address, { ...ON_FILE.address, formatted: "1428 Maple Ave", manual: false });
  });

  test("a family with no address on file tells it again", async () => {
    const { page, calls } = await returnVisit({ onFile: null });
    await openAddress(page);
    await said(page, "we can't find your address");
    await page.getByRole("button", { name: "Next" }).click();
    assert.equal(await page.getByLabel("Name on the envelope").inputValue(), GARCIA.name);
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "Where should we mail your card?");
    assert.equal(await page.getByRole("button", { name: "Same address" }).count(), 0);
    await page.getByLabel("Street address").fill("1428 Maple");
    await page.getByRole("button", { name: /1428 Maple Avenue/ }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "Yes, save it" }).click();
    await said(page, "Got it.");
    assert.equal(changeCalls(calls).length, 1);
  });

  test("a browser with two families changes the address of the family on show", async () => {
    const onFile = (id) => (id === LEES.id ? { envelope: LEES.name, address: { street: "9 Elm St", unit: "", city: "Denver", state: "CO", zip: "80203" } } : ON_FILE);
    const { page, calls } = await returnVisit({ mine: [GARCIA, LEES], onFile });
    await openAddress(page);
    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "The Lee Family\n9 Elm St\nDenver, CO 80203");
    assert.equal(calls.find((c) => c.path === "/api/address/read").body.id, LEES.id);
    // Back goes to My family of the same family.
    await page.getByRole("button", { name: "Yes, all good" }).click();
    await page.locator("#dialog .speaker", { hasText: "The Lee Family" }).waitFor();
  });
});

describe("US addresses only", { concurrency: true }, () => {
  async function toAddressStep() {
    const opened = await env.open({ reducedMotion: "reduce" });
    const { page } = opened;
    await page.getByLabel("Name on the envelope").fill("The Garcia Family");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Who lives at your house").fill("Sofia and Dan");
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "Where should we mail your card?");
    return opened;
  }

  test("a typed address must name a US state, and a country outside the US fails", async () => {
    const { page } = await toAddressStep();
    await page.getByLabel("Street address").fill("zzzz 221 Baker St, London NW1 6XE");
    await page.getByRole("button", { name: "Use what I typed" }).click();
    await page.getByRole("alert").filter({ hasText: "Add the city and state, like Ely, MN. We can only mail cards inside the US." }).waitFor();

    await page.getByLabel("Street address").fill("zzzz 12 Rue de Rivoli, Paris, France");
    await page.getByRole("button", { name: "Use what I typed" }).waitFor();
    await page.getByRole("button", { name: "Use what I typed" }).click();
    await page.getByRole("alert").filter({ hasText: "Sorry, we can only mail cards inside the US." }).waitFor();
    await page.screenshot({ path: `${OUT}/address-not-us.png` });

    await page.getByLabel("Street address").fill("zzzz Box 12, Rural Route 3, Ely MN");
    await page.getByRole("button", { name: "Use what I typed" }).waitFor();
    await page.getByRole("button", { name: "Use what I typed" }).click();
    await said(page, "Apartment or unit?");
  });

  test("a picked place outside the US fails with the host line", async () => {
    const { page } = await toAddressStep();
    await page.getByLabel("Street address").fill("10 Downing");
    await page.getByRole("button", { name: /10 Downing Street/ }).click();
    await page.getByRole("alert").filter({ hasText: "Sorry, we can only mail cards inside the US." }).waitFor();
    assert.equal(await page.locator("#f-address").count(), 1);
  });

  test("the change refuses a typed address outside the US", async () => {
    const { page, calls } = await returnVisit();
    await openAddress(page);
    await page.getByRole("button", { name: "Change it" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Street address").fill("zzzz 55 King St W, Toronto ON, Canada");
    await page.getByRole("button", { name: "Use what I typed" }).click();
    await page.getByRole("alert").filter({ hasText: "Sorry, we can only mail cards inside the US." }).waitFor();
    assert.equal(changeCalls(calls).length, 0);
  });
});
