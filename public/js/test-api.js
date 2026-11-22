// The page's test API. app.js loads it only when the address has "?test", and puts it on window.__hc.
// The end-to-end tests use only this API, so a change inside the page modules changes this one file, not the tests.
// Each function takes and returns plain data, so a test can call it through page.evaluate.

import { HOSTS, HOST_LINES, TAP_PX, pickSpot } from "./scene.js";
import { HOTSPOTS, DREIDELS, FLOOR, WINDOW, PLANTS } from "./room.js";
import { TOAST_LINES } from "./toast.js";
import { CARS } from "./eggs.js";

export function testApi({ scene, sound, eggs, dreidel, toast, plants, fire, album, found, tracking }) {
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

  return {
    // What has loaded: the room, the book, the masks for the hidden extras, and the sprites with their images.
    loaded: () => ({
      room: !!scene.room, book: !!scene.book, eggs: !!eggs.glassLayer,
      hosts: scene.sprites.filter((s) => s.host && s.img).length,
      families: Object.fromEntries([...scene.families.keys()].map((id) => [id, scene.sprites.filter((s) => s.familyId === id && s.img).length])),
    }),
    time: () => scene.time,
    scale: () => scene.view.scale,

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
    bookCenter: () => center(scene.bookRect()),
    bookHidden: () => !scene.bookShown,
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
    constants: () => ({
      HOTSPOTS, DREIDELS, FLOOR, PLANTS, HOSTS, HOST_LINES, TAP_PX, WINDOW,
      TRUCK: { w: CARS.cybertruck.w, h: CARS.cybertruck.rows.length, colors: Object.values(CARS.cybertruck.colors) },
    }),

    // ---- the hidden extras ----
    eggs: () => {
      const e = eggs;
      return {
        star: !!e.star, lampOn: e.lampOn, lighting: !!e.lighting, menorahLit: e.menorahLit, flames: scene.flames.length,
        // The x of the Waymo or the Cybertruck while it is on the road, else null. Only one car is on the road at a time.
        car: e.car?.kind === "waymo" ? e.car.x : null, truck: e.car?.kind === "cybertruck" ? e.car.x : null,
        nextCarIn: e.next.waymo - scene.time, nextTruckIn: e.next.cybertruck - scene.time,
      };
    },
    sendWaymo: () => eggs.send("waymo"),
    // dir 1 drives right, -1 drives left. With no dir, the truck picks a way.
    sendCybertruck: (dir) => eggs.send("cybertruck", dir),
    // The car on the road as the last frame drew it, cut to the window glass: each solid pixel as [x, y, "#rrggbb"] in room pixels.
    carPixels: () => {
      const { width, height } = eggs.sky;
      const data = eggs.sky.getContext("2d").getImageData(0, 0, width, height).data;
      const out = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 255) continue;
        const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
        out.push([(i / 4) % width, Math.floor(i / 4 / width), hex]);
      }
      return out;
    },
    // The toast: { on, age, speaker, line, lift, readyIn, people: [{ familyId, index, name, flip, hop, cup }] }.
    // cup is { kind: "wine" or "cocoa", x, y, w, h, hand, lift } in room pixels. hand is the column of the hand that holds it.
    toast: () => toast.state(),
    toastLines: () => [...TOAST_LINES],
    // The plants: { bloomed: [ids], flowers: [{ plant, x, y, stage, center }], twinkles, moment: { age, petals } or null, momentDone }.
    // x, y is the center of a flower in room pixels, and center is the color there once the flower is "full".
    plants: () => plants.state(),
    // The color of the room canvas at a room pixel, as "#rrggbb".
    pixel: (x, y) => {
      const [r, g, b] = scene.ctx.getImageData(x, y, 1, 1).data;
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    },
    // The fire: { bursts, sparks, embers, flare, moving, box, max, bounds }. flare goes from 1 right after a tap to 0.
    // box holds every spark and ember now, and bounds is the box they must stay in, both in room pixels.
    fire: () => fire.state(),
    found: (...eggs) => { for (const egg of eggs) found.add(egg); },
    // The time in ms between two interaction calls for the same egg (app.js track). The page uses 5000.
    trackGap: (ms) => { tracking.gapMs = ms; },

    // ---- the dreidel game ----
    // { face, speed }: the side to land on and how much faster the clock runs.
    rigDreidel: (rig) => { dreidel.rig = rig; },
    dreidelSpins: () => dreidel.spins,
    // The game is open and takes taps. Right after it opens, it ignores taps for a moment, so a double tap does not spin it.
    dreidelReady: () => dreidel.isOpen && !dreidel.busy && performance.now() >= dreidel.ignoreClicksUntil,

    // ---- the photo album ----
    // The album in its current state: { ready, spread, book, controls, photos }. ready is true when the album is open and no page turns.
    // book and controls are screen boxes. photos has one item for each photo page that shows:
    // { caption, font, overflow, paper, print, cap }. font is the caption font size in CSS pixels.
    // overflow is true when the caption text needs more space than its box. paper, print, and cap are screen boxes.
    album: () => {
      const box = (el) => rect(el.getBoundingClientRect());
      if (!album.el || album.el.hidden) return { ready: false, spread: false, book: null, controls: [], photos: [] };
      const step = album.spread ? 2 : 1;
      const photos = album.pages.slice(album.at, album.at + step).filter((p) => p.kind === "photo" && p.el?.isConnected).map((p) => ({
        caption: p.cap.textContent,
        font: parseFloat(getComputedStyle(p.cap).fontSize),
        overflow: p.cap.scrollHeight > p.cap.clientHeight || p.cap.scrollWidth > p.cap.clientWidth,
        paper: box(p.el.parentElement),
        print: box(p.print),
        cap: box(p.cap),
      }));
      return {
        ready: album.isOpen && !album.busy && !album.settle,
        spread: album.spread,
        book: box(album.book),
        controls: [album.closeBtn, album.prev, album.count.parentElement, album.next].map(box),
        photos,
      };
    },

    // ---- sounds ----
    // Notes each call to the named sounds and still plays them. sounds() returns the calls since the last call.
    spySounds: (names) => spy(sound, names, (name, args) => (args.length ? `${name}:${args[0]}` : name)),
    spyDreidelSounds: (names) => spy(dreidel.sound, names, (name, args) => (name === "result" ? `result:${args[0]}` : name)),
    sounds: () => heard.splice(0),
    samplesLoaded: () => Object.keys(sound.samples ?? {}).length,
    // The Sound object itself, for the checks that listen to what a sound plays.
    sound,
  };
}
