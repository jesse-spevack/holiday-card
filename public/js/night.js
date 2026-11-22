// The snowy night around the room. On a tall screen the room leaves empty bands above and below it.
// This module fills them: a night sky with a moon and stars, a snowy roof with an attic window,
// a chimney with smoke, and string lights above the room, and falling snow below it.
// A greeting shows under the room while the dialog is hidden.
//
// All art draws on the room's own pixel grid (1 canvas pixel = 1 room pixel), so it lines up with
// room.png at every scale. The canvas follows the camera, so it zooms and pans with the room.
//
// The art (roof or eave, moon, chimney) is chosen for the stage at rest: the stage after the dialog hides.
// The dialog grows while the host types, and the Turnstile check mounts under it, so the live stage changes size.
// The art does not follow those changes. The canvas only covers the live bands, and the stage crops the rest.

import { ROOM_W, ROOM_H } from "./room.js";
import { PALETTE } from "./palette.js";
import { loadCss } from "./dom.js";

const CSS = "/night.css";

// Bands smaller than this (in room pixels) stay plain.
const MIN_BAND = 14;
// A band this tall gets the gable roof. A smaller band gets a flat snowy eave.
const ROOF_BAND = 34;
// The greeting needs this much room (in CSS pixels) under the room.
const GREETING_PX = 96;
// Snow keeps this far (in room pixels) from the words, so no flake looks like a stray dot in the text.
const WORD_GAP = 5;

// Colors from room.png and style.css.
const P = {
  ink: PALETTE.ink,
  gold: PALETTE.gold,
  goldHi: "#fff4c2",
  goldDk: "#f6b74a",
  outline: "#2a1813",
  wood: "#8b664f",
  woodHi: "#c4936b",
  brick: "#895136",
  brickSh: "#7a4632",
  brickDk: "#66463c",
  navyDk: "#141b32",
  navy: "#273049",
  siding: "#34405f",
  snow: "#f8f5f1",
  snowMid: "#dfe5ee",
  snowShade: "#b8c0c6",
  cream: "#edd7b6",
  star: "#c9ccd6",
  starDim: "#8a8ca8",
  starFaint: "#5c5f85",
  line: PALETTE.line,
  moon: "#fffbe9",
  moonRim: "#fff4d6",
  moonEdge: "#e8d9b0",
  halo: "#363e60",
  haloFar: "#2e3454",
  smokeHi: "#9a9cb6",
  smoke: "#7a7d9c",
};
// The sky gets lighter toward the room. The top color is the page background, so the sky has no seam.
const SKY = [PALETTE.night, "#1d1e34", "#20233b", "#232842", "#262e48", "#2a3450"];
const LIGHTS = [P.gold, "#7fb0ec", P.ink, "#ff9c8a", P.gold, "#9be3b0"];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

// A small seeded random, so the stars stay in the same places on every visit.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "#rrggbb" to a little-endian RGBA word for ImageData.
const rgba = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16);
};

export class Night {
  // clock: the scene. Its frames move the snow, the smoke, the stars, and the lights.
  constructor({ stage, reducedMotion, clock }) {
    this.clock = clock;
    this.stage = stage;
    this.reducedMotion = reducedMotion;
    this.canvas = Object.assign(document.createElement("canvas"), { className: "night" });
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d");
    this.greeting = document.createElement("div");
    this.greeting.className = "night-greeting";
    this.greeting.innerHTML = '<p class="night-hi">Happy holidays</p><p class="night-from">from Jesse, Jess, Eddie &amp; Audrey Spevack</p>';
    this.greeting.hidden = true;
    // Both sit behind the room, so bubbles and the sprite editor always show on top.
    stage.prepend(this.canvas, this.greeting);
    loadCss(CSS);
    this.art = null; // the roof, eave, and moon, chosen for the stage at rest
    this.band = null; // the live bands that the canvas covers
    this.view = null;
    this.wantGreeting = false;
    this.words = [];
    this.flakes = [];
    this.rand = seeded(42);
    this.puffs = [];
    this.running = false;
    this.last = 0;
    this.time = 0;
  }

