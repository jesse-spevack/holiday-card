// The glint: a gold sparkle on one tap area of a hidden extra that the guest has not found. It shows every few seconds.
// It goes round the extras in the order of their list, one sparkle at a time. An extra with no tap area (a car, the pets,
// the silly looks) gets no glint, and an extra stops its glint once this browser finds it.
// The glint runs on the scene clock from the moment the room shows, for every visitor, also while the form shows (start and stop).
// The scene draws it as a layer, over the lamp's dark blue, so it shows in a dark room too. It draws on the room only,
// never on the dialog.
// burst() is the room's sparkle when the guest finds the last extra (counter.js).

import { PALETTE } from "./palette.js";

// The times, in scene seconds. every: from one glint to the next. seconds: how long a glint shows.
// With reduced motion, the glint is a still sparkle that shows longer and less often.
// peak: the full size of a glint (FRAMES), in room pixels. A still glint (reduced motion) keeps it.
export const GLINT = {
  every: 3.5, seconds: 1.8,
  peak: { arm: 8, body: 3, white: 2 },
  still: { every: 8, seconds: 2.5 },
  // The room's sparkle: each twinkle starts this long after the one before it, and shows for `seconds`.
  burst: { gap: 0.05, seconds: 1.2 },
};
// The soft dark edge of a glint, in the brown of the corners of a tap (scene.js).
const OUTLINE = "rgba(42, 24, 19, 0.85)";
const WHITE = "#ffffff";
// The shape of a glint as it grows, holds, and shrinks: [until, arm, body, white], with `until` a share of its time.
// arm: the reach of the four gold arms in room pixels. body: the gold diamond at the heart, so the arms grow thick there.
// white: the white diamond at the heart. At its full size, the glint breathes in once, as a star twinkles.
const PEAK = GLINT.peak;
const FRAMES = [
  [0.04, 0, 0, 0], [0.08, 1, 0, 0], [0.12, 2, 1, 1], [0.17, 4, 2, 1], [0.23, 6, 2, 2],
  [0.4, PEAK.arm, PEAK.body, PEAK.white], [0.5, PEAK.arm - 1, PEAK.body, PEAK.white], [0.67, PEAK.arm, PEAK.body, PEAK.white],
  [0.74, 6, 2, 2], [0.8, 4, 2, 1], [0.86, 2, 1, 1], [0.93, 1, 0, 0], [1, 0, 0, 0],
];
// The pixels of a glint around its heart: [[dx, dy, color]]. The dark edge goes round each lit pixel, outside it.
const shapes = new Map();
function shape({ arm, body, white }) {
  const key = `${arm}/${body}/${white}`;
  if (shapes.has(key)) return shapes.get(key);
  const lit = new Map();
  for (let dy = -arm; dy <= arm; dy++) {
    for (let dx = -arm; dx <= arm; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > body && dx && dy) continue;
      lit.set(`${dx},${dy}`, [dx, dy, d <= white ? WHITE : PALETTE.gold]);
    }
  }
  const edge = new Map();
  for (const [dx, dy] of lit.values()) {
    for (const [ex, ey] of [[dx + 1, dy], [dx - 1, dy], [dx, dy + 1], [dx, dy - 1]]) {
      const k = `${ex},${ey}`;
      if (!lit.has(k)) edge.set(k, [ex, ey, OUTLINE]);
    }
  }
  const pixels = [...edge.values(), ...lit.values()];
  shapes.set(key, pixels);
  return pixels;
}

// The point of a tap area where its glint shows: right of the middle and near the top, where a light would catch it.
export function glintPoint({ x, y, w, h }) {
  return { x: x + Math.round(w * 0.7), y: y + Math.round(Math.min(h * 0.3, 8)) };
}

export class Glint {
  // targets() is the extras that the guest has not found and that fit: [{ name, spots }] (registry.js fitting()).
  constructor({ scene, reducedMotion, targets }) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.targets = targets;
    this.times = reducedMotion ? GLINT.still : GLINT;
    this.on = false;
    // The glint that shows: { egg, id, x, y, t0 }, or null. lastEgg and turns choose the next one.
    this.shown = null;
    this.next = 0;
    this.lastEgg = null;
    this.turns = new Map();
    // The twinkles of the room's sparkle: [{ x, y, t0 }].
    this.twinkles = [];
  }

  // The first glint shows a moment after the start.
  start() {
    if (this.on) return;
    this.on = true;
    this.next = this.scene.time + 1;
  }

  stop() {
    this.on = false;
    this.shown = null;
  }

  // The next extra after the last one in the list, and the next of its tap areas.
  pick() {
    const all = this.targets().filter((t) => t.spots.length);
    if (!all.length) return null;
    const after = all.findIndex((t) => t.name === this.lastEgg);
    const target = all[(after + 1) % all.length];
    const turn = this.turns.get(target.name) ?? 0;
    this.turns.set(target.name, turn + 1);
    const spot = target.spots[turn % target.spots.length];
    this.lastEgg = target.name;
    return { egg: target.name, id: spot.id, ...glintPoint(spot) };
  }

  // A twinkle on every tap area of every extra that fits, one after another.
  burst(spots) {
    const time = this.scene.time;
    spots.forEach((s, i) => this.twinkles.push({ ...glintPoint(s), t0: time + i * GLINT.burst.gap }));
  }

  // ---- the layer hooks that the scene calls ----
  update() {
    const time = this.scene.time;
    this.twinkles = this.twinkles.filter((t) => time - t.t0 < GLINT.burst.seconds);
    if (this.shown && time - this.shown.t0 >= this.times.seconds) this.shown = null;
    // A glint stops at once when the guest finds its extra.
    if (this.shown && !this.targets().some((t) => t.name === this.shown.egg)) this.shown = null;
    if (!this.on || this.shown || time < this.next) return;
    this.next = time + this.times.every;
    const p = this.pick();
    if (p) this.shown = { ...p, t0: time };
  }

  drawFront(g) {
    const time = this.scene.time;
    if (this.shown) this.draw(g, this.shown, (time - this.shown.t0) / this.times.seconds);
    for (const t of this.twinkles) {
      const k = (time - t.t0) / GLINT.burst.seconds;
      if (k >= 0) this.draw(g, t, k);
    }
  }

  // A white dot grows into a gold star with a white heart, holds, and shrinks to a dot again. k goes from 0 to 1.
  // With reduced motion, the star holds its full size.
  draw(g, { x, y }, k) {
    const frame = FRAMES.find(([until]) => k < until) ?? FRAMES.at(-1);
    const size = this.reducedMotion ? PEAK : { arm: frame[1], body: frame[2], white: frame[3] };
    for (const [dx, dy, color] of shape(size)) {
      g.fillStyle = color;
      g.fillRect(x + dx, y + dy, 1, 1);
    }
  }

  // The state of the glint, for the tests.
  state() {
    const time = this.scene.time;
    return {
      on: this.on,
      shown: this.shown ? { egg: this.shown.egg, id: this.shown.id, x: this.shown.x, y: this.shown.y, age: time - this.shown.t0 } : null,
      nextIn: this.next - time,
      twinkles: this.twinkles.filter((t) => time >= t.t0).length,
    };
  }
}
