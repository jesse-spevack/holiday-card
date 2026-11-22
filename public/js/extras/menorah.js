// The menorah, a hidden extra. A tap on the menorah puts the flames out. Then tonight's candles light one by one,
// the shamash first, with a chime that goes up each time. After the last candle, a question about miracles shows under the sill.
// During Hanukkah, the menorah burns one candle for each night (hanukkah.js). Outside Hanukkah, every candle burns.
// The scene finds and draws the candle flames (scene.flames). This layer says which flames burn (flame(i)).

import { ROOM_W, MENORAH_TAP, rgb } from "../room.js";
import { showWords, hideWords } from "../words.js";
import { hanukkahNight } from "./hanukkah.js";

// The question sits under the sill, below the menorah.
const MIRACLES = { text: "What miracles are you grateful for?", x: 201, y: 61, ms: 3500 };
const LIGHTING = { pause: 0.7, step: 0.45, grow: 0.18 };

class Menorah {
  constructor({ scene, sound, reducedMotion }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.lighting = null;
    this.wisps = [];
    // The clock for the nights of Hanukkah. The test API sets it.
    this.now = () => new Date();
    // The indices in scene.flames of the candles that burn when the menorah does not light.
    this.burning = new Set();
  }

  // Called once the room image loads, with its RGBA pixels. scene.flames is ready by then.
  prepare(pixels) {
    // An unlit candle shows the window glass where its flame and its warm glow were.
    // The glow is each pixel round the flame that is not glass: one pixel to each side, and two pixels up.
    // The glass color comes from four pixels above the flame. A glow pixel between two candles goes dark only when both are out.
    const at = (x, y) => (y * ROOM_W + x) * 4;
    const glow = new Map();
    this.scene.flames.forEach(({ x, y }, i) => {
      const glass = rgb(pixels, at(x, y - 4));
      for (let dy = -2; dy <= 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (rgb(pixels, at(x + dx, y + dy)) === glass) continue;
          const key = `${x + dx},${y + dy}`;
          if (!glow.has(key)) glow.set(key, { x: x + dx, y: y + dy, color: `#${glass.toString(16).padStart(6, "0")}`, of: [] });
          glow.get(key).of.push(i);
        }
      }
    });
    this.glow = [...glow.values()];
    // The shamash is the highest flame. The other candles go from left to right.
    const flames = this.scene.flames;
    this.shamash = flames.findIndex((f) => f.y === Math.min(...flames.map((q) => q.y)));
    this.candles = flames.map((f, i) => i).filter((i) => i !== this.shamash).sort((a, b) => flames[a].x - flames[b].x);
    this.burning = new Set(this.tonight());
  }

  // The candles that burn now, in the order they light: the raised shamash first, then left to right.
  // During Hanukkah, one candle burns for each night, from the right end, so the newest candle is the leftmost one.
  // Outside Hanukkah, every candle burns.
  tonight() {
    const night = hanukkahNight(this.now());
    return [this.shamash, ...(night ? this.candles.slice(-night) : this.candles)];
  }

  // The flames go out, then tonight's candles light one by one, in the order of tonight().
  relight() {
    if (this.lighting) return;
    const flames = this.scene.flames;
    const order = this.tonight();
    const rank = new Map(order.map((i, k) => [i, k]));
    this.lighting = { t0: this.scene.time, rank, played: 0, total: order.length };
    this.wisps = [...this.burning].map((i) => ({ x: flames[i].x, y: flames[i].y - 1, t0: this.scene.time }));
    hideWords(this.scene, MIRACLES);
    this.sound.snuff();
  }

  // The layer hook for the scene's candle flames: "lit", "new" (just lit), or "out".
  flame(i) {
    const l = this.lighting;
    if (!l) return this.burning.has(i) ? "lit" : "out";
    if (!l.rank.has(i)) return "out";
    const age = this.scene.time - (l.t0 + LIGHTING.pause + l.rank.get(i) * LIGHTING.step);
    return age < 0 ? "out" : age < LIGHTING.grow ? "new" : "lit";
  }

  // How many candles burn, for the tests.
  get lit() {
    return this.lighting ? this.lighting.played : this.burning.size;
  }

  update() {
    const time = this.scene.time;
    const l = this.lighting;
    if (l) {
      const due = Math.min(l.total, Math.floor((time - l.t0 - LIGHTING.pause) / LIGHTING.step) + 1);
      while (l.played < due) this.sound.chime(l.played++);
      if (time > l.t0 + LIGHTING.pause + (l.total - 1) * LIGHTING.step + LIGHTING.grow) {
        this.lighting = null;
        this.burning = new Set(l.rank.keys());
        showWords(this.scene, MIRACLES);
      }
    }
    // At 4 pm during Hanukkah, the candle for the new night lights. Each night burns a different number of candles.
    if (!l && this.shamash !== undefined) {
      const order = this.tonight();
      if (order.length !== this.burning.size) this.burning = new Set(order);
    }
  }

  // Over the room image, under the snow: the glass shows where a candle is out, and smoke rises from a flame that just went out.
  drawBack(g) {
    if (!this.glow) return;
    if (this.lighting || this.wisps.length || this.burning.size < this.scene.flames.length) this.drawUnlit(g);
  }

  drawUnlit(g) {
    for (const { x, y, color, of } of this.glow) {
      if (!of.every((i) => this.flame(i) === "out")) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
    const now = this.scene.time;
    this.wisps = this.wisps.filter((w) => now - w.t0 < 1);
    g.fillStyle = "#c9ccd6";
    for (const w of this.wisps) {
      const age = now - w.t0;
      g.globalAlpha = 0.6 * (1 - age);
      g.fillRect(w.x + (this.reducedMotion ? 0 : Math.round(Math.sin(age * 9) * 0.6)), Math.round(w.y - (this.reducedMotion ? 1 : age * 5)), 1, 1);
    }
    g.globalAlpha = 1;
  }
}

export default {
  name: "menorah",
  spots: [{ id: "menorah", ...MENORAH_TAP }],
  hints: [
    { host: "jessica", text: "The candles by the window have a question." },
    { host: "jesse", text: "Those candles love to be lit again." },
  ],
  setup(ctx) {
    const menorah = new Menorah(ctx);
    const { scene } = ctx;
    return {
      layer: menorah,
      tap: () => menorah.relight(),
      test: () => ({
        eggs: () => ({
          lighting: !!menorah.lighting, menorahLit: menorah.lit, flames: scene.flames.length,
          // Each candle flame from left to right: { x, y, shamash, state }. state is "lit", "new" (just lit), or "out".
          candles: scene.flames.map((f, i) => ({ x: f.x, y: f.y, shamash: i === menorah.shamash, state: scene.flameState(i) })).sort((a, b) => a.x - b.x),
        }),
        // Sets the page clock for the nights of Hanukkah to a local time, for example "2026-12-07T18:00". null goes back to the real clock.
        setNow: (local) => { menorah.now = local ? () => new Date(local) : () => new Date(); },
      }),
    };
  },
};