  // The scene calls this whenever the room moves or the stage changes size.
  layout(view) {
    this.view = view;
    const art = this.plan();
    if (art.key !== this.art?.key) this.choose(art);
    if (!art.on) return;
    const band = this.measure();
    if (band.key !== this.band?.key) this.fit(band);
    const s = view.scale;
    const left = view.left + this.band.x0 * s;
    const top = view.top + this.band.y0 * s;
    const key = `${left}|${top}|${s}`;
    if (key !== this.placed) {
      this.placed = key;
      Object.assign(this.canvas.style, { left: `${left}px`, top: `${top}px`, width: `${this.band.w * s}px`, height: `${this.band.h * s}px` });
    }
    this.placeGreeting();
  }

  // Show the greeting while the dialog is hidden.
  showGreeting(on) {
    this.wantGreeting = on;
    this.placeGreeting();
  }

  // The stage at rest: once the dialog hides, the stage fills the app below the top bar, with the same
  // margin on each side. This size changes only when the window does.
  rest() {
    const app = this.stage.parentElement;
    const a = app.getBoundingClientRect();
    const r = this.stage.getBoundingClientRect();
    const as = getComputedStyle(app);
    const ss = getComputedStyle(this.stage);
    const side = r.left - a.left - parseFloat(as.paddingLeft);
    const w = a.width - parseFloat(as.paddingLeft) - parseFloat(as.paddingRight) - 2 * side;
    const h = a.bottom - parseFloat(as.paddingBottom) - r.top - parseFloat(ss.marginBottom);
    return { w: Math.max(w, this.stage.clientWidth), h: Math.max(h, this.stage.clientHeight) };
  }

  // The art for the stage at rest: no art, a flat eave, or a gable roof, and the moon.
  plan() {
    const { w, h } = this.rest();
    const s = Math.min(w / ROOM_W, h / ROOM_H);
    const top = s > 0 ? Math.floor((h - ROOM_H * s) / 2 / s) : 0;
    const on = top >= MIN_BAND;
    const roof = on && top >= ROOF_BAND ? Math.min(58, Math.round(top * 0.46)) : 0;
    const moon = on && top >= 30 ? { x: 40, y: Math.round(top * 0.3) - top - 1, r: top >= 60 ? 9 : 6 } : null;
    return { on, roof, moon, key: `${on}|${roof}|${moon?.y}|${moon?.r}` };
  }

  choose(art) {
    this.art = art;
    this.band = null;
    this.canvas.hidden = !art.on;
    if (!art.on) {
      this.greeting.hidden = true;
      this.stop();
      return;
    }
    // Start with a full trail of smoke, so the first frame already looks lived in.
    this.puffs = art.roof ? Array.from({ length: 11 }, (_, i) => ({ age: 6.6 - i * 0.6, seed: i * 1.7 })) : [];
    if (!this.reducedMotion) this.start();
  }

  // The live bands at the camera's resting scale, in whole room pixels.
  measure() {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    const s = Math.min(w / ROOM_W, h / ROOM_H);
    const top = Math.max(0, Math.floor((h - ROOM_H * s) / 2 / s));
    const pad = Math.max(0, Math.ceil((w - ROOM_W * s) / 2 / s));
    // One extra row and column on each side covers rounding at the stage edges.
    return { top: top + 1, bottom: top + 1, pad: pad + 1, bottomPx: (h - ROOM_H * s) / 2, key: `${top}|${pad}` };
  }

