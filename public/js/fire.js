// The fire, a hidden extra. A tap on the fire makes it crackle and pop, and it throws a burst of sparks and embers.
// The sparks fly up out of the fire, cool from white to yellow to orange to red, and go out in the chimney.
// The embers rise more slowly, drift a little, and blink out. The fire flares brighter for a moment.
// Each tap gives a new burst. MAX caps the sparks and embers, so many fast taps never slow the page.
// The tap area is "fire" in HOTSPOTS (room.js). The scene draws this module as a layer (Scene.addLayer),
// in front of the night tint of the lamp egg, so the sparks glow when the lamp is off.

import { ROOM_W, FIRE, rgb } from "./room.js";

// The dark inside of the fireplace in room.png, inside the frame. Edges are included.
const HEARTH = { x0: 115, y0: 48, x1: 141, y1: 65 };
// The sparks start in the flames.
const SOURCE = { x0: 121, x1: 135, y0: 50, y1: 58 };
// A spark goes out when it leaves this box: the fireplace and the chimney above it.
export const SPARK_BOX = { x0: 109, x1: 146, y0: 24, y1: 66 };
// The most sparks and embers at one time. A burst over the cap pushes out the oldest ones.
export const MAX = 140;

// What one burst throws. Speeds are in room pixels per second. drag slows a spark each second,
// and lift pushes an ember up. With reduced motion, a few sparks glow above the flames and fade where they are.
const BURST = {
  sparks: 16, embers: 8, still: 6,
  spark: { speed: [42, 80], spread: 16, drag: 2.4, life: [0.5, 0.9], big: 5 },
  ember: { speed: [12, 26], spread: 7, drag: 1.2, lift: 9, sway: 6, life: [0.8, 1.3] },
};
// The flare: the fire burns brighter for this many seconds after a tap, then settles.
const FLARE = { seconds: 0.9, wash: "#ff9a40", washAlpha: 0.3, glowAlpha: 0.14 };

// The colors from white-hot to cold. A spark starts at the top and moves down the list as it cools.
// The yellows show on the dark inside of the fireplace. The oranges and reds show on the cream stone round it.
// The last color is still a warm red, not brown, so a dying spark never looks like dirt on the stone.
const HEAT = ["#f8f5f1", "#fef09f", "#fbe55d", "#f5b445", "#ec8a2c", "#d9621e", "#b8441a"];
// An ember starts orange. A big spark is big while it is this hot or hotter.
const EMBER_HEAT = 3;
const BIG_HEAT = 2;
// The hottest color for a spark over the cream stone round the fireplace.
const STONE_HEAT = 4;
// The flame colors in room.png, from dull to bright, and the brighter colors the flare moves them to.
const FLAME = [0xaa5317, 0xe1a468, 0xf5cf6f, 0xfbe55d, 0xfef09f, 0xf8f5f1];
const FLARE_RAMP = ["#aa5317", "#d9621e", "#ec8a2c", "#f5cf6f", "#fbe55d", "#fef09f", "#f8f5f1", "#ffffff"];
// Where each flame color starts on FLARE_RAMP.
const FLAME_STEP = { 0xaa5317: 0, 0xe1a468: 2, 0xf5cf6f: 3, 0xfbe55d: 4, 0xfef09f: 5, 0xf8f5f1: 6 };

const rand = (a, b) => a + Math.random() * (b - a);
const inHearth = (x, y) => x >= HEARTH.x0 && x <= HEARTH.x1 && y >= HEARTH.y0 && y <= HEARTH.y1;

export class Fire {
  constructor({ scene, sound, reducedMotion }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.parts = [];
    this.flareAt = -Infinity;
    this.bursts = 0;
    // The flame pixels, and the dark pixels right round them that the flare sets alight.
    this.flame = [];
    this.rim = [];
  }

