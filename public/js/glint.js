// The glint: every few seconds, a small gold twinkle shows on one tap area of a hidden extra that the guest has not found.
// It goes round the extras in the order of their list, one twinkle at a time. An extra with no tap area (a car, the pets,
// the silly looks) gets no glint, and an extra stops its glint once this browser finds it.
// The glint runs on the scene clock, only after the thank-you tucks away (start and stop). The scene draws it as a layer,
// over the lamp's dark blue, so it shows in a dark room too.
// burst() is the room's sparkle when the guest finds the last extra (counter.js).

import { drawTwinkle } from "./pixels.js";
import { PALETTE } from "./palette.js";

// The times, in scene seconds. every: from one glint to the next. seconds: how long a glint shows.
// With reduced motion, the glint is a still sparkle that shows longer and less often.
export const GLINT = {
  every: 4, seconds: 0.9,
  still: { every: 8, seconds: 1.6 },
  // The room's sparkle: each twinkle starts this long after the one before it, and shows for `seconds`.
  burst: { gap: 0.05, seconds: 0.9 },
};
// The soft dark edge of a glint, in the brown of the corners of a tap (scene.js).
const OUTLINE = "rgba(42, 24, 19, 0.8)";
// The length of the gold arms as a glint grows and shrinks: [until, arm], with `until` a share of its time.
const ARMS = [[0.12, 0], [0.27, 1], [0.4, 2], [0.6, 3], [0.73, 2], [0.88, 1], [1, 0]];

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
    if (this.shown) this.draw(g, this.shown, (time - this.shown.t0) / this.times.seconds, { outline: OUTLINE });
    for (const t of this.twinkles) {
      const k = (time - t.t0) / GLINT.burst.seconds;
      if (k >= 0) this.draw(g, t, k, { outline: OUTLINE });
    }
  }

  // A dot, then a gold cross that grows and shrinks, then a dot again. k goes from 0 to 1. With reduced motion, the cross holds still.
  draw(g, { x, y }, k, options) {
    const arm = this.reducedMotion ? 3 : ARMS.find(([until]) => k < until)?.[1] ?? 0;
    // A grown glint has a bigger white heart, so it shows on the gold presents and the lamp light.
    drawTwinkle(g, x, y, arm, { gold: PALETTE.gold, core: arm >= 2 ? 1 : 0, ...options });
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