  // Size the canvas to the live bands. The art stays the same, so nothing jumps.
  fit(band) {
    Object.assign(band, this.art, {
      x0: -band.pad, x1: ROOM_W + band.pad, y0: -band.top, y1: ROOM_H + band.bottom,
      w: ROOM_W + 2 * band.pad, h: band.top + ROOM_H + band.bottom,
    });
    this.band = band;
    this.placed = null;
    this.canvas.width = band.w;
    this.canvas.height = band.h;
    this.still = this.paint(band);
    this.stars = this.makeStars(band);
    this.fitFlakes(band);
    // A new canvas size clears it, so draw now. Else the sky stays blank until the next frame.
    this.draw(0);
  }

  // ---------- the still art: sky, moon, roof ----------
  paint(b) {
    const img = new ImageData(b.w, b.h);
    const buf = new Uint32Array(img.data.buffer);
    const cache = new Map();
    const px = (x, y, hex) => {
      const X = Math.round(x) - b.x0;
      const Y = Math.round(y) - b.y0;
      if (X < 0 || Y < 0 || X >= b.w || Y >= b.h) return;
      let c = cache.get(hex);
      if (c === undefined) cache.set(hex, (c = rgba(hex)));
      buf[Y * b.w + X] = c;
    };
    // sky above the room, page color below it
    for (let y = b.y0; y < b.y1; y++) {
      const t = Math.min(1, (y - b.y0) / -b.y0) * (SKY.length - 1);
      const i = Math.floor(t);
      const f = t - i;
      for (let x = b.x0; x < b.x1; x++) {
        px(x, y, y >= 0 ? SKY[0] : f > bayer(x, y) ? SKY[Math.min(i + 1, SKY.length - 1)] : SKY[i]);
      }
    }
    if (b.moon) this.paintMoon(px, b.moon);
    if (b.roof) this.paintRoof(px, b);
    else this.paintEave(px, b);
    const out = document.createElement("canvas");
    out.width = b.w;
    out.height = b.h;
    out.getContext("2d").putImageData(img, 0, 0);
    return out;
  }

  // A crescent moon with a soft dithered halo.
  paintMoon(px, { x: cx, y: cy, r }) {
    const bx = r * 0.55;
    const by = -r * 0.35;
    for (let y = -r - 6; y <= r + 6; y++) {
      for (let x = -r - 6; x <= r + 6; x++) {
        const d = Math.hypot(x, y);
        const inMoon = d <= r + 0.3;
        const bite = Math.hypot(x - bx, y - by) <= r * 0.92;
        if (inMoon && !bite) {
          const edge = Math.hypot(x - bx, y - by) <= r * 0.92 + 1.3;
          px(cx + x, cy + y, edge ? P.moonEdge : d > r - 1.2 && x < 0 ? P.moonRim : P.moon);
        } else if (!inMoon && !bite && d <= r + 2.2) {
          px(cx + x, cy + y, P.halo);
        } else if (!inMoon && d <= r + 5 && (x + y) % 2 === 0) {
          px(cx + x, cy + y, P.haloFar);
        }
      }
    }
  }

  roofY(x) {
    const R = this.band.roof;
    return -R + Math.abs(x - 128) * (R / 136);
  }

  chimney() {
    const R = this.band.roof;
    return { x0: 158, x1: 172, top: -R - Math.max(4, Math.round(R * 0.1)) };
  }

