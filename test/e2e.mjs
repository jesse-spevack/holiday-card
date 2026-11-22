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
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".m4a": "audio/mp4" };

// Test looks use the committed sample guests, so the test does not depend on the looks library.
// The ages and silly looks are out of order on purpose: the look picker sorts them.
const LOOKS = {
  adult: [
    { id: "t-mom", src: "/t/guest-mom.png", w: 24, h: 35, desc: "mom", age: "adult" },
    { id: "t-robot", src: "/t/guest-dad.png", w: 20, h: 35, desc: "robot", age: "adult", silly: true },
    { id: "t-dad", src: "/t/guest-dad.png", w: 20, h: 35, desc: "dad", age: "adult" },
    { id: "t-gran", src: "/t/guest-mom.png", w: 24, h: 35, desc: "grandma", age: "older" },
  ],
  kid: [
    { id: "t-kid", src: "/t/guest-kid.png", w: 21, h: 28, desc: "kid", age: "kid" },
    { id: "t-ninja", src: "/t/guest-kid.png", w: 21, h: 28, desc: "kid ninja", age: "kid", silly: true },
    { id: "t-teen", src: "/t/guest-kid.png", w: 21, h: 28, desc: "teen", age: "teen" },
  ],
  baby: [{ id: "t-baby", src: "/t/guest-kid.png", w: 21, h: 28, desc: "baby", age: "baby" }],
  dog: [
    { id: "t-dog", src: "/t/guest-dog.png", w: 17, h: 21, desc: "dog" },
    { id: "t-robodog", src: "/t/guest-dog.png", w: 17, h: 21, desc: "robot dog", silly: true },
  ],
  cat: [{ id: "t-cat", src: "/t/guest-dog.png", w: 17, h: 21, desc: "cat" }],
};

const ALBUM = { photos: [
  { src: "/album/0000000000000001.jpg", caption: "A day at the lake", w: 1400, h: 1050 },
  { src: "/album/0000000000000002.jpg", caption: "Snow in the yard", w: 1050, h: 1400 },
  { src: "/album/0000000000000003.jpg", caption: "A long walk", w: 1400, h: 1050 },
] };

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

// A screen point that the scene resolves to the sprite that matches `want`, even when another sprite stands close.
const pointOn = (pg, want) => pg.evaluate((w) => {
  const { scene } = window.__hc;
  const s = scene.sprites.find((x) => Object.entries(w).every(([k, v]) => x[k] === v));
  const r = document.getElementById("stage").getBoundingClientRect();
  const v = scene.view;
  const spots = [];
  for (let dy = Math.round(s.img.height / 2); dy < s.img.height; dy++) spots.push(dy, s.img.height - dy);
  for (const dy of spots) {
    for (const dx of [0, -3, 3, -6, 6]) {
      const p = { x: s.x + dx, y: s.y - dy };
      if (scene.spriteAt(p.x, p.y) === s) return { x: r.left + v.left + p.x * v.scale, y: r.top + v.top + p.y * v.scale, look: s.look };
    }
  }
  throw new Error(`no clear point on ${JSON.stringify(w)}`);
}, want);

// The whole room shows: the room's box sits inside the stage, and it touches two opposite edges.
const wholeRoom = (pg) => pg.evaluate(() => {
  const st = document.getElementById("stage").getBoundingClientRect();
  const wr = document.getElementById("world").getBoundingClientRect();
  const inside = wr.left >= st.left - 0.5 && wr.top >= st.top - 0.5 && wr.right <= st.right + 0.5 && wr.bottom <= st.bottom + 0.5;
  const fills = wr.width > st.width - 1 || wr.height > st.height - 1;
  return { ok: inside && fills, stage: [st.left, st.top, st.width, st.height], world: [wr.left, wr.top, wr.width, wr.height] };
});
async function assertWholeRoom(pg, what) {
  // The camera eases, so give it a moment to settle.
  await pg.waitForFunction(() => {
    const st = document.getElementById("stage").getBoundingClientRect();
    const wr = document.getElementById("world").getBoundingClientRect();
    return wr.left >= st.left - 0.5 && wr.right <= st.right + 0.5 && wr.top >= st.top - 0.5 && wr.bottom <= st.bottom + 0.5;
  }, null, { timeout: 3000 }).catch(() => {});
  const fit = await wholeRoom(pg);
  assert.ok(fit.ok, `${what}: ${JSON.stringify(fit)}`);
}

