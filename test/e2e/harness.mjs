// The shared parts of the end-to-end tests: a static server for public/, Google Chrome, a fake API,
// and helpers that read the page through its test API (public/js/test-api.js, on window.__hc).
//
// Each test file runs in its own process with its own server and browser:
//   pnpm e2e                               all files, a few at a time
//   node --test test/e2e/album.test.mjs    one file
// Screenshots go to build/e2e (or E2E_OUT).
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { before, after } from "node:test";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = new URL("../../public/", import.meta.url).pathname;
export const ART = new URL("../../art/assets/characters/", import.meta.url).pathname;
export const OUT = process.env.E2E_OUT || "build/e2e";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".m4a": "audio/mp4" };

// Test looks use the committed sample guests, so the tests do not depend on the looks library.
// The ages and silly looks are out of order on purpose: the look picker sorts them.
export const LOOKS = {
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

// The captions are as long as the real ones: a medium one, a long one of 200 characters on a tall photo, and a short one.
export const ALBUM = { photos: [
  { src: "/album/0000000000000001.jpg", caption: "Waymos arrived in Denver this year and we are all in.", w: 1400, h: 1050 },
  { src: "/album/0000000000000002.jpg", caption: "Audrey started fifth grade. She takes piano lessons, is a member of the Colorado Children's Chorale, and loves to read and write. She's tracking every book she reads, so ask her for a recommendation.", w: 1050, h: 1400 },
  { src: "/album/0000000000000003.jpg", caption: "We took Waymos", w: 1400, h: 1050 },
] };

// The party that the fake API returns unless a test gives its own.
export const PARTY = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["Happy Hanukkah!", ""] }] };
// A family that this browser signed up before.
export const GARCIA = { id: "fam12345", token: "tok", name: "The Garcia Family", members: [{ type: "adult", look: "t-mom" }, { type: "kid", look: "t-kid" }], bubbles: ["", ""] };
// The hosts by their sprite ids (scene.js HOSTS) and names.
export const HOSTS_BY_NAME = [{ id: "jessica", name: "Jess" }, { id: "jesse", name: "Jesse" }, { id: "daughter", name: "Audrey" }, { id: "son", name: "Eddie" }];

// A fake Worker API. Each page gets its own, with its own list of calls.
// The first submit fails, so the form shows its retry.
function fakeApi({ party = PARTY, calls }) {
  let failSubmitOnce = true;
  return async (route) => {
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
        return reply(party);
      case "/api/sprite":
        return reply({ ok: true });
      case "/api/interaction":
        return route.fulfill({ status: 204 });
      case "/api/config":
        return reply({ turnstileSiteKey: "" });
    }
    return reply({ error: "not found" }, 404);
  };
}