  paintRoof(px, b) {
    const R = b.roof;
    // gable wall: blue siding with board lines, darker under the roof
    for (let y = -R; y < 0; y++) {
      for (let x = 0; x < ROOM_W; x++) {
        if (y < this.roofY(x) + 3) continue;
        const under = y - this.roofY(x) < 7;
        px(x, y, (y + 1000) % 4 === 0 ? P.navyDk : under && bayer(x, y) < 0.5 ? P.navy : P.siding);
      }
    }
    // a round attic window with a warm light
    if (R >= 30) {
      const wr = Math.max(6, Math.round(R * 0.15));
      const wx = 128;
      const wy = Math.round(-R * 0.42);
      for (let y = -wr - 2; y <= wr + 2; y++) {
        for (let x = -wr - 2; x <= wr + 2; x++) {
          const d = Math.hypot(x, y);
          if (d <= wr - 0.5) px(wx + x, wy + y, x === 0 || y === 0 ? P.wood : d < wr * 0.45 ? P.goldHi : d < wr * 0.8 ? P.gold : P.goldDk);
          else if (d <= wr + 1) px(wx + x, wy + y, P.cream);
          else if (d <= wr + 2) px(wx + x, wy + y, P.outline);
        }
      }
      for (let x = wx - wr - 2; x <= wx + wr + 2; x++) {
        px(x, wy + wr + 3, P.outline);
        px(x, wy + wr + 2, P.wood);
        if (x > wx - wr - 2 && x < wx + wr + 2) px(x, wy + wr + 1, P.snow);
      }
    }
    // the chimney sits over the fireplace side of the roof
    const c = this.chimney();
    for (let y = c.top; y < this.roofY(c.x0) + 2; y++) {
      for (let x = c.x0; x <= c.x1; x++) {
        const row = y - c.top;
        const mortar = row % 4 === 3 || (x - c.x0 + (Math.floor(row / 4) % 2) * 3) % 6 === 0;
        px(x, y, x === c.x0 || x === c.x1 ? P.outline : mortar ? P.brickDk : x > c.x1 - 4 ? P.brickSh : P.brick);
      }
    }
    for (let x = c.x0 - 1; x <= c.x1 + 1; x++) {
      px(x, c.top - 1, P.outline);
      px(x, c.top - 2, P.snow);
      if (x % 3 !== 0) px(x, c.top - 3, P.snow);
    }
    px(c.x0 - 1, c.top - 1, P.snow);
    px(c.x1 + 1, c.top - 1, P.snowMid);
    // the roof edge, under a thick lumpy cap of snow
    const lump = (x) => Math.round(Math.sin(x * 0.31) * 1.2 + Math.sin(x * 0.83 + 2) * 0.8);
    const cap = R >= 30 ? 8 : 5;
    for (let x = b.x0; x < b.x1; x++) {
      const ry = Math.round(this.roofY(x));
      for (let y = ry; y < ry + 3; y++) px(x, y, y === ry + 2 ? P.outline : P.wood);
      const depth = cap + lump(x);
      for (let k = 0; k < depth; k++) {
        const y = ry - k;
        if (x >= c.x0 && x <= c.x1 && y >= c.top && y < this.roofY(x)) {
          if (k < 2) px(x, y, P.snow);
          continue;
        }
        px(x, y, k === depth - 1 ? P.snowMid : k < 2 ? P.snowShade : P.snow);
      }
      // snow drips over the edge board
      if ((x * 7) % 11 === 0) {
        px(x, ry + 1, P.snow);
        if ((x * 3) % 5 === 0) px(x, ry + 2, P.snowMid);
      }
    }
    this.paintTrim(px, b);
  }

  // A short band gets no gable. Snow rests on a flat eave over the room instead.
  paintEave(px, b) {
    const lump = (x) => Math.round(Math.sin(x * 0.09) * 1.2 + Math.sin(x * 0.23 + 1) * 0.7);
    for (let x = b.x0; x < b.x1; x++) {
      const d = 5 + lump(x);
      for (let k = 4; k < 4 + d; k++) px(x, -k, k === 3 + d ? P.snowMid : k <= 5 ? P.snowShade : P.snow);
    }
    this.paintTrim(px, b);
  }

  // A trim board across the top of the room.
  paintTrim(px, b) {
    for (let x = b.x0; x < b.x1; x++) {
      px(x, -3, P.outline);
      px(x, -2, P.woodHi);
      px(x, -1, P.wood);
    }
  }

