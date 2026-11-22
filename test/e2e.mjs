// End-to-end test of the page in Chromium with a fake API.
// Run: pnpm e2e   (serves ./public on a local port with Google Chrome, no Cloudflare needed)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = new URL("../public/", import.meta.url).pathname;
const ART = new URL("../art/assets/characters/", import.meta.url).pathname;
const OUT = process.env.E2E_OUT || "build/e2e";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

// Test looks use the committed sample guests, so the test does not depend on the looks library.
const LOOKS = {
  adult: [{ id: "t-mom", src: "/t/guest-mom.png" }, { id: "t-dad", src: "/t/guest-dad.png" }],
  kid: [{ id: "t-kid", src: "/t/guest-kid.png" }],
  dog: [{ id: "t-dog", src: "/t/guest-dog.png" }],
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    const file = path.startsWith("/t/") ? join(ART, path.slice(3)) : join(ROOT, path === "/" ? "index.html" : path);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/?test`;
await mkdir(OUT, { recursive: true });

const calls = [];
let failSubmitOnce = true;
async function fakeApi(route) {
  const url = new URL(route.request().url());
  const body = route.request().postDataJSON?.() ?? null;
  calls.push({ path: url.pathname, body });
  const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  switch (url.pathname) {
    case "/api/household":
      return reply({ members: [{ type: "adult" }, { type: "adult" }, { type: "kid" }, { type: "dog" }] });
    case "/api/places":
      return reply({ suggestions: url.searchParams.get("q").includes("zzzz") ? [] : [
        { id: "p1", main: "1428 Maple Avenue", secondary: "Evanston, IL, USA" },
        { id: "p2", main: "1428 Maple Street", secondary: "Denver, CO, USA" },
      ] });
    case "/api/place":
      return reply({ address: { street: "1428 Maple Ave", city: "Evanston", state: "IL", zip: "60201", formatted: "1428 Maple Ave, Evanston, IL 60201, USA" } });
    case "/api/submit":
      if (failSubmitOnce) { failSubmitOnce = false; return reply({ error: "server" }, 500); }
      return reply({ id: "fam12345", token: "tok" });
    case "/api/party":
      return reply({ families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["Happy Hanukkah!", ""] }] });
    case "/api/sprite":
      return reply({ ok: true });
    case "/api/config":
      return reply({ turnstileSiteKey: "" });
  }
  return reply({ error: "not found" }, 404);
}

const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", fakeApi);
  await page.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await page.goto(base);

  const say = page.locator("#say");
  await assert.doesNotReject(say.filter({ hasText: "Whose name goes on the envelope?" }).waitFor());
  // password managers stay out of the dialog
  assert.equal(await page.getByLabel("Name on the envelope").getAttribute("data-1p-ignore"), "");
  assert.equal(await page.getByLabel("Name on the envelope").getAttribute("autocomplete"), "off");

  // blank answer
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("alert").filter({ hasText: "We need something here." }).waitFor();

  await page.getByLabel("Name on the envelope").fill("The Garcia Family");
  await page.getByRole("button", { name: "Next" }).click();
  await say.filter({ hasText: "Who lives at your house?" }).waitFor();
  await page.getByLabel("Who lives at your house").fill("Sofia, Dan, Mia, and Biscuit the corgi");
  await page.getByLabel("Who lives at your house").press("Enter");

  await say.filter({ hasText: "Where should we mail your card?" }).waitFor();
  // the household is read while the guest types the address, and 4 sprites wait at the door
  await page.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.familyId === "pending").length === 4);
  assert.equal(calls.filter((c) => c.path === "/api/household").length, 1);

  // no match offers to use the typed address
  await page.getByLabel("Street address").fill("zzzz nowhere");
  await page.getByText("We can't find that one.").waitFor();
  await page.getByRole("button", { name: "Use what I typed" }).waitFor();

  await page.getByLabel("Street address").fill("1428 Maple");
  await page.getByRole("button", { name: /1428 Maple Avenue/ }).click();
  await page.screenshot({ path: `${OUT}/3-address.png` });

  await say.filter({ hasText: "Apartment or unit?" }).waitFor();
  await page.getByLabel("Apartment or unit").fill("Apt 2B");
  await page.getByRole("button", { name: "Next" }).click();

  await say.filter({ hasText: "We'll mail your card to:" }).waitFor();
  const lines = await page.locator(".address").innerText();
  assert.equal(lines, "The Garcia Family\n1428 Maple Ave, Apt 2B\nEvanston, IL 60201");
  await page.screenshot({ path: `${OUT}/4-confirm.png` });

  // first save fails, retry works
  await page.getByRole("button", { name: "Yes, send it" }).click();
  await page.getByRole("alert").filter({ hasText: "Something went wrong. Try again?" }).waitFor();
  await page.getByRole("button", { name: "Yes, send it" }).click();
  await say.filter({ hasText: "Thank you. You mean a lot to us." }).waitFor();

  const submitted = calls.filter((c) => c.path === "/api/submit").at(-1).body;
  assert.equal(submitted.envelope, "The Garcia Family");
  assert.equal(submitted.address.unit, "Apt 2B");
  assert.equal(submitted.members.length, 4);
  assert.deepEqual(submitted.members.map((m) => m.type), ["adult", "adult", "kid", "dog"]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families")));
  assert.equal(saved[0].id, "fam12345");
  // the family's name shows only on hover
  assert.equal(await page.locator(".tag").count(), 0);
  const garcia = await page.evaluate(() => {
    const s = window.__hc.scene.sprites.find((x) => x.familyId === "fam12345");
    const r = document.getElementById("stage").getBoundingClientRect();
    const v = window.__hc.scene.view;
    return { x: r.left + v.left + s.x * v.scale, y: r.top + v.top + (s.y - s.img.height / 2) * v.scale };
  });
  await page.mouse.move(garcia.x, garcia.y);
  await page.locator(".tag", { hasText: "The Garcia Family" }).waitFor();
  await page.mouse.move(2, 2);
  await page.locator(".tag").waitFor({ state: "detached" });

  // hovering over the hosts shows each of their names (zoom back out first: the camera follows the new family)
  await page.evaluate(() => window.__hc.scene.focus(128, 120, 0));
  await page.waitForTimeout(100);
  const host = await page.evaluate(() => {
    const s = window.__hc.scene.sprites.find((x) => x.host && x.name === "Jesse");
    const r = document.getElementById("stage").getBoundingClientRect();
    const v = window.__hc.scene.view;
    return { x: r.left + v.left + s.x * v.scale, y: r.top + v.top + (s.y - s.img.height / 2) * v.scale };
  });
  await page.mouse.move(host.x, host.y);
  await page.locator(".tag", { hasText: "Eddie" }).waitFor();
  assert.deepEqual((await page.locator(".tag").allInnerTexts()).sort(), ["Audrey", "Eddie", "Jess", "Jesse"]);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${OUT}/5-done.png` });

  // tap your own sprite, say something
  const mine = await page.evaluate(() => {
    const s = window.__hc.scene.sprites.find((x) => x.familyId === "fam12345");
    const r = document.getElementById("stage").getBoundingClientRect();
    const v = window.__hc.scene.view;
    return { x: r.left + v.left + s.x * v.scale, y: r.top + v.top + (s.y - s.img.height / 2) * v.scale };
  });
  await page.mouse.click(mine.x, mine.y);
  await page.getByLabel("Say something").fill("We love you guys");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".bubble", { hasText: "We love you guys" }).waitFor();
  const spriteCall = calls.filter((c) => c.path === "/api/sprite").at(-1).body;
  assert.deepEqual({ id: spriteCall.id, token: spriteCall.token, bubble: spriteCall.bubble }, { id: "fam12345", token: "tok", bubble: "We love you guys" });
  await page.screenshot({ path: `${OUT}/6-bubble.png` });

  // coming back on the same browser goes straight to the party
  await page.reload();
  await say.filter({ hasText: "Thank you. You mean a lot to us." }).waitFor();
  await page.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.familyId === "fam12345").length === 4);
  await page.waitForFunction(() => window.__hc.scene.sprites.some((s) => s.familyId === "other1"));
  await page.screenshot({ path: `${OUT}/7-return.png` });

  // first visit screenshot for review
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p2 = await fresh.newPage();
  await p2.route("**/api/**", fakeApi);
  await p2.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await p2.goto(base);
  await p2.locator("#say").filter({ hasText: "Whose name goes on the envelope?" }).waitFor();
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/1-start.png` });

  // the real looks library: every image loads, and a new family gets sprites from it
  const real = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const p3 = await real.newPage();
  p3.on("pageerror", (e) => errors.push(String(e)));
  await p3.route("**/api/**", fakeApi);
  await p3.goto(base);
  const broken = await p3.evaluate(async () => {
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
  await p3.getByLabel("Name on the envelope").fill("The Garcia Family");
  await p3.getByLabel("Name on the envelope").press("Enter");
  await p3.getByLabel("Who lives at your house").fill("Sofia, Dan, Mia, and Biscuit");
  await p3.getByLabel("Who lives at your house").press("Enter");
  await p3.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.familyId === "pending").length === 4);

  // a wide screen shows the whole room, and a hover still finds the hosts
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const p4 = await desk.newPage();
  p4.on("pageerror", (e) => errors.push(String(e)));
  await p4.route("**/api/**", fakeApi);
  await p4.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await p4.goto(base);
  await p4.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.host && s.img).length === 4);
  const fit = await p4.evaluate(() => {
    const st = document.getElementById("stage").getBoundingClientRect();
    const wr = document.querySelector(".world").getBoundingClientRect();
    return { st: { l: st.left, t: st.top, r: st.right, b: st.bottom }, wr: { l: wr.left, t: wr.top, r: wr.right, b: wr.bottom } };
  });
  assert.ok(fit.wr.l >= fit.st.l && fit.wr.t >= fit.st.t && fit.wr.r <= fit.st.r && fit.wr.b <= fit.st.b, JSON.stringify(fit));
  assert.ok(fit.wr.b - fit.wr.t > fit.st.b - fit.st.t - 1 || fit.wr.r - fit.wr.l > fit.st.r - fit.st.l - 1, JSON.stringify(fit));
  const deskHost = await p4.evaluate(() => {
    const s = window.__hc.scene.sprites.find((x) => x.host && x.name === "Jesse");
    const r = document.getElementById("stage").getBoundingClientRect();
    const v = window.__hc.scene.view;
    return { x: r.left + v.left + s.x * v.scale, y: r.top + v.top + (s.y - s.img.height / 2) * v.scale };
  });
  await p4.mouse.move(deskHost.x, deskHost.y);
  await p4.locator(".tag", { hasText: "Eddie" }).waitFor();
  await p4.screenshot({ path: `${OUT}/8-desktop.png` });

  assert.deepEqual(errors, []);
  console.log("e2e: all checks passed");
} finally {
  await browser.close();
  server.close();
}
