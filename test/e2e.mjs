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

// The hosts by their sprite ids (scene.js HOSTS) and names.
const HOSTS_BY_NAME = [{ id: "jessica", name: "Jess" }, { id: "jesse", name: "Jesse" }, { id: "daughter", name: "Audrey" }, { id: "son", name: "Eddie" }];
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

// The hosts walk around. A test that taps near them sends them home first and stops them.
const stillHosts = (pg) => pg.evaluate(() => {
  for (const s of window.__hc.scene.sprites.filter((q) => q.host)) Object.assign(s, { x: s.home.x, y: s.home.y, path: null, bob: 0, wander: false });
});

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

// The snowy night around the room: is the sky canvas showing, does the gable roof sit right above the room,
// and is the greeting showing under the room?
const nightState = (pg) => pg.evaluate(() => {
  const night = document.querySelector(".night");
  const greeting = document.querySelector(".night-greeting");
  const wr = document.getElementById("world").getBoundingClientRect();
  const st = document.getElementById("stage").getBoundingClientRect();
  const out = { sky: !!night && !night.hidden, greeting: !!greeting && !greeting.hidden && greeting.innerText.replace(/\s+/g, " ").trim() };
  if (!out.sky) return out;
  const nr = night.getBoundingClientRect();
  const scale = wr.width / 256;
  // room pixel (128, -10) is the gable wall right above the middle of the room; (2, top row) is open sky
  const at = (x, y) => {
    const X = Math.round((wr.left + x * scale - nr.left) / scale);
    const Y = Math.round((wr.top + y * scale - nr.top) / scale);
    return [...night.getContext("2d").getImageData(X, Y, 1, 1).data.slice(0, 3)];
  };
  out.gable = at(128, -10);
  out.sky0 = at(2, Math.ceil((st.top - wr.top) / scale) + 1);
  out.aboveRoom = nr.top < wr.top - 20;
  if (out.greeting) {
    const gr = greeting.getBoundingClientRect();
    out.greetingBelowRoom = gr.top >= wr.bottom - 1 && gr.bottom <= st.bottom + 1;
  }
  return out;
});

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
  // while the dialog shows, the greeting stays away
  assert.equal((await nightState(page)).greeting, false);
  await assertTucks(page);
  await assertWholeRoom(page, "phone, thank-you hidden");
  // a tall phone fills the bands: a night sky with a snowy roof above the room, and the greeting below it
  await page.locator(".night-greeting").waitFor();
  const night = await nightState(page);
  assert.ok(night.sky && night.aboveRoom, JSON.stringify(night));
  assert.deepEqual(night.gable, [0x34, 0x40, 0x5f], `the gable wall sits above the room: ${JSON.stringify(night)}`);
  assert.ok(night.sky0.every((c, i) => Math.abs(c - [0x1b, 0x1a, 0x2e][i]) <= 6), `the sky starts at the page color: ${JSON.stringify(night)}`);
  assert.equal(night.greeting, "Happy holidays from Jesse, Jess, Audrey & Eddie");
  assert.ok(night.greetingBelowRoom, JSON.stringify(night));
  await assertWholeRoom(page, "phone, with the night around the room");
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
  await page.locator(".night-greeting").waitFor({ state: "hidden" });
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
  // with reduced motion, the hosts stay at home
  await p4.waitForFunction(() => window.__hc.scene.time > 5);
  const stillAtHome = await p4.evaluate(async () => {
    const { HOSTS } = await import("/js/scene.js");
    return window.__hc.scene.sprites.filter((s) => s.host).map((s) => {
      const home = HOSTS.find((h) => h.name === s.name);
      return { name: s.name, home: s.x === home.x && s.y === home.y && !s.path };
    });
  });
  assert.deepEqual(stillAtHome.filter((h) => !h.home), []);

  // on a return visit to a wide screen, the dialog column hides too and the room grows into it
  const deskStage = (await wholeRoom(p4)).stage[2];
  await p4.evaluate(() => localStorage.setItem("hc.families", JSON.stringify([{ id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }], bubbles: [] }])));
  await p4.reload();
  await p4.locator("#say").filter({ hasText: "Thank you. You mean a lot to us." }).waitFor();
  await assertTucks(p4);
  await assertWholeRoom(p4, "desktop, thank-you hidden");
  assert.ok((await wholeRoom(p4)).stage[2] > deskStage + 300);
  // a wide desktop has no bands above and below the room, so it stays plain
  assert.deepEqual(await nightState(p4), { sky: false, greeting: false });
  await p4.screenshot({ path: `${OUT}/8-desktop-tucked.png` });

  // the hidden photo album: tap the book on the sofa, turn a page, close it
  const albumCalls = [];
  const soundCalls = [];
  const SOUND_FILES = ["book-close", "book-flip-1", "book-flip-2", "book-flip-3", "book-open", "gelt-few", "gelt-pile"].map((n) => `/assets/sounds/${n}.m4a`);
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
      await pa.waitForFunction((n) => Object.keys(window.__hc.sound.samples ?? {}).length === n, SOUND_FILES.length);
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

    // a tap on the wall does nothing
    await tapRoom(100, 20);
    assert.equal(await pe.locator(".wish").count(), 0);
    assert.deepEqual(await sounds(), []);

    // The box of the words on screen, in room pixels, and whether they fade.
    const words = () => pe.evaluate(() => {
      const els = [...document.querySelectorAll(".wish")];
      const v = window.__hc.scene.view;
      const st = document.getElementById("stage").getBoundingClientRect();
      const r = els[0]?.getBoundingClientRect();
      const room = (px, py) => [(px - st.left - v.left) / v.scale, (py - st.top - v.top) / v.scale];
      return {
        count: els.length,
        text: els[0]?.textContent,
        box: r && [...room(r.left, r.top), ...room(r.right, r.bottom)],
        screen: r && [r.left, r.right],
        fade: els[0] && getComputedStyle(els[0]).animationName !== "none",
      };
    });

    // the window: a shooting star and "Make a wish" for about 2 seconds, high on the glass and clear of the menorah
    const win = await spot("window");
    await tapRoom(win.x, win.y);
    await pe.locator(".wish", { hasText: "Make a wish" }).waitFor();
    assert.ok(await eggs(() => !!window.__hc.scene.eggs.star));
    assert.deepEqual(await sounds(), ["sparkle"]);
    const wish = await words();
    const [left, top, right, bottom] = wish.box;
    assert.ok(left >= 163 && right <= 238 && top >= 8 && bottom <= 30, `the wish sits on the glass: ${wish.box}`);
    assert.equal(wish.fade, reduce === "no-preference");
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
    assert.equal(await eggs(() => window.__hc.scene.eggs.star), null, "the menorah never sends a star");

    // after the last candle, the menorah asks about miracles under the sill, inside the screen, for about 3.5 seconds
    await pe.locator(".wish", { hasText: "What miracles are you grateful for?" }).waitFor({ timeout: 1000 });
    const miracles = await words();
    assert.equal(miracles.count, 1);
    assert.ok(miracles.box[1] >= 49, `the question sits under the menorah: ${miracles.box}`);
    assert.ok(miracles.screen[0] >= 12 && miracles.screen[1] <= 378, `the question keeps clear of the screen edges: ${miracles.screen}`);
    assert.equal(miracles.fade, reduce === "no-preference");
    if (reduce === "no-preference") {
      await pe.waitForTimeout(700);
      await pe.screenshot({ path: `${OUT}/egg-miracles.png` });
    }

    // a tap on the window now replaces the question with the wish, so the two never overlap
    await tapRoom(win.x, win.y);
    await pe.locator(".wish", { hasText: "Make a wish" }).waitFor();
    assert.equal((await words()).count, 1);
    assert.deepEqual(await sounds(), ["sparkle"]);
    await pe.locator(".wish").waitFor({ state: "detached", timeout: 3000 });

    // the question goes away on its own
    await tapRoom(menorah.x, menorah.y);
    await pe.locator(".wish", { hasText: "What miracles" }).waitFor({ timeout: 6000 });
    const shown = Date.now();
    await pe.locator(".wish").waitFor({ state: "detached", timeout: 4500 });
    assert.ok(Date.now() - shown > 2500, `the question shows for about 3.5 seconds: ${Date.now() - shown} ms`);
    await sounds();

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
    await stillHosts(pe);
    const lee = await pointOn(pe, { familyId: "other1", index: 0 });
    await pe.touchscreen.tap(lee.x, lee.y);
    await pe.locator(".tag", { hasText: "The Lees" }).waitFor();
    await ctx.close();
  }

  // the hidden pet reactions: a tap on a dog or a cat makes it hop or stretch, with a sound
  const PETS = { families: [{ id: "pets1", name: "The Parks", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }, { type: "cat", look: "t-cat" }], bubbles: ["", "", ""] }] };
  const petCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const pp = await petCtx.newPage();
  pp.on("pageerror", (e) => errors.push(String(e)));
  await pp.route("**/api/**", fakeApi);
  await pp.route("**/api/party", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(PETS) }));
  await pp.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await pp.addInitScript(() => localStorage.setItem("hc.families", JSON.stringify([
    { id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] },
  ])));
  await pp.goto(base);
  await pp.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.familyId === "pets1" || s.familyId === "fam12345").length === 5);
  await assertTucks(pp);
  // the guests stand still in clear spots, so a tap lands where the test aims
  await pp.evaluate(() => {
    const spots = { "pets1:0": [104, 118], "pets1:1": [124, 118], "pets1:2": [144, 118], "fam12345:0": [132, 148], "fam12345:1": [152, 148] };
    window.__hc.scene.sprites.forEach((s) => {
      const spot = spots[`${s.familyId}:${s.index}`];
      if (spot) Object.assign(s, { x: spot[0], y: spot[1], home: { x: spot[0], y: spot[1] } });
      Object.assign(s, { wander: false, path: null, bob: 0 });
    });
  });
  await stillHosts(pp);
  await pp.evaluate(() => {
    const { sound } = window.__hc;
    window.__sounds = [];
    for (const name of ["woof", "mrrp", "select"]) {
      const play = sound[name].bind(sound);
      sound[name] = () => { window.__sounds.push(name); play(); };
    }
  });
  const petSounds = () => pp.evaluate(() => window.__sounds.splice(0));
  const reaction = (want) => pp.evaluate((w) => {
    const s = window.__hc.scene.sprites.find((x) => x.familyId === w.familyId && x.type === w.type);
    return s.react ? { kind: s.react.kind, ago: window.__hc.scene.time - s.react.at } : null;
  }, want);

  // another family's dog hops, woofs, and still shows the family's name
  const dog = await pointOn(pp, { familyId: "pets1", type: "dog" });
  await pp.touchscreen.tap(dog.x, dog.y);
  await pp.locator(".tag", { hasText: "The Parks" }).waitFor();
  assert.equal((await reaction({ familyId: "pets1", type: "dog" }))?.kind, "dog");
  assert.deepEqual(await petSounds(), ["woof"]);
  await pp.waitForTimeout(90);
  await pp.screenshot({ path: `${OUT}/pet-dog.png` });

  // another family's cat stretches, says mrrp, and shows a heart
  const cat = await pointOn(pp, { familyId: "pets1", type: "cat" });
  await pp.touchscreen.tap(cat.x, cat.y);
  await pp.locator(".tag", { hasText: "The Parks" }).waitFor();
  assert.equal((await reaction({ familyId: "pets1", type: "cat" }))?.kind, "cat");
  assert.deepEqual(await petSounds(), ["mrrp"]);
  await pp.waitForTimeout(300);
  await pp.screenshot({ path: `${OUT}/pet-cat.png` });
  assert.equal(await pp.locator(".pop").count(), 0, "another family's pet never opens the editor");

  // your own pet reacts, and the editor opens too, with the woof in place of the chime
  const ownDog = await pointOn(pp, { familyId: "fam12345", type: "dog" });
  await pp.touchscreen.tap(ownDog.x, ownDog.y);
  await pp.getByLabel("Say something").waitFor();
  assert.equal((await reaction({ familyId: "fam12345", type: "dog" }))?.kind, "dog");
  assert.deepEqual(await petSounds(), ["woof"]);
  // a person in your family opens the editor with its chime, and does not react
  await pp.touchscreen.tap(2, 2);
  const ownMom = await pointOn(pp, { familyId: "fam12345", type: "adult" });
  await pp.touchscreen.tap(ownMom.x, ownMom.y);
  await pp.getByLabel("Say something").waitFor();
  assert.equal(await reaction({ familyId: "fam12345", type: "adult" }), null);
  assert.deepEqual(await petSounds(), ["select"]);

  // the moves, the silly pets, reduced motion, and soft sounds
  const petFacts = await pp.evaluate(async () => {
    const { petPose, reactionKind, drawPet } = await import("/js/pets.js");
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
  assert.ok(petFacts.dogHop >= 3, `dog hop ${petFacts.dogHop}`);
  assert.ok(petFacts.catStretch >= 2, `cat stretch ${petFacts.catStretch}`);
  assert.deepEqual(petFacts.after, { dx: 0, dy: 0, tilt: 0, stretch: 0 });
  assert.deepEqual(petFacts.silly, ["robot", "dragon", "alien", "penguin", "dog", "cat"]);
  assert.ok(petFacts.lift >= 3, `a dog lifts ${petFacts.lift} pixels`);
  assert.equal(petFacts.stillLift, 0, "with reduced motion, a pet does not hop");
  for (const [name, { peak, ms }] of Object.entries(petFacts.sounds)) {
    assert.ok(peak > 0.01 && peak < 0.2, `${name} peak ${peak}`);
    assert.ok(ms > 100 && ms < 700, `${name} length ${ms} ms`);
  }
  await petCtx.close();

  // the hidden dreidel game: a dreidel on the sill grows into a game, spins, falls on a side, and closes
  for (const [name, viewport, reduce] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1440, height: 900 }, "no-preference"],
    ["phone-reduced", { width: 390, height: 844 }, "reduce"],
  ]) {
    const touch = name.startsWith("phone");
    const ctx = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: reduce });
    const pd = await ctx.newPage();
    pd.on("pageerror", (e) => errors.push(String(e)));
    await pd.route("**/api/**", fakeApi);
    await pd.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    await pd.route("**/album/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(ALBUM) }));
    await pd.goto(base);
    await pd.waitForFunction(() => window.__hc.scene.eggs.glassLayer && window.__hc.scene.book && window.__hc.scene.sprites.some((s) => s.familyId === "other1" && s.img));
    // count the game's sounds, and still play them
    await pd.evaluate(() => {
      const { sound } = window.__hc.dreidel;
      window.__sounds = [];
      for (const n of ["whirr", "tick", "clack", "lift", "result"]) {
        const play = sound[n].bind(sound);
        sound[n] = (...args) => { window.__sounds.push(n === "result" ? `result:${args[0]}` : n); play(...args); };
      }
    });
    const sounds = () => pd.evaluate(() => window.__sounds.splice(0));
    const at = (x, y) => (touch ? pd.touchscreen.tap(x, y) : pd.mouse.click(x, y));
    const roomPoint = (box) => pd.evaluate((b) => {
      const r = window.__hc.scene.roomRect(b);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, box);
    const dreidelAt = (id) => pd.evaluate(async (id) => {
      const { DREIDELS } = await import("/js/scene.js");
      const r = window.__hc.scene.roomRect(DREIDELS[id]);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    const game = pd.getByRole("dialog", { name: "Dreidel game" });
    const state = () => game.getAttribute("data-state");

    // the main page never loads the game's styles until a guest opens it
    assert.equal(await pd.locator('link[href="/dreidel.css"]').count(), 0);
    const left = await dreidelAt("dreidel-left");
    await at(left.x, left.y);
    await game.waitFor();
    assert.equal(await state(), "idle");
    await pd.locator(".dreidel-name", { hasText: "Tap to spin" }).waitFor();
    assert.equal(await pd.locator(".pop").count(), 0, "a dreidel never opens the sprite editor");
    assert.equal(await pd.locator(".wish").count(), 0, "a dreidel never sends a star");
    assert.equal(await pd.evaluate(() => !!window.__hc.scene.eggs.lighting), false, "a dreidel never lights the menorah");
    assert.equal(await pd.evaluate(() => document.getElementById("app").hasAttribute("inert")), true);
    await pd.waitForTimeout(600);
    if (name !== "phone-reduced") await pd.screenshot({ path: `${OUT}/dreidel-${name}-open.png` });

    // each side: the letter's name, its meaning, and the gelt
    const spinTo = async (face) => {
      const spins = await pd.evaluate((face) => {
        window.__hc.dreidel.rig = { face, speed: 6 };
        return window.__hc.dreidel.spins;
      }, face);
      if (touch) await pd.locator(".dreidel-card").tap();
      else await pd.keyboard.press("Space");
      await pd.waitForFunction((n) => window.__hc.dreidel.spins === n + 1 && document.querySelector(".dreidel").dataset.state === "result", spins, { timeout: 5000 });
      return game.getAttribute("data-face");
    };
    // [side, name, meaning, pot, you, the change shown next to the pot and the guest, the refill line]
    const expected = [
      ["gimel", "Gimel", "Take it all!", 0, 12, ["-4", "+4"], ""],
      ["shin", "Shin", "Put one in", 3, 11, ["+1", "-1"], "The pot refills with two gelt."],
      ["hei", "Hei", "Take half", 1, 13, ["-2", "+2"], ""],
      // Nun changes nothing, so both counts stay the same and show no change
      ["nun", "Nun", "Nothing happens", 1, 13, ["", ""], ""],
      ["nun", "Nun", "Nothing happens", 1, 13, ["", ""], ""],
    ];
    for (const [face, title, says, pot, you, change, note] of expected) {
      assert.equal(await spinTo(face), face);
      assert.equal(await pd.locator(".dreidel-name").textContent(), title);
      assert.equal(await pd.locator(".dreidel-says").textContent(), says);
      assert.equal(await pd.locator(".dreidel-pot").textContent(), `Pot: ${pot}`);
      assert.equal(await pd.locator(".dreidel-you").textContent(), `You: ${you}`);
      assert.deepEqual(await pd.locator(".dreidel-change").allTextContents(), change, `${face} change`);
      assert.equal(await pd.locator(".dreidel-note").textContent(), note);
      const heard = await sounds();
      assert.ok(heard.includes("clack") && heard.at(-1) === `result:${face}`, `${face}: ${heard}`);
      if (reduce === "reduce") assert.ok(!heard.includes("whirr") && !heard.includes("tick"), `reduced: ${heard}`);
      else assert.ok(heard.includes("whirr") && heard.includes("tick"), `${face}: ${heard}`);
    }
    if (name !== "phone-reduced") await pd.screenshot({ path: `${OUT}/dreidel-${name}-result.png` });
    // with no rig, the dreidel lands on one of the four sides
    await pd.evaluate(() => { window.__hc.dreidel.rig = { speed: 6 }; });
    assert.ok(["nun", "gimel", "hei", "shin"].includes(await spinTo(undefined)));

    // close: a tap outside the play area, Escape, or the close button
    if (name === "phone") await at(20, viewport.height - 20);
    else if (name === "desktop") await pd.keyboard.press("Escape");
    else await pd.getByRole("button", { name: "Close the dreidel game" }).click();
    await game.waitFor({ state: "hidden" });
    assert.equal(await pd.evaluate(() => document.getElementById("app").hasAttribute("inert")), false);

    // the other dreidel opens the game too, and it shows the last result
    const right = await dreidelAt("dreidel-right");
    await at(right.x, right.y);
    await game.waitFor();
    assert.equal(await state(), "result");
    await pd.keyboard.press("Escape");
    await game.waitFor({ state: "hidden" });

    // the menorah, the album book, and a guest sprite still work
    const { HOTSPOTS } = await pd.evaluate(async () => ({ HOTSPOTS: (await import("/js/scene.js")).HOTSPOTS }));
    const menorah = await roomPoint(HOTSPOTS.find((h) => h.id === "menorah"));
    await at(menorah.x, menorah.y);
    assert.equal(await pd.evaluate(() => !!window.__hc.scene.eggs.lighting), true);
    assert.equal(await game.isVisible(), false, "the menorah never opens the dreidel game");
    const book = await pd.evaluate(() => {
      const r = window.__hc.scene.bookRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await at(book.x, book.y);
    const album = pd.getByRole("dialog", { name: "Photo album" });
    await album.waitFor();
    await pd.keyboard.press("Escape");
    await album.waitFor({ state: "hidden" });
    await stillHosts(pd);
    const lee = await pointOn(pd, { familyId: "other1", index: 0 });
    await at(lee.x, lee.y);
    await pd.locator(".tag", { hasText: "The Lees" }).waitFor();
    await ctx.close();
  }

  // Touch targets on a phone. The center of each hidden thing always finds it, a tap between two things on the
  // sill finds the nearer one, and each thing takes a finger-sized area where the room allows.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pt = await ctx.newPage();
    pt.on("pageerror", (e) => errors.push(String(e)));
    await pt.route("**/api/**", fakeApi);
    await pt.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    await pt.goto(base);
    await pt.waitForFunction(() => window.__hc.scene.eggs.glassLayer && window.__hc.scene.book && window.__hc.scene.sprites.filter((s) => s.host && s.img).length === 4);
    await stillHosts(pt);
    // Note each hidden thing that a tap finds, but open nothing.
    await pt.evaluate(() => { window.__hits = []; window.__hc.scene.onHotspot = (id) => window.__hits.push(id); });
    const { HOTSPOTS, TAP_PX } = await pt.evaluate(async () => {
      const m = await import("/js/scene.js");
      return { HOTSPOTS: m.HOTSPOTS, TAP_PX: m.TAP_PX };
    });
    const box = (id) => HOTSPOTS.find((h) => h.id === id);
    const center = (id) => ({ x: box(id).x + box(id).w / 2, y: box(id).y + box(id).h / 2 });
    const between = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const tapFinds = async ({ x, y }) => {
      const p = await pt.evaluate(([x, y]) => {
        const v = window.__hc.scene.view;
        const r = document.getElementById("stage").getBoundingClientRect();
        return { x: r.left + v.left + x * v.scale, y: r.top + v.top + y * v.scale };
      }, [x, y]);
      await pt.touchscreen.tap(p.x, p.y);
      return pt.evaluate(() => window.__hits.splice(0).join(",") || null);
    };
    for (const h of HOTSPOTS) assert.equal(await tapFinds(center(h.id)), h.id, `a tap on the center of ${h.id}`);
    for (const [a, b] of [["dreidel-left", "menorah"], ["menorah", "dreidel-right"]]) {
      assert.equal(await tapFinds(between(center(a), center(b), 0.25)), a, `a quarter of the way from ${a} to ${b}`);
      assert.equal(await tapFinds(between(center(a), center(b), 0.75)), b, `three quarters of the way from ${a} to ${b}`);
    }
    // In the 3-pixel gap between the menorah (x 194-210) and the right dreidel (x 214-224), each side finds its own thing.
    assert.equal(await tapFinds({ x: 211.5, y: 50 }), "menorah");
    assert.equal(await tapFinds({ x: 213.5, y: 50 }), "dreidel-right");
    // Under the sill things, a tap finds the closer one: the menorah's base ends 2 pixels higher than the dreidels.
    assert.equal(await tapFinds({ x: 200, y: 61 }), "menorah");
    assert.equal(await tapFinds({ x: 192, y: 62 }), "dreidel-left");
    // a near miss just above a dreidel finds the dreidel, not the window behind it, and the open sky still finds the window
    assert.equal(await tapFinds({ x: center("dreidel-right").x, y: box("dreidel-right").y - 3 }), "dreidel-right");
    assert.equal(await tapFinds({ x: 176, y: 22 }), "window");
    // the thing a tap found shows its corners for a moment
    await tapFinds(center("menorah"));
    assert.equal(await pt.evaluate(() => window.__hc.scene.press?.box?.id), "menorah");
    // the area that each thing takes, in CSS pixels, through its center
    const areas = await pt.evaluate(async (px) => {
      const { HOTSPOTS, pickSpot } = await import("/js/scene.js");
      const scale = window.__hc.scene.view.scale;
      const min = px / scale;
      const out = {};
      for (const h of HOTSPOTS) {
        const cx = h.x + h.w / 2;
        const cy = h.y + h.h / 2;
        const reach = (dx, dy) => {
          let d = 0;
          while (pickSpot(HOTSPOTS, cx + dx * (d + 0.25), cy + dy * (d + 0.25), min)?.id === h.id) d += 0.25;
          return d;
        };
        out[h.id] = { w: (reach(-1, 0) + reach(1, 0)) * scale, h: (reach(0, -1) + reach(0, 1)) * scale };
      }
      return out;
    }, TAP_PX.touch);
    for (const id of ["book", "lamp"]) assert.ok(areas[id].w >= 43 && areas[id].h >= 43, `${id}: ${JSON.stringify(areas[id])}`);
    // The things on the sill stand closer than a finger, so each one gets a full finger of height and its share of the width.
    for (const id of ["dreidel-left", "menorah", "dreidel-right"]) assert.ok(areas[id].w >= 27 && areas[id].h >= 40, `${id}: ${JSON.stringify(areas[id])}`);

    // A tapped host says a line of their own, never the same line twice in a row, and a found thing drops out of the hints.
    const { HOST_LINES } = await pt.evaluate(async () => ({ HOST_LINES: (await import("/js/scene.js")).HOST_LINES }));
    const text = (l) => (typeof l === "string" ? l : l.text);
    const hear = async (name, times) => {
      const said = [];
      for (let i = 0; i < times; i++) {
        const p = await pointOn(pt, { host: true, name });
        await pt.touchscreen.tap(p.x, p.y);
        said.push(await pt.evaluate((n) => window.__hc.scene.sprites.find((s) => s.name === n).bubbleEl?.textContent, name));
      }
      return said;
    };
    for (const host of HOSTS_BY_NAME) {
      const said = await hear(host.name, 16);
      const own = HOST_LINES[host.id].map(text);
      for (const [i, line] of said.entries()) {
        assert.ok(own.includes(line), `${host.name} says their own line: ${line}`);
        if (i) assert.notEqual(line, said[i - 1], `${host.name} repeats "${line}"`);
      }
      // the guest is a first-time guest with no family of their own, so no hint about silly looks
      assert.ok(!said.includes("My favorite looks are the silly ones."), `${host.name} hints at silly looks with no family to dress`);
    }
    // a bubble near the edge of a phone stays on the screen
    await pt.evaluate(() => Object.assign(window.__hc.scene.sprites.find((s) => s.name === "Jesse"), { x: 180 }));
    await hear("Jesse", 1);
    const edge = await pt.evaluate(() => window.__hc.scene.sprites.find((s) => s.name === "Jesse").bubbleEl.getBoundingClientRect().right);
    assert.ok(edge <= 390, `the bubble stays on the screen: ${edge}`);
    // after the guest finds every hidden thing, the hosts only thank them
    await pt.evaluate(() => { for (const egg of ["album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly"]) window.__hc.found.add(egg); });
    const thanks = HOST_LINES.jesse.filter((l) => typeof l === "string");
    for (const line of await hear("Jesse", 8)) assert.ok(thanks.includes(line), `Jesse only thanks the guest now: ${line}`);
    await ctx.close();
  }

  // the hosts walk around the room, face the way they walk, and stay on the open floor
  const walkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pw = await walkCtx.newPage();
  pw.on("pageerror", (e) => errors.push(String(e)));
  await pw.route("**/api/**", fakeApi);
  await pw.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
  await pw.goto(base);
  await pw.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.host && s.img).length === 4);
  const FLOOR = await pw.evaluate(async () => (await import("/js/scene.js")).FLOOR);
  const hostsNow = () => pw.evaluate(() => window.__hc.scene.sprites.filter((s) => s.host).map((s) => ({ name: s.name, x: s.x, y: s.y, flip: s.flip, path: s.path })));
  const homes = await hostsNow();
  await pw.screenshot({ path: `${OUT}/hosts-walk-1.png` });
  const moved = new Set();
  for (let i = 0; i < 48 && (moved.size < 4 || i < 16); i++) {
    await pw.waitForTimeout(250);
    for (const h of await hostsNow()) {
      assert.ok(h.x >= FLOOR.x0 && h.x <= FLOOR.x1 && h.y >= FLOOR.y0 && h.y <= FLOOR.y1, `${h.name} stays on the floor: ${h.x}, ${h.y}`);
      if (h.path && Math.abs(h.path.x - h.x) > 2) assert.equal(h.flip, h.path.x < h.x, `${h.name} faces the way they walk`);
      const home = homes.find((q) => q.name === h.name);
      if (Math.hypot(h.x - home.x, h.y - home.y) > 3) moved.add(h.name);
    }
  }
  assert.deepEqual([...moved].sort(), ["Audrey", "Eddie", "Jess", "Jesse"]);
  await pw.screenshot({ path: `${OUT}/hosts-walk-2.png` });
  // Audrey and Eddie walk together
  await pw.waitForFunction(() => window.__hc.scene.sprites.filter((s) => s.host && !s.mingle).every((s) => !s.path), null, { timeout: 15000 });
  const kids = (await hostsNow()).filter((h) => h.name === "Audrey" || h.name === "Eddie");
  assert.ok(Math.hypot(kids[0].x - kids[1].x, kids[0].y - kids[1].y) < 24, `the kids stand together: ${JSON.stringify(kids)}`);
  // a hover on a walking host shows the names, and they follow the hosts without overlapping
  const walker = await pointOn(pw, { host: true, name: "Jesse" });
  await pw.mouse.move(walker.x, walker.y);
  await pw.locator(".tag", { hasText: "Eddie" }).waitFor();
  for (let i = 0; i < 6; i++) {
    await pw.waitForTimeout(300);
    const labels = await pw.evaluate(() => {
      const { scene } = window.__hc;
      const r = document.getElementById("stage").getBoundingClientRect();
      return scene.sprites.filter((s) => s.host).map((s) => {
        const box = s.nameEl.getBoundingClientRect();
        return { name: s.name, at: r.left + scene.view.left + s.x * scene.view.scale, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } };
      });
    });
    for (const l of labels) assert.ok(Math.abs((l.box.left + l.box.right) / 2 - l.at) < 1.5, `${l.name}'s name follows them`);
    for (const a of labels) {
      for (const b of labels) {
        if (a === b) continue;
        const overlap = a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom;
        assert.ok(!overlap, `the names ${a.name} and ${b.name} overlap`);
      }
    }
  }
  await pw.screenshot({ path: `${OUT}/hosts-walk-names.png` });
  // a tap on a host stops them to talk
  await pw.mouse.move(2, 2);
  const talker = await pointOn(pw, { host: true, name: "Jess" });
  await pw.mouse.click(talker.x, talker.y);
  await pw.waitForFunction(() => window.__hc.scene.sprites.find((s) => s.name === "Jess").bubbleEl);
  assert.equal(await pw.evaluate(() => window.__hc.scene.sprites.find((s) => s.name === "Jess").path), null);
  await walkCtx.close();

  // The roof holds still while the page settles. On the first screen the host types the question and the
  // Turnstile check mounts under the dialog, so the stage gets shorter. The roof must not come and go.
  // A fake Turnstile mounts after 1.5 s. It shows its check box (65 px), as the real one does in a test browser,
  // or it stays out of sight (0 px), as it does for most guests.
  const fakeTurnstile = (px) => `window.turnstile = {
    render(sel) { setTimeout(() => { const d = document.createElement("div"); d.style.height = "${px}px"; document.querySelector(sel).append(d); }, 1500); return 1; },
    getResponse() { return ""; }, reset() {},
  };`;
  // Each frame notes whether the gable wall right above the room (room pixel 128, -6) shows on the stage.
  const watchRoof = () => {
    window.__roof = [];
    const tick = () => {
      const n = document.querySelector(".night");
      const st = document.getElementById("stage")?.getBoundingClientRect();
      const wr = document.getElementById("world")?.getBoundingClientRect();
      let on = false;
      if (n && !n.hidden && n.width && wr?.width) {
        const scale = wr.width / 256;
        const y = wr.top - 6 * scale;
        if (y >= st.top && y < st.bottom) {
          const nr = n.getBoundingClientRect();
          const c = n.getContext("2d").getImageData(Math.round((wr.left + 128 * scale - nr.left) / scale), Math.round((y - nr.top) / scale), 1, 1).data;
          on = [[0x34, 0x40, 0x5f], [0x27, 0x30, 0x49], [0x14, 0x1b, 0x32]].some((k) => k.every((v, i) => v === c[i]));
        }
      }
      window.__roof.push(on);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const flips = (log) => log.reduce((n, on, i) => n + (i > 0 && on !== log[i - 1] ? 1 : 0), 0);
  async function roofLog({ width, height, returning, ms, box }) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 900 ? 3 : 1, isMobile: width < 900, hasTouch: width < 900 });
    const pr = await ctx.newPage();
    pr.on("pageerror", (e) => errors.push(String(e)));
    await pr.route("**/api/**", fakeApi);
    await pr.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ turnstileSiteKey: "test-key" }) }));
    await pr.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: fakeTurnstile(box ? 65 : 0) }));
    await pr.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    if (returning) {
      await pr.addInitScript(() => localStorage.setItem("hc.families", JSON.stringify([
        { id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }, { type: "kid", look: "t-kid" }], bubbles: ["", ""] },
      ])));
    }
    await pr.addInitScript(watchRoof);
    await pr.goto(base);
    await pr.waitForTimeout(ms);
    const log = await pr.evaluate(() => window.__roof);
    await ctx.close();
    return log;
  }
  // a fresh visit on a tall phone: the roof shows on the first screen and stays
  const freshRoof = await roofLog({ width: 390, height: 844, returning: false, ms: 6000, box: true });
  assert.ok(freshRoof.includes(true), "the roof shows on the first screen of a tall phone");
  assert.equal(flips(freshRoof.slice(freshRoof.indexOf(true))), 0, "the roof stays on the first screen");
  // a return visit on a tall phone: the roof stays through the thank-you, the zoom out, and after.
  // (With the check box showing, the zoom on the family fills the stage and hides the roof, as it should.)
  const backRoof = await roofLog({ width: 390, height: 844, returning: true, ms: 12000 });
  assert.ok(backRoof.at(-1), "the roof shows after the thank-you hides");
  assert.equal(flips(backRoof.slice(backRoof.indexOf(true))), 0, "the roof stays from the moment it shows");
  // a wide desktop never flashes the roof in and out
  for (const returning of [false, true]) {
    const deskRoof = await roofLog({ width: 1440, height: 900, returning, ms: returning ? 12000 : 6000 });
    assert.ok(flips(deskRoof) <= 1, `the desktop roof flips ${flips(deskRoof)} times`);
  }

  assert.deepEqual(errors, []);
  console.log("e2e: all checks passed");
} finally {
  await browser.close();
  server.close();
}