  // ---------- the moving parts: stars, snow, smoke, lights ----------
  // Each 18 x 18 cell of sky gets at most one star, from a seed for that cell. So a star stays in its
  // place when the bands change size.
  makeStars(b) {
    const CELL = 18;
    const bottom = b.roof ? -b.roof - 8 : -12;
    const out = [];
    const c = b.roof ? this.chimney() : null;
    for (let cy = Math.floor(b.y0 / CELL); cy * CELL < bottom; cy++) {
      for (let cx = Math.floor(b.x0 / CELL); cx * CELL < b.x1; cx++) {
        const r = seeded(Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ 7);
        if (r() > 0.85) continue;
        const x = cx * CELL + Math.floor(r() * CELL);
        const y = cy * CELL + Math.floor(r() * CELL);
        if (x < b.x0 || x >= b.x1 || y < b.y0 + 2 || y > bottom - 2) continue;
        if (b.moon && Math.hypot(x - b.moon.x, y - b.moon.y) < b.moon.r + 8) continue;
        if (c && x > c.x0 - 8 && x < c.x1 + 30 && y > c.top - 50) continue; // the smoke drifts here
        const k = r();
        out.push({ x, y, kind: k < 0.07 ? "plus" : k < 0.15 ? "gold" : "dot", dim: r() < 0.5, phase: r() * 10, rate: 0.6 + r() * 1.4 });
      }
    }
    return out;
  }

  // Keep the falling snow when the bands change size. Add or drop flakes to keep the same density,
  // and move a flake that is now off the canvas to a new place on it.
  fitFlakes(b) {
    const r = this.rand;
    const n = Math.round((b.w * (b.top + b.bottom)) / 260);
    const place = (f) => Object.assign(f, { x: b.x0 + r() * b.w, y: b.y0 + r() * b.h });
    this.flakes.length = Math.min(this.flakes.length, n);
    for (const f of this.flakes) if (f.x < b.x0 || f.x >= b.x1 || f.y < b.y0 || f.y >= b.y1) place(f);
    while (this.flakes.length < n) {
      this.flakes.push(place({ speed: 5 + r() * 9, sway: 0.5 + r() * 1.5, phase: r() * 6.28, big: r() < 0.22 }));
    }
  }

