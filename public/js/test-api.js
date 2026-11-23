// The page's test API. app.js loads it only when the address has "?test", and puts it on window.__hc.
// The end-to-end tests use only this API, so a change inside the page modules changes this one file, not the tests.
// Each function takes and returns plain data, so a test can call it through page.evaluate.

// The hidden extras give their own parts of this API (the `test` of each extra, registry.js). This file names no extra.

import { TAP_PX, pickSpot } from "./scene.js";
import { HOSTS, HOST_LINES } from "./hosts.js";
import { HOTSPOTS } from "./registry.js";
import { GLINT } from "./glint.js";
import { IDLE } from "./idle.js";
import { FLOOR, WINDOW } from "./room.js";

export function testApi({ scene, sound, extras, found, tuckNow, glint, idle, counter, lines, marker }) {
  // The sprites that match every field in `want`, for example { familyId: "other1", index: 0 } or { host: true, name: "Jesse" }.
  const find = (want = {}) => scene.sprites.filter((s) => Object.entries(want).every(([k, v]) => s[k] === v));
  const one = (want) => {
    const s = find(want)[0];
    if (!s) throw new Error(`no sprite ${JSON.stringify(want)}`);
    return s;
  };
  const rect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const plain = (s) => ({
    familyId: s.familyId, index: s.index, type: s.type, look: s.look, host: !!s.host, id: s.id, name: s.name, mine: !!s.mine,
    mingle: !!s.mingle, x: s.x, y: s.y, flip: s.flip, bob: s.bob, path: s.path ? { ...s.path } : null, home: s.home ? { ...s.home } : null,
    w: s.img?.width ?? 0, h: s.img?.height ?? 0,
    react: s.react ? { kind: s.react.kind, ago: scene.time - s.react.at } : null,
    bubble: s.bubbleEl?.textContent ?? null,
    bubbleBox: s.bubbleEl ? rect(s.bubbleEl.getBoundingClientRect()) : null,
    // The bubble cuts off part of its text.
    bubbleClipped: s.bubbleEl ? s.bubbleEl.scrollWidth > s.bubbleEl.clientWidth || s.bubbleEl.scrollHeight > s.bubbleEl.clientHeight : null,
    nameBox: s.nameEl ? rect(s.nameEl.getBoundingClientRect()) : null,
  });
  const toScreen = (x, y) => {
    const r = scene.stage.getBoundingClientRect();
    const v = scene.view;
    return { x: r.left + v.left + x * v.scale, y: r.top + v.top + y * v.scale };
  };
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  let hits = null;
  const heard = [];
  const spy = (target, names, label) => {
    for (const name of names) {
      const play = target[name].bind(target);
      target[name] = (...args) => {
        heard.push(label(name, args));
        return play(...args);
      };
    }
  };

  const fromExtras = extras.test({ rect, center, spy });

  const page = {
    // What has loaded: the room, the book, the masks for the hidden extras, and the sprites with their images.
    loaded: () => ({
      room: !!scene.room, eggs: !!scene.prepared, ...fromExtras.loaded(),
      hosts: scene.sprites.filter((s) => s.host && s.img).length,
      families: Object.fromEntries([...scene.families.keys()].map((id) => [id, scene.sprites.filter((s) => s.familyId === id && s.img).length])),
    }),
    time: () => scene.time,
    scale: () => scene.view.scale,

    // ---- the clock ----
    // The scene clock drives everything that moves in the room. pause() stops it: the room still draws and takes taps,
    // but nothing moves until advance() or play(). The wall-clock timers still run: the bubbles, the words, and the tuck.
    pause: () => { scene.paused = true; },
    play: () => { scene.paused = false; },
    // Moves the scene clock `seconds` ahead at once, stopped or not, and returns the new time.
    advance: (seconds) => {
      scene.advance(seconds);
      return scene.time;
    },
    // Tucks the thank-you now, as app.js does after 7 seconds. True when the dialog is tucked.
    tuckNow,

    // ---- sprites ----
    sprites: (want) => find(want).map(plain),
    sprite: (want) => plain(one(want)),
    // A screen point that the scene resolves to the sprite that matches `want`, even when another sprite stands close.
    pointOn: (want) => {
      const s = one(want);
      const h = s.img.height;
      const dys = [];
      for (let dy = Math.round(h / 2); dy < h; dy++) dys.push(dy, h - dy);
      for (const dy of dys) {
        for (const dx of [0, -3, 3, -6, 6]) {
          const p = { x: s.x + dx, y: s.y - dy };
          if (scene.spriteAt(p.x, p.y) === s) return { ...toScreen(p.x, p.y), look: s.look };
        }
      }
      throw new Error(`no clear point on ${JSON.stringify(want)}`);
    },
    // Puts a sprite on a spot in room pixels and keeps it there.
    place: (want, x, y) => {
      for (const s of find(want)) Object.assign(s, { x, y, home: { x, y }, path: null, bob: 0, wander: false });
    },
    // Sends the hosts home and stops them, so a tap lands where a test aims.
    stillHosts: () => {
      for (const s of find({ host: true })) Object.assign(s, { x: s.home.x, y: s.home.y, path: null, bob: 0, wander: false });
    },
    // Stops every guest where it stands.
    stillGuests: () => {
      for (const s of scene.sprites.filter((q) => !q.host)) Object.assign(s, { wander: false, path: null, bob: 0 });
    },

    // ---- the room ----
    toScreen,
    roomCenter: (box) => center(scene.roomRect(box)),
    spotCenter: (id) => {
      const s = HOTSPOTS.find((h) => h.id === id);
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    },
    // The id of the thing that shows the press corners, or the name of the sprite.
    pressed: () => scene.press?.box?.id ?? scene.press?.sprite?.name ?? null,
    // From now on a tap on a hidden thing notes its id and opens nothing. hotspotHits() returns the ids since the last call.
    catchHotspots: () => {
      hits = [];
      scene.onHotspot = (id) => hits.push(id);
    },
    hotspotHits: () => hits.splice(0),
    // The share of the screen, in CSS pixels, that each hidden thing takes through its center.
    hotspotAreas: (px) => {
      const scale = scene.view.scale;
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
    },
    // HOTSPOTS, FLOOR, HOSTS, HOST_LINES, TAP_PX, WINDOW, GLINT, and IDLE, and the constants of the extras (DREIDELS, PLANTS, TRUCK).
    constants: () => ({ HOTSPOTS, FLOOR, HOSTS, HOST_LINES, TAP_PX, WINDOW, GLINT, IDLE, ...fromExtras.constants() }),

    // ---- the hidden extras ----
    // The state of the room extras that have no test API of their own: { star, lampOn, lighting, menorahLit, flames, candles,
    // car, truck, nextCarIn, nextTruckIn }. car and truck are the x of the Waymo or the Cybertruck while it is on the road, else null.
    eggs: fromExtras.eggs,
    // The color of the room canvas at a room pixel, as "#rrggbb".
    pixel: (x, y) => {
      const [r, g, b] = scene.ctx.getImageData(x, y, 1, 1).data;
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    },
    // ---- the help to find the extras ----
    // The glint: { on, shown: { egg, id, x, y, age } or null, nextIn, twinkles }. x, y is the white heart in room pixels.
    glint: () => glint.state(),
    // The hosts' own lines: { on, quiet, wait, said: [{ host, text, hint, at }] }. quiet and wait are scene seconds.
    idle: () => idle.state(),
    // The gold arrow of "My family": { on, familyId, index, tip }. tip is the arrow's point in room pixels, after the last frame.
    marker: () => marker.state(),
    // The counter: { shown, text, done, celebrations, found, total, missing, box }. missing is the names of the extras left.
    counter: () => counter.state(),
    // One turn of the guests' own lines now, as the 3.5-second timer does (cycleBubbles in app.js).
    lineTurn: () => lines.lineTurn(),
    // Asks for the party now, as the 30-second poll does. The promise ends when the party is in the room.
    pollParty: () => lines.pollParty(),
    // Says a line over a sprite for `seconds` of wall time, as a guest's bubble does. An empty text takes the bubble away.
    say: (want, text, seconds = 30) => scene.say(one(want), text, seconds),

    // Marks extras as found, so the hosts stop their hints.
    found: (...names) => { for (const name of names) found.seen.add(name); },
    // The time in ms between two interaction calls for the same extra (found.js). The page uses 5000.
    trackGap: (ms) => { found.tracking.gapMs = ms; },
    // The number of interaction calls that the page sent. A test waits until the fake API has them all (interactions in harness.mjs).
    interactionsSent: () => found.tracking.sent,

    // ---- sounds ----
    // Notes each call to the named sounds and still plays them. sounds() returns the calls since the last call.
    spySounds: (names) => spy(sound, names, (name, args) => (args.length ? `${name}:${args[0]}` : name)),
    sounds: () => heard.splice(0),
    samplesLoaded: () => Object.keys(sound.samples ?? {}).length,
    // The Sound object itself, for the checks that listen to what a sound plays.
    sound,
  };
  for (const name of Object.keys(fromExtras.api)) if (name in page) throw new Error(`an extra gives the test API ${name}, which the page has`);
  return { ...page, ...fromExtras.api };
}