// Starts the server and the browser for one test file, and checks after the file that no page threw an error.
export async function e2e() {
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
  const env = { browser: null, base: "", errors: [] };
  before(async () => {
    await new Promise((r) => server.listen(0, r));
    env.base = `http://127.0.0.1:${server.address().port}/?test`;
    await mkdir(OUT, { recursive: true });
    env.browser = await chromium.launch({ channel: "chrome" });
  });
  after(async () => {
    await env.browser?.close();
    server.close();
    assert.deepEqual(env.errors, [], "a page threw an error");
  });

  // Opens the page in a new browser context and waits for the test API.
  // options: Playwright context options (viewport, reducedMotion, hasTouch, ...), plus
  //   party: the /api/party reply, mine: families this browser signed up before,
  //   realLooks: use public/assets/looks.json, not the test looks, album: serve the fake album,
  //   query: more of the address after "?test", init: scripts to run before the page loads,
  //   wait: what to wait for: "api" (the default), "room" (the room and the four hosts), or "eggs" (the room, the book, and the extras).
  env.open = async ({ party, mine, realLooks = false, album = false, query = "", init = [], wait = "api", routes = [], ...context } = {}) => {
    const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, ...context });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => env.errors.push(String(e)));
    const calls = [];
    await page.route("**/api/**", fakeApi({ party, calls }));
    if (!realLooks) await page.route("**/assets/looks.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LOOKS) }));
    const albumCalls = [];
    if (album) {
      await page.route("**/album/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        albumCalls.push(path);
        if (path === "/album/list") return route.fulfill({ contentType: "application/json", body: JSON.stringify(ALBUM) });
        return route.fulfill({ contentType: "image/png", body: await readFile(join(ART, "sample-dad.png")) });
      });
    }
    for (const [pattern, handler] of routes) await page.route(pattern, handler);
    if (mine) await page.addInitScript((m) => localStorage.setItem("hc.families", JSON.stringify(m)), mine);
    for (const script of init) await page.addInitScript(script);
    await page.goto(env.base + query);
    await page.waitForFunction(() => window.__hc);
    if (wait === "room" || wait === "eggs") {
      await page.waitForFunction((eggs) => {
        const l = window.__hc.loaded();
        return l.room && l.hosts === 4 && (!eggs || (l.book && l.eggs));
      }, wait === "eggs");
    }
    return { page, ctx, calls, albumCalls, hc: api(page) };
  };
  return env;
}

// Calls the page's test API: `await hc.eggs()` runs window.__hc.eggs() in the page.
export function api(page) {
  return new Proxy({}, {
    get: (_, name) => (...args) => page.evaluate(([n, a]) => window.__hc[n](...a), [name, args]),
  });
}

// Waits until the families in `want` ({ familyId: count }) show with their images.
export const waitForFamilies = (page, want) => page.waitForFunction((w) => {
  const got = window.__hc.loaded().families;
  return Object.entries(w).every(([id, n]) => got[id] === n);
}, want);

// A tap on a room pixel, with a finger or a mouse.
export async function tapRoom(page, x, y, { touch = true } = {}) {
  const p = await api(page).toScreen(x, y);
  return touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
}

// Waits until no finite animation runs on the page, so a screenshot shows the end of a move.
export const animationsDone = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity));

// Waits until the scene's clock moves `seconds` past now.
export async function sceneWait(page, seconds) {
  const t0 = await api(page).time();
  await page.waitForFunction((t) => window.__hc.time() >= t, t0 + seconds);
}

// The whole room shows: the room's box sits inside the stage, and it touches two opposite edges.
export const wholeRoom = (pg) => pg.evaluate(() => {
  const st = document.getElementById("stage").getBoundingClientRect();
  const wr = document.getElementById("world").getBoundingClientRect();
  const inside = wr.left >= st.left - 0.5 && wr.top >= st.top - 0.5 && wr.right <= st.right + 0.5 && wr.bottom <= st.bottom + 0.5;
  const fills = wr.width > st.width - 1 || wr.height > st.height - 1;
  return { ok: inside && fills, stage: [st.left, st.top, st.width, st.height], world: [wr.left, wr.top, wr.width, wr.height] };
});
export async function assertWholeRoom(pg, what) {
  // The camera eases, so give it up to 3 seconds to settle. The assert below then reports a room that does not fit.
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
export const nightState = (pg) => pg.evaluate(() => {
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
export async function assertTucks(pg) {
  const started = Date.now();
  await pg.locator("#dialog").waitFor({ state: "hidden", timeout: 8500 });
  await pg.getByRole("button", { name: "Add another address" }).waitFor({ timeout: 500 });
  assert.ok(Date.now() - started < 8500);
}

// The words that the host types in the dialog, once the whole line shows.
export const said = (pg, text) => pg.locator("#say").filter({ hasText: text }).waitFor();
// Waits until the host has typed the whole line, so nothing in the dialog moves.
export const typed = (pg) => pg.waitForFunction(() => {
  const say = document.getElementById("say");
  return say && !say.querySelector("span");
});