// After the thank-you, the dialog slides away within about 8 seconds and the top bar offers "Add another address".
async function assertTucks(pg) {
  const started = Date.now();
  await pg.locator("#dialog").waitFor({ state: "hidden", timeout: 8500 });
  await pg.getByRole("button", { name: "Add another address" }).waitFor({ timeout: 500 });
  assert.ok(Date.now() - started < 8500);
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
  // the hosts sign as "Jesse & Jess"
  assert.equal(await page.title(), "Holiday cards from Jesse & Jess");
  assert.equal(await page.locator("#dialog .speaker").innerText(), "Jesse & Jess");
  // a phone shows the whole room, wall to wall
  await page.waitForFunction(() => window.__hc.scene.room);
  await assertWholeRoom(page, "phone, step 1");
  assert.ok(await page.getByRole("button", { name: "Add another address" }).isHidden());
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
  await page.locator("#dialog .hint").filter({ hasText: "Then poke around the room. A few things in here might surprise you." }).waitFor();
  assert.ok(await page.locator("#dialog").isVisible());
  await assertTucks(page);
  await assertWholeRoom(page, "phone, thank-you hidden");
  await page.screenshot({ path: `${OUT}/5-tucked.png` });

  const submitted = calls.filter((c) => c.path === "/api/submit").at(-1).body;
  assert.equal(submitted.envelope, "The Garcia Family");
  assert.equal(submitted.address.unit, "Apt 2B");
  assert.equal(submitted.members.length, 4);
  assert.deepEqual(submitted.members.map((m) => m.type), ["adult", "adult", "kid", "dog"]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families")));
  assert.equal(saved[0].id, "fam12345");
  // the family's name shows only on hover
  assert.equal(await page.locator(".tag").count(), 0);
  const garcia = await pointOn(page, { familyId: "fam12345" });
  await page.mouse.move(garcia.x, garcia.y);
  await page.locator(".tag", { hasText: "The Garcia Family" }).waitFor();
  await page.mouse.move(2, 2);
  await page.locator(".tag").waitFor({ state: "detached" });

  // hovering over the hosts shows each of their names (the camera is back on the whole room)
  const host = await pointOn(page, { host: true, name: "Jesse" });
  await page.mouse.move(host.x, host.y);
  await page.locator(".tag", { hasText: "Eddie" }).waitFor();
  assert.deepEqual((await page.locator(".tag").allInnerTexts()).sort(), ["Audrey", "Eddie", "Jess", "Jesse"]);
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${OUT}/5-done.png` });

  // tap your own sprite, say something
  const mine = await pointOn(page, { familyId: "fam12345" });
  await page.mouse.click(mine.x, mine.y);
  await page.getByLabel("Say something").fill("We love you guys");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".bubble", { hasText: "We love you guys" }).waitFor();
  const spriteCall = calls.filter((c) => c.path === "/api/sprite").at(-1).body;
  assert.deepEqual({ id: spriteCall.id, token: spriteCall.token, bubble: spriteCall.bubble }, { id: "fam12345", token: "tok", bubble: "We love you guys" });
  await page.screenshot({ path: `${OUT}/6-bubble.png` });

  // "New look" opens the look picker: people oldest first, silly looks last, and the current look marked
  const spriteAt = (familyId, index) => pointOn(page, { familyId, index });
  const parent = await spriteAt("fam12345", 0);
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
  const spriteCalls = () => calls.filter((c) => c.path === "/api/sprite").length;
  const before = spriteCalls();
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "detached" });
  assert.equal(spriteCalls(), before);

  // picking a silly look changes the sprite and saves it
  await page.getByRole("button", { name: "New look" }).click();
  await picker.locator('[data-look="t-ninja"]').click();
  await picker.waitFor({ state: "detached" });
  const lookCall = calls.filter((c) => c.path === "/api/sprite").at(-1).body;
  assert.deepEqual(lookCall, { id: "fam12345", token: "tok", index: 0, look: "t-ninja" });
  assert.equal((await spriteAt("fam12345", 0)).look, "t-ninja");
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("hc.families"))))[0].members[0].look, "t-ninja");

  // a pet sees only pets
  await page.mouse.click(2, 2);
  const pet = await spriteAt("fam12345", 3);
  await page.mouse.click(pet.x, pet.y);
  await page.getByRole("button", { name: "New look" }).click();
  assert.deepEqual(await picker.locator("h3").allInnerTexts(), ["Dogs", "Cats", "Silly"]);
  assert.deepEqual(await picker.locator(".look-tile").evaluateAll((ts) => ts.map((t) => t.dataset.look)), ["t-dog", "t-cat", "t-robodog"]);
  await picker.getByRole("button", { name: "Close" }).click();
  await picker.waitFor({ state: "detached" });

  // the editor stays inside the stage when its sprite stands at the room's right edge
  await page.evaluate(() => {
    const s = window.__hc.scene.sprites.find((x) => x.familyId === "fam12345" && x.index === 1);
    Object.assign(s, { x: 196, y: 150, path: null, home: { x: 196, y: 150 } });
  });
  const edge = await spriteAt("fam12345", 1);
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
  await say.filter({ hasText: "Thank you. You mean a lot to us." }).waitFor();
  await page.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.familyId === "fam12345").length === 4);
  await page.waitForFunction(() => window.__hc.scene.sprites.some((s) => s.familyId === "other1"));
  await page.screenshot({ path: `${OUT}/7-return.png` });
  await assertTucks(page);
  await assertWholeRoom(page, "phone, return visit");
  await page.screenshot({ path: `${OUT}/7-return-tucked.png` });

  // "Add another address" in the top bar brings back step 1
  await page.getByRole("button", { name: "Add another address" }).click();
  await say.filter({ hasText: "Whose name goes on the envelope?" }).waitFor();
  assert.ok(await page.locator("#dialog").isVisible());
  assert.ok(await page.getByRole("button", { name: "Add another address" }).isHidden());
  await assertWholeRoom(page, "phone, after restart");

  // "?new" forgets this browser's families, starts at step 1, keeps the sound setting, and leaves the address clean
  await page.evaluate(() => localStorage.setItem("hc.sound", "off"));
  await page.goto(`${base}&new`);
  await say.filter({ hasText: "Whose name goes on the envelope?" }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("hc.families")), null);
  assert.equal(await page.evaluate(() => localStorage.getItem("hc.sound")), "off");
  assert.equal(await page.locator("#sound").getAttribute("aria-pressed"), "false");
  assert.equal(new URL(page.url()).search, "?test");
  await page.waitForFunction(() => window.__hc.scene.sprites.some((s) => s.familyId === "other1"));
  assert.equal(await page.evaluate(() => window.__hc.scene.sprites.filter((s) => s.mine).length), 0);
  await page.reload();
  await say.filter({ hasText: "Whose name goes on the envelope?" }).waitFor();

  // first visit screenshot for review
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p2 = await fresh.newPage();
  await p2.route("**/api/**", fakeApi);
  await p2.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await p2.goto(base);
  await p2.locator("#say").filter({ hasText: "Whose name goes on the envelope?" }).waitFor();
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/1-start.png` });
  await assertWholeRoom(p2, "phone 390x844");
  await p2.setViewportSize({ width: 375, height: 667 });
  await assertWholeRoom(p2, "phone 375x667");
  await p2.screenshot({ path: `${OUT}/1-start-small.png` });

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
  // the look picker sorts people by age, so every person look needs one
  const ageless = await p3.evaluate(async () => {
    const looks = await (await fetch("/assets/looks.json")).json();
    const ages = ["older", "adult", "teen", "kid", "baby"];
    return ["adult", "kid", "baby"].flatMap((t) => looks[t]).filter((l) => !ages.includes(l.age)).map((l) => l.id);
  });
  assert.deepEqual(ageless, []);
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
  await assertWholeRoom(p4, "desktop");
  const deskHost = await pointOn(p4, { host: true, name: "Jesse" });
  await p4.mouse.move(deskHost.x, deskHost.y);
  await p4.locator(".tag", { hasText: "Eddie" }).waitFor();
  await p4.screenshot({ path: `${OUT}/8-desktop.png` });

  // on a return visit to a wide screen, the dialog column hides too and the room grows into it
  const deskStage = (await wholeRoom(p4)).stage[2];
  await p4.evaluate(() => localStorage.setItem("hc.families", JSON.stringify([{ id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }], bubbles: [] }])));
  await p4.reload();
  await p4.locator("#say").filter({ hasText: "Thank you. You mean a lot to us." }).waitFor();
  await assertTucks(p4);
  await assertWholeRoom(p4, "desktop, thank-you hidden");
  assert.ok((await wholeRoom(p4)).stage[2] > deskStage + 300);
  await p4.screenshot({ path: `${OUT}/8-desktop-tucked.png` });

  // the hidden photo album: tap the book on the sofa, turn a page, close it
  const albumCalls = [];
  const soundCalls = [];
  const SOUND_FILES = ["book-close", "book-flip-1", "book-flip-2", "book-flip-3", "book-open"].map((n) => `/assets/sounds/${n}.m4a`);
  const fakeAlbum = async (route) => {
    const path = new URL(route.request().url()).pathname;
    albumCalls.push(path);
    if (path === "/album/list") return route.fulfill({ contentType: "application/json", body: JSON.stringify(ALBUM) });
    return route.fulfill({ contentType: "image/png", body: await readFile(join(ART, "sample-dad.png")) });
  };
  const bookAt = (p) => p.evaluate(() => {
    const r = window.__hc.scene.bookRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
    albumCalls.length = 0;
    soundCalls.length = 0;
    const ctx = await browser.newContext({ viewport, hasTouch: name === "phone" });
    const pa = await ctx.newPage();
    pa.on("pageerror", (e) => errors.push(String(e)));
    await pa.route("**/api/**", fakeApi);
    await pa.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    await pa.route("**/album/**", fakeAlbum);
    // The phone cannot load the recorded book sounds, so it plays the swish. The desktop plays the recordings.
    await pa.route("**/assets/sounds/**", (r) => {
      soundCalls.push(new URL(r.request().url()).pathname);
      return name === "phone" ? r.abort() : r.continue();
    });
    await pa.goto(base);
    await pa.waitForFunction(() => window.__hc.scene.book && window.__hc.scene.sprites.some((s) => s.host));
    // the main page never loads the album until a guest opens it
    assert.deepEqual(albumCalls, []);
    // the main page loads no sound files until the first tap
    assert.deepEqual(soundCalls, []);
    // count the album sounds, still play them, and note what each one plays: a recording, the swish, or nothing
    await pa.evaluate(() => {
      const { sound } = window.__hc;
      window.__sounds = [];
      const sources = [];
      const make = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () { const s = make.call(this); sources.push(s); return s; };
      const heard = () => {
        const made = sources.splice(0);
        if (!made.length) return "silent";
        const names = made.map((s) => Object.keys(sound.samples ?? {}).find((n) => sound.samples[n] === s.buffer));
        if (names.every((n) => !n)) return "swish";
        const rate = made[0].playbackRate.value;
        if (made.length !== 1 || rate < 0.95 || rate > 1.05) return `odd: ${made.length} sources at rate ${rate}`;
        return names[0].replace(/-\d$/, "");
      };
      for (const name of ["coverOpen", "pageTurn", "coverClose"]) {
        const play = sound[name].bind(sound);
        sound[name] = () => { sources.length = 0; play(); window.__sounds.push(`${name}: ${heard()}`); };
      }
    });
    const sounds = () => pa.evaluate(() => window.__sounds);
    if (name === "desktop") {
      // a first key press wakes the sound, and the recordings load before the book opens
      await pa.keyboard.press("Shift");
      await pa.waitForFunction(() => Object.keys(window.__hc.sound.samples ?? {}).length === 5);
    }
    const book = await bookAt(pa);
    if (name === "phone") await pa.touchscreen.tap(book.x, book.y);
    else await pa.mouse.click(book.x, book.y);
    const dialogEl = pa.getByRole("dialog", { name: "Photo album" });
    await dialogEl.waitFor();
    const count = pa.locator(".album-count");
    await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
    await pa.locator("figcaption", { hasText: "A day at the lake" }).waitFor();
    const opened = name === "phone" ? "coverOpen: swish" : "coverOpen: book-open";
    assert.deepEqual(await sounds(), [opened]);
    assert.equal(await pa.locator(".pop").count(), 0, "the book never opens the sprite editor");
    assert.equal(await pa.evaluate(() => window.__hc.scene.bookHidden), true);
    // the book is pixel art scaled by a whole number, and the photos stay smooth
    const art = await pa.evaluate(() => {
      const side = document.querySelector(".album-side.r");
      const u = parseFloat(getComputedStyle(document.querySelector(".album")).getPropertyValue("--u"));
      const img = document.querySelector(".album-print img");
      return {
        u, w: side.getBoundingClientRect().width, h: side.getBoundingClientRect().height,
        bg: getComputedStyle(side).backgroundImage.slice(0, 26),
        book: getComputedStyle(document.querySelector(".album-book")).imageRendering,
        img: getComputedStyle(img).imageRendering,
      };
    });
    assert.ok(Number.isInteger(art.u) && art.u >= 2, `book pixel ${art.u}`);
    assert.ok(Number.isInteger(art.w / art.u) && Number.isInteger(art.h / art.u), `side ${art.w}x${art.h} at ${art.u}`);
    assert.equal(art.bg, 'url("data:image/png;base64');
    assert.ok(["pixelated", "crisp-edges"].includes(art.book), art.book);
    assert.equal(art.img, "auto");
    if (name === "phone") {
      // only the current page and the next one load
      assert.deepEqual(albumCalls.filter((c) => c.endsWith(".jpg")).sort(), ["/album/0000000000000001.jpg", "/album/0000000000000002.jpg"]);
      await pa.touchscreen.tap(viewport.width - 30, viewport.height / 2);
      await count.filter({ hasText: /^2 \/ 3$/ }).waitFor();
      await pa.locator(".album-side.r figcaption", { hasText: "Snow in the yard" }).waitFor();
      await pa.touchscreen.tap(30, viewport.height / 2);
      await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
      // a tap forward and a tap back each turn a page. The sound files did not load, so each turn plays the swish.
      assert.deepEqual(await sounds(), [opened, "pageTurn: swish", "pageTurn: swish"]);
      await pa.screenshot({ path: `${OUT}/album-phone.png` });
      await pa.getByRole("button", { name: "Close the album" }).click();
    } else {
      await pa.locator(".album-title", { hasText: "Our 2026" }).waitFor();
      await pa.keyboard.press("ArrowRight");
      await count.filter({ hasText: /^2-3 \/ 3$/ }).waitFor();
      await pa.waitForTimeout(600);
      await pa.screenshot({ path: `${OUT}/album-desktop.png` });
      await pa.mouse.click(100, viewport.height / 2);
      await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
      // an arrow key and a click each turn a page with a recorded page flip
      assert.deepEqual(await sounds(), [opened, "pageTurn: book-flip", "pageTurn: book-flip"]);
      // the swish is a short, gentle sound, and with the sound off it makes no sound at all
      const heard = await pa.evaluate(async () => {
        const { swish } = await import("/js/sound.js");
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        swish(ctx, ctx.destination);
        const data = (await ctx.startRendering()).getChannelData(0);
        let peak = 0, last = 0;
        data.forEach((v, i) => { if (Math.abs(v) > peak) peak = Math.abs(v); if (Math.abs(v) > 0.001) last = i; });
        const { sound } = window.__hc;
        let made = 0;
        const real = sound.ctx;
        sound.ctx = { state: "running", currentTime: 0, createBufferSource: () => { made++; throw new Error("no sound when off"); } };
        sound.on = false;
        sound.pageTurn();
        sound.coverOpen();
        sound.coverClose();
        sound.on = true;
        sound.ctx = real;
        return { peak, ms: (last / 48000) * 1000, made };
      });
      assert.ok(heard.peak > 0.02 && heard.peak < 0.15, `swish peak ${heard.peak}`);
      assert.ok(heard.ms > 200 && heard.ms < 500, `swish length ${heard.ms} ms`);
      assert.equal(heard.made, 0);
      await pa.keyboard.press("Escape");
    }
    await dialogEl.waitFor({ state: "hidden" });
    await pa.waitForFunction(() => !window.__hc.scene.bookHidden);
    // the book closes with a sound, and with the sound off nothing plays
    const closed = name === "phone" ? "coverClose: swish" : "coverClose: book-close";
    const off = name === "phone" ? [] : ["pageTurn: silent", "coverOpen: silent", "coverClose: silent"];
    const turned = name === "phone" ? "pageTurn: swish" : "pageTurn: book-flip";
    assert.deepEqual(await sounds(), [opened, turned, turned, ...off, closed]);
    // each sound file loads one time
    assert.deepEqual(soundCalls.sort(), SOUND_FILES);
    // the form still works after the album closes
    await pa.getByLabel("Name on the envelope").fill("The Garcia Family");
    await pa.getByRole("button", { name: "Next" }).click();
    await pa.locator("#say").filter({ hasText: "Who lives at your house?" }).waitFor();
    await ctx.close();
  }

  // the hidden room extras: the window, the menorah, the floor lamp, and the passing Waymo
  for (const reduce of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: reduce });
    const pe = await ctx.newPage();
    pe.on("pageerror", (e) => errors.push(String(e)));
    await pe.route("**/api/**", fakeApi);
    await pe.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    await pe.goto(base);
    await pe.waitForFunction(() => window.__hc.scene.eggs.glassLayer && window.__hc.scene.sprites.some((s) => s.familyId === "other1" && s.img));
    // count the extras' sounds, and still play them
    await pe.evaluate(() => {
      const { sound } = window.__hc;
      window.__sounds = [];
      for (const name of ["sparkle", "chime", "snuff", "click"]) {
        const play = sound[name].bind(sound);
        sound[name] = (...args) => { window.__sounds.push(args.length ? `${name}:${args[0]}` : name); play(...args); };
      }
    });
    const sounds = () => pe.evaluate(() => window.__sounds.splice(0));
    const eggs = (fn) => pe.evaluate(fn);
    const tapRoom = async (x, y) => {
      const pt = await pe.evaluate(([x, y]) => {
        const v = window.__hc.scene.view;
        const r = document.getElementById("stage").getBoundingClientRect();
        return { x: r.left + v.left + x * v.scale, y: r.top + v.top + y * v.scale };
      }, [x, y]);
      await pe.touchscreen.tap(pt.x, pt.y);
    };
    const spot = (id) => pe.evaluate(async (id) => {
      const { HOTSPOTS } = await import("/js/scene.js");
      const s = HOTSPOTS.find((h) => h.id === id);
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    }, id);

    // a tap on a dreidel or the wall does nothing
    await tapRoom(188, 53);
    await tapRoom(219, 53);
    await tapRoom(100, 20);
    assert.equal(await pe.locator(".wish").count(), 0);
    assert.deepEqual(await sounds(), []);

    // the window: a shooting star and "Make a wish" for about 2 seconds
    const win = await spot("window");
    await tapRoom(win.x, win.y);
    await pe.locator(".wish", { hasText: "Make a wish" }).waitFor();
    assert.ok(await eggs(() => !!window.__hc.scene.eggs.star));
    assert.deepEqual(await sounds(), ["sparkle"]);
    await pe.locator(".wish").waitFor({ state: "detached", timeout: 3000 });

    // the menorah: the flames go out, then light one by one with a rising chime each
    const total = await eggs(() => window.__hc.scene.flames.length);
    assert.ok(total >= 7, `flames: ${total}`);
    const menorah = await spot("menorah");
    await tapRoom(menorah.x, menorah.y);
    assert.ok(await eggs(() => window.__hc.scene.eggs.menorahLit < 2));
    await pe.waitForFunction((n) => window.__hc.scene.eggs.menorahLit > 1 && window.__hc.scene.eggs.menorahLit < n, total);
    if (reduce === "no-preference") await pe.screenshot({ path: `${OUT}/egg-menorah.png` });
    await pe.waitForFunction(() => !window.__hc.scene.eggs.lighting, null, { timeout: 6000 });
    assert.deepEqual(await sounds(), ["snuff", ...Array.from({ length: total }, (_, i) => `chime:${i}`)]);
    assert.equal(await pe.locator(".wish").count(), 0, "the menorah never sends a star");

    // the floor lamp: off, then on again, with a click each time
    const lamp = await spot("lamp");
    await tapRoom(lamp.x, lamp.y);
    assert.equal(await eggs(() => window.__hc.scene.eggs.lampOn), false);
    if (reduce === "no-preference") await pe.screenshot({ path: `${OUT}/egg-lamp.png` });
    await tapRoom(lamp.x, lamp.y);
    assert.equal(await eggs(() => window.__hc.scene.eggs.lampOn), true);
    assert.deepEqual(await sounds(), ["click", "click"]);

    // the Waymo: it drives past the window, or with reduced motion it waits there, then goes
    assert.equal(await eggs(() => window.__hc.scene.eggs.car), null);
    await eggs(() => window.__hc.scene.eggs.waymo());
    const x0 = await eggs(() => window.__hc.scene.eggs.car.x);
    await pe.waitForTimeout(500);
    const x1 = await eggs(() => window.__hc.scene.eggs.car.x);
    if (reduce === "reduce") assert.equal(x1, x0);
    else assert.ok(Math.abs(x1 - x0) > 3, `the car moves: ${x0} to ${x1}`);
    await pe.waitForFunction(() => !window.__hc.scene.eggs.car, null, { timeout: 15000 });
    assert.ok(await eggs(() => window.__hc.scene.eggs.nextCar - window.__hc.scene.time >= 39));

    // a guest sprite still wins over the room behind it
    const lee = await pointOn(pe, { familyId: "other1", index: 0 });
    await pe.touchscreen.tap(lee.x, lee.y);
    await pe.locator(".tag", { hasText: "The Lees" }).waitFor();
    await ctx.close();
  }

  assert.deepEqual(errors, []);
  console.log("e2e: all checks passed");
} finally {
  await browser.close();
  server.close();
}