  // Finds the flame pixels in the fireplace, once the room loads.
  prepare(pixels) {
    const color = (x, y) => rgb(pixels, (y * ROOM_W + x) * 4);
    const isFlame = (x, y) => FLAME.includes(color(x, y));
    for (let y = HEARTH.y0; y <= HEARTH.y1; y++) {
      for (let x = HEARTH.x0; x <= HEARTH.x1; x++) {
        if (isFlame(x, y)) {
          this.flame.push({ x, y, step: FLAME_STEP[color(x, y)] });
          continue;
        }
        // A dark pixel just beside a flame, or one or two pixels above it, is where the flame grows in the flare.
        const near = [[-1, 0], [1, 0], [0, 1], [0, 2]].some(([dx, dy]) => inHearth(x + dx, y + dy) && isFlame(x + dx, y + dy));
        if (near) this.rim.push({ x, y, top: !isFlame(x, y + 1) });
      }
    }
  }

  // A burst of sparks and embers, a flare, and a crackle. Every tap gives one.
  tap() {
    const time = this.scene.time;
    this.flareAt = time;
    this.bursts++;
    const still = this.reducedMotion;
    const add = (p) => this.parts.push({ ...p, born: time, seed: Math.random() });
    if (still) {
      for (let i = 0; i < BURST.still; i++) {
        const x = Math.round(rand(SOURCE.x0, SOURCE.x1));
        add({ kind: "spark", x, y: Math.round(rand(HEARTH.y0, SOURCE.y0)), vx: 0, vy: 0, life: rand(0.6, 1), heat: 0 });
      }
    } else {
      const { spark, ember } = BURST;
      for (let i = 0; i < BURST.sparks; i++) {
        add({
          kind: "spark", x: rand(SOURCE.x0, SOURCE.x1), y: rand(SOURCE.y0, SOURCE.y1),
          vx: rand(-spark.spread, spark.spread), vy: -rand(...spark.speed), life: rand(...spark.life), heat: 0,
          big: i < spark.big,
        });
      }
      for (let i = 0; i < BURST.embers; i++) {
        add({
          kind: "ember", x: rand(SOURCE.x0 + 2, SOURCE.x1 - 2), y: rand(SOURCE.y0 + 2, SOURCE.y1),
          vx: rand(-ember.spread, ember.spread), vy: -rand(...ember.speed), life: rand(...ember.life), heat: EMBER_HEAT,
        });
      }
    }
    if (this.parts.length > MAX) this.parts.splice(0, this.parts.length - MAX);
    this.sound.crackle();
  }

  // How bright the flare is now: 1 right after a tap, then down to 0.
  flare() {
    const age = this.scene.time - this.flareAt;
    return age < 0 || age >= FLARE.seconds ? 0 : (1 - age / FLARE.seconds) ** 1.5;
  }