  // A flake hides where it would pass in front of the house or the words.
  hidden(x, y) {
    const b = this.band;
    if (x >= 0 && x < ROOM_W && y >= 0 && y < ROOM_H) return true;
    if (y < 0 && (b.roof ? y > this.roofY(x) - 6 : y > -10)) return true;
    return this.words.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1);
  }

  draw(dt) {
    const b = this.band;
    if (!b?.on) return;
    const g = this.ctx;
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x) - b.x0, Math.round(y) - b.y0, 1, 1); };
    const moving = !this.reducedMotion;
    this.time += dt;
    const t = this.time;
    g.drawImage(this.still, 0, 0);

    for (const st of this.stars) {
      const tw = moving ? Math.sin(t * st.rate + st.phase) : 1;
      if (st.kind === "plus") {
        px(st.x, st.y, P.ink);
        const arm = tw > -0.2 ? P.starDim : P.line;
        px(st.x - 1, st.y, arm); px(st.x + 1, st.y, arm); px(st.x, st.y - 1, arm); px(st.x, st.y + 1, arm);
      } else if (st.kind === "gold") {
        px(st.x, st.y, tw > -0.5 ? P.gold : PALETTE.goldDark);
      } else {
        px(st.x, st.y, st.dim ? (tw > 0 ? P.starDim : P.starFaint) : tw > -0.7 ? P.star : P.starDim);
      }
    }

    if (b.roof) this.drawSmoke(px, dt);

    for (const f of this.flakes) {
      if (moving) {
        f.y += f.speed * dt;
        if (f.y > b.y1) { f.y = b.y0; f.x = b.x0 + this.rand() * b.w; }
      }
      const x = Math.round(f.x + (moving ? Math.sin(t * 0.9 + f.phase) * f.sway * 2 : 0));
      const y = Math.round(f.y);
      if (this.hidden(x, y)) continue;
      if (f.big) {
        px(x, y, P.snow); px(x + 1, y, P.star); px(x, y + 1, P.star); px(x + 1, y + 1, P.starDim);
      } else {
        px(x, y, f.speed > 10 ? P.snow : P.star);
      }
    }

    // string lights along the roof edge
    if (b.roof) {
      const c = this.chimney();
      let i = 0;
      for (let x = b.x0 + 3; x < b.x1 - 1; x += 7, i++) {
        if (x >= c.x0 - 2 && x <= c.x1 + 2) continue;
        const y = Math.round(this.roofY(x)) + 3;
        if (y > -5) continue;
        const on = !moving || Math.sin(t * 1.4 + i * 2.1) > -0.5;
        const col = LIGHTS[i % LIGHTS.length];
        px(x, y + 1, on ? "#ffffff" : P.line);
        px(x + 1, y + 1, on ? col : "#3a3f63");
        px(x, y + 2, on ? col : "#3a3f63");
        px(x + 1, y + 2, on ? (col === P.ink ? P.star : col) : P.haloFar);
      }
    }
  }

  drawSmoke(px, dt) {
    const c = this.chimney();
    const cx = c.x0 + 7;
    const cy = c.top - 3;
    if (!this.reducedMotion) {
      if (this.puffs.at(-1).age > 0.6) this.puffs.push({ age: 0, seed: Math.random() * 6 });
      for (const p of this.puffs) p.age += dt;
      this.puffs = this.puffs.filter((p) => p.age < 7);
    }
    for (const p of this.puffs) {
      const y = cy - p.age * 6;
      const x = cx + p.age * 3.2 + Math.sin(p.age * 1.3 + p.seed) * 1.5;
      const r = 1.6 + p.age * 0.75;
      const fade = Math.max(0, (p.age - 1.5) / 6);
      const n = Math.ceil(r);
      for (let dy = -n; dy <= n; dy++) {
        for (let dx = -n; dx <= n; dx++) {
          if (Math.hypot(dx, dy) > r) continue;
          const X = Math.round(x + dx);
          const Y = Math.round(y + dy);
          if (bayer(X, Y) < fade) continue;
          px(X, Y, dx < 0 && dy < 0 ? P.smokeHi : dy > r * 0.4 ? P.starFaint : P.smoke);
        }
      }
    }
  }

  // ---------- the greeting under the room ----------
  placeGreeting() {
    const b = this.band;
    const v = this.view;
    const show = this.wantGreeting && b?.on && b.bottomPx >= GREETING_PX && v;
    if (!show) {
      if (!this.greeting.hidden) { this.greeting.hidden = true; this.words = []; }
      return;
    }
    const top = v.top + ROOM_H * v.scale;
    const height = this.stage.clientHeight - top;
    const key = `${top}|${height}`;
    if (this.greeting.hidden || key !== this.greetingKey) {
      this.greetingKey = key;
      Object.assign(this.greeting.style, { top: `${top}px`, height: `${Math.max(0, height)}px` });
      this.greeting.hidden = false;
      this.measureWords();
      // The pixel font can arrive late and change the size of the words.
      document.fonts?.ready.then(() => {
        if (this.greeting.hidden) return;
        this.measureWords();
        if (this.reducedMotion) this.draw(0);
      });
      // A still frame redraws so no flake sits on a letter.
      if (this.reducedMotion) this.draw(0);
    }
  }

  // The words' boxes in room pixels, so falling snow never lands on a letter.
  measureWords() {
    const v = this.view;
    const st = this.stage.getBoundingClientRect();
    this.words = [...this.greeting.children].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x0: (r.left - st.left - v.left) / v.scale - WORD_GAP, x1: (r.right - st.left - v.left) / v.scale + WORD_GAP,
        y0: (r.top - st.top - v.top) / v.scale - WORD_GAP, y1: (r.bottom - st.top - v.top) / v.scale + WORD_GAP,
      };
    });
  }

  // ---------- loop ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.unsubscribe = this.clock.onFrame((now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw(dt);
    });
  }

  stop() {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
