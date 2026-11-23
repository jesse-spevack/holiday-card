// An invite link (pnpm invite): the friend confirms or fixes the address, signs up, and joins the party.
// A used link opens the party as that family in a new browser. A bad link gives the normal form with a kind line.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, INVITE, said, typed, waitForFamilies } from "./harness.mjs";

const env = await e2e();
const submits = (calls) => calls.filter((c) => c.path === "/api/submit").map((c) => c.body);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("hc.families")) || []);
const hash = (page) => page.evaluate(() => location.hash);

describe("an invite link", { concurrency: true }, () => {
  test("a friend confirms the address, says who lives there, and joins the party", async () => {
    const { page, calls } = await env.open({ query: `#invite=${INVITE.NEW}`, viewport: { width: 400, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await said(page, "Is this where we should send your card?");
    assert.equal(await page.locator(".address").innerText(), "The Lovelaces\n77 Fifth Ave, Apt 3\nNew York, NY 10003");
    assert.deepEqual(calls.find((c) => c.path === "/api/invite").body, { token: INVITE.NEW });
    await typed(page);
    await page.screenshot({ path: `${OUT}/invite-confirm.png` });

    await page.getByRole("button", { name: "Yes, that's us" }).click();
    await said(page, "Who lives at your house?");
    assert.equal(await page.getByLabel("Who lives at your house").inputValue(), "Ada and Bo");
    await page.getByLabel("Who lives at your house").fill("Ada, Bo, and Cy");
    // The first save fails in the fake API, so the button works again.
    await page.getByRole("button", { name: "Join the party" }).click();
    await page.getByRole("alert").filter({ hasText: "Something went wrong. Try again?" }).waitFor();
    await page.getByRole("button", { name: "Join the party" }).click();
    await said(page, "Thank you. You mean a lot to us.");

    const body = submits(calls).at(-1);
    assert.equal(body.invite, INVITE.NEW);
    assert.equal(body.envelope, "The Lovelaces");
    assert.equal(body.household, "Ada, Bo, and Cy");
    assert.deepEqual(body.address, { ...INVITE.data.address, formatted: "77 Fifth Ave", manual: false });
    const [mine] = await saved(page);
    assert.deepEqual([mine.id, mine.token, mine.name], [INVITE.family.id, INVITE.NEW, "The Lovelaces"]);
    // The link token leaves the address bar once the friend joins.
    assert.equal(await hash(page), "");
    await waitForFamilies(page, { [INVITE.family.id]: 4 });
  });

  test("a friend fixes the address and the envelope name on the way", async () => {
    const { page, calls } = await env.open({ query: `#invite=${INVITE.NEW}`, reducedMotion: "reduce" });
    await said(page, "Is this where we should send your card?");
    await page.getByRole("button", { name: "Fix it" }).click();
    await said(page, "Whose name goes on the envelope?");
    assert.equal(await page.getByLabel("Name on the envelope").inputValue(), "The Lovelaces");
    await page.getByLabel("Name on the envelope").fill("Ada & Bo Lovelace");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "Where should we mail your card?");
    await page.getByLabel("Street address").fill("1428 Maple");
    await page.getByRole("button", { name: /1428 Maple Avenue/ }).click();
    await page.getByLabel("Apartment or unit").fill("");
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "We'll mail your card to:");
    assert.equal(await page.locator(".address").innerText(), "Ada & Bo Lovelace\n1428 Maple Ave\nEvanston, IL 60201");
    await page.getByRole("button", { name: "Yes, send it" }).click();
    await page.getByRole("button", { name: "Yes, send it" }).click();
    await said(page, "Thank you. You mean a lot to us.");
    const body = submits(calls).at(-1);
    assert.equal(body.invite, INVITE.NEW);
    assert.equal(body.envelope, "Ada & Bo Lovelace");
    assert.equal(body.address.street, "1428 Maple Ave");
  });

  test("'Same address' keeps the invite address after a fix of the name", async () => {
    const { page, calls } = await env.open({ query: `#invite=${INVITE.NEW}`, reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Fix it" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Same address" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    assert.equal(await page.locator(".address").innerText(), "The Lovelaces\n77 Fifth Ave, Apt 3\nNew York, NY 10003");
    await page.getByRole("button", { name: "Yes, send it" }).click();
    await page.getByRole("alert").filter({ hasText: "Something went wrong" }).waitFor();
    assert.equal(submits(calls).length, 1);
  });

  test("a used link in a new browser opens the party as that family", async () => {
    const { page, calls } = await env.open({ query: `#invite=${INVITE.USED}`, reducedMotion: "reduce", wait: "room" });
    await said(page, "Thank you. You mean a lot to us.");
    await waitForFamilies(page, { [INVITE.family.id]: 2, other1: 2 });
    const [mine] = await saved(page);
    assert.deepEqual(mine, { ...INVITE.family, token: INVITE.USED });
    assert.equal(await hash(page), "");
    assert.equal(submits(calls).length, 0);
    // A reload is a plain return visit.
    await page.reload();
    await said(page, "Thank you. You mean a lot to us.");
    assert.equal((await saved(page)).length, 1);
  });

  test("a used link in a browser with another family adds this family too", async () => {
    const { page } = await env.open({ query: `#invite=${INVITE.USED}`, mine: [GARCIA], reducedMotion: "reduce", wait: "room" });
    await said(page, "Thank you. You mean a lot to us.");
    await waitForFamilies(page, { [INVITE.family.id]: 2, [GARCIA.id]: 2 });
    assert.deepEqual((await saved(page)).map((f) => f.id), [GARCIA.id, INVITE.family.id]);
  });

  test("a new link in a browser with a family asks the friend to confirm first", async () => {
    const { page } = await env.open({ query: `#invite=${INVITE.NEW}`, mine: [GARCIA], reducedMotion: "reduce", wait: "room" });
    await said(page, "Is this where we should send your card?");
    assert.ok(await page.locator("#dialog").isVisible());
  });

  test("a bad link gives the normal form with a kind line", async () => {
    const { page, calls } = await env.open({ query: "#invite=not-a-real-token-at-all-000000", reducedMotion: "reduce" });
    await said(page, "We couldn't open that invitation, but we'd still love to send you a card! Whose name goes on the envelope?");
    assert.equal(await hash(page), "");
    await page.getByLabel("Name on the envelope").fill("The Garcia Family");
    await page.getByRole("button", { name: "Next" }).click();
    await said(page, "Who lives at your house?");
    await page.getByRole("button", { name: "Back" }).click();
    await said(page, "We're sending holiday cards! Whose name goes on the envelope?");
    assert.equal(calls.filter((c) => c.path === "/api/invite").length, 1);
  });
});