  // ---- the layer hooks that the scene calls ----
  update(dt) {
    if (!this.parts.length) return;
    const time = this.scene.time;
    const { spark, ember } = BURST;
    for (const p of this.parts) {
      if (p.kind === "spark") {
        const k = Math.exp(-spark.drag * dt);
        p.vx *= k;
        p.vy *= k;
      } else {
        const k = Math.exp(-ember.drag * dt);
        p.vx = p.vx * k + Math.sin((time - p.born) * 5 + p.seed * 6) * ember.sway * dt;
        p.vy = p.vy * k - ember.lift * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const inBox = (p) => {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const edge = p.big ? 1 : 0;
      return x >= SPARK_BOX.x0 && x + edge <= SPARK_BOX.x1 && y >= SPARK_BOX.y0 && y + edge <= SPARK_BOX.y1;
    };
    this.parts = this.parts.filter((p) => time - p.born < p.life && inBox(p));
  }

  drawFront(g) {
    const k = this.flare();
    if (k > 0) this.drawFlare(g, k);
    if (this.parts.length) this.drawSparks(g);
  }

  // The flare: warm light fills the fireplace, every flame pixel burns one or two steps brighter,
  // and the flames lick a pixel or two past their edges. The light on the hearth floor grows too.
  drawFlare(g, k) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = FLARE.washAlpha * k;
    g.fillStyle = FLARE.wash;
    g.fillRect(HEARTH.x0, HEARTH.y0, HEARTH.x1 - HEARTH.x0 + 1, HEARTH.y1 - HEARTH.y0 + 1);
    g.globalAlpha = FLARE.glowAlpha * k;
    g.beginPath();
    g.ellipse(FIRE.x + FIRE.w / 2, 88, 34, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;

    const up = k > 0.55 ? 2 : k > 0.15 ? 1 : 0;
    if (!up) return;
    for (const { x, y, step } of this.flame) {
      g.fillStyle = FLARE_RAMP[Math.min(FLARE_RAMP.length - 1, step + up)];
      g.fillRect(x, y, 1, 1);
    }
    // The flames lick out and flicker. With reduced motion, the rim stays still and goes out with the flare.
    const frame = Math.floor(this.scene.time * 14);
    for (const { x, y, top } of this.rim) {
      const lit = this.reducedMotion ? up === 2 : hash(x, y, frame) < (top ? 0.55 : 0.8) * k + 0.2;
      if (!lit) continue;
      g.fillStyle = up === 2 && !top ? FLARE_RAMP[2] : FLARE_RAMP[1];
      g.fillRect(x, y, 1, 1);
    }
  }

  // Each spark is one pixel. A fast spark leaves a one-pixel tail behind it, a step cooler.
  // A big spark is 2 by 2 pixels while it is white-hot or yellow. Out of the fireplace, over the cream stone,
  // a spark is orange or red at most, so it shows on the light stone.
  drawSparks(g) {
    const time = this.scene.time;
    const last = HEAT.length - 1;
    for (const p of this.parts) {
      const t = (time - p.born) / p.life;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      let step = Math.min(last, p.heat + Math.floor(t * (HEAT.length - p.heat)));
      if (!inHearth(x, y)) step = Math.max(step, STONE_HEAT);
      // An ember blinks as it goes out.
      if (p.kind === "ember" && t > 0.7 && !this.reducedMotion && hash(Math.round(p.seed * 999), 0, Math.floor(time * 12)) < 0.4) continue;
      const speed = Math.hypot(p.vx, p.vy);
      if (p.kind === "spark" && speed > 30) {
        const tx = Math.round(p.x - p.vx / speed);
        const ty = Math.round(p.y - p.vy / speed);
        if (tx !== x || ty !== y) {
          g.fillStyle = HEAT[Math.min(last, Math.max(step + 1, inHearth(tx, ty) ? 0 : STONE_HEAT))];
          g.fillRect(tx, ty, 1, 1);
        }
      }
      g.fillStyle = HEAT[step];
      const size = p.big && step <= BIG_HEAT ? 2 : 1;
      g.fillRect(x, y, size, size);
    }
  }

  // The state of the fire, for the tests. box is the smallest box round every spark and ember now, in room pixels.
  state() {
    const parts = this.parts;
    const xs = parts.flatMap((p) => [Math.round(p.x), Math.round(p.x) + (p.big ? 1 : 0)]);
    const ys = parts.flatMap((p) => [Math.round(p.y), Math.round(p.y) + (p.big ? 1 : 0)]);
    return {
      bursts: this.bursts,
      sparks: parts.filter((p) => p.kind === "spark").length,
      embers: parts.filter((p) => p.kind === "ember").length,
      flare: this.flare(),
      moving: parts.some((p) => p.vx || p.vy),
      box: parts.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : null,
      max: MAX,
      bounds: { ...SPARK_BOX },
    };
  }
}

// A number from 0 to 1 that looks random but is the same for the same x, y, and frame.
function hash(x, y, frame) {
  let n = (x * 374761393 + y * 668265263 + frame * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
