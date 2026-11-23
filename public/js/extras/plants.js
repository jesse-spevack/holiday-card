// The plants, a hidden extra. A tap on a potted plant makes it bloom: its flowers open one by one, with a sparkle and a soft chime.
// Each new plant chimes one note higher. The flowers stay for the rest of the visit.
// When every plant blooms, petals drift down over the whole room, every plant sparkles, and a soft chord plays.
// The plants, their tap areas, and the flower spots are PLANTS in room.js. The scene draws this module as a layer.

import { PLANTS, ROOM_W, ROOM_H } from "../room.js";
import { eachPixel, drawTwinkle } from "../pixels.js";
import { PALETTE } from "../palette.js";
import { NIGHT_TINT } from "./lamp.js";

// The flowers, as text grids. o is the outline, P the petal, S the petal in shade, and c the center. "." stays clear.
// The center pixel of each grid is a c, so the tests find each flower by its center color.
const SHAPES = {
  // a round flower with a dot in the middle
  round: [".ooo.", "oPPPo", "oPcPo", "oSPSo", ".ooo."],
  // a small flower with four petals
  small: ["..o..", ".oPo.", "oPcPo", ".oSo.", "..o.."],
  // a big flower with five pointed petals
  star: ["..o.o..", ".oPoPo.", "oPPPPPo", ".oPcPo.", "oSPPPSo", ".oSoSo.", "..o.o.."],
  // a peace lily: a white hood round a yellow spike
  lily: ["..o..", ".oPo.", "oPPPo", "oPcSo", "oPcSo", ".oSo.", "..o.."],
};
// An opening flower shows a bud first, then the small flower, then the full flower.
const BUD = [".o.", "oPo", ".o."];
const OUTLINE = "#090100";

// The flower of each plant: its colors and its big and small shapes. No poinsettias: the room has no Christmas imagery (docs/scope.md).
const FLOWERS = {
  "plant-shelf-left": { name: "paperwhite", P: "#f8f5f1", S: "#d4c2b0", c: "#fbe55d", big: "round", small: "small" },
  "plant-shelf-right": { name: "cyclamen", P: "#f4a6b8", S: "#d0657f", c: "#fef09f", big: "star", small: "small" },
  "plant-wall": { name: "blue star", P: "#8fb4e3", S: "#416da5", c: "#f8f5f1", big: "round", small: "small" },
  "plant-armchair": { name: "amaryllis", P: "#e0504a", S: "#a02c34", c: "#fbe55d", big: "star", small: "small" },
  "plant-floor-big": { name: "peace lily", P: "#f8f5f1", S: "#d4c2b0", c: "#fbe55d", big: "lily", small: "lily" },
  "plant-floor-small": { name: "violet", P: "#c9a7e6", S: "#8e6cbf", c: "#fef09f", big: "round", small: "small" },
};
const IDS = Object.keys(PLANTS);

// The times, in seconds.
//   open: each flower on a plant opens this long after the one before it. bud and half: how long each early stage shows.
//   twinkle: how long a sparkle lasts. moment: after the last plant opens, the room waits this long, then blooms.
//   still: with reduced motion, the petals rest on the floor this long.
const T = { open: 0.14, bud: 0.1, half: 0.1, twinkle: 0.55, moment: 0.7, still: 3 };
// The falling petals: how many, their speed in room pixels a second, how far they sway, and how far above the room they start.
const PETALS = { count: 90, speed: [40, 58], sway: [2, 5], rise: 50 };

// A petal turns as it falls: it shows each of these in turn. P is the petal and S its shade.
const PETAL_TURN = [["PP", "S."], [".P", "PS"], ["P", "S"], [".P", "PS"]];
// What Audrey says when the whole room blooms. She is the host who hints at the plants.
export const BLOOM_LINE = "Everything is blooming!";

const rand = (a, b) => a + Math.random() * (b - a);

export class Plants {
  // dark() is true while the lamp is off. The falling petals then take the dark blue of the room.
  constructor({ scene, sound, reducedMotion, dark = () => false }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.dark = dark;
    // When each plant bloomed, in scene seconds, in the order the guest found them.
    this.bloomed = new Map();
    this.twinkles = [];
    this.moment = null;
    this.momentDone = false;
  }

  // A tap on a plant. The first tap blooms it. Later taps sparkle and chime again.
  tap(id) {
    if (!PLANTS[id]) return;
    const time = this.scene.time;
    if (!this.bloomed.has(id)) this.bloomed.set(id, time);
    this.sparkle(id, time);
    this.sound.chime([...this.bloomed.keys()].indexOf(id));
  }

  // 3 to 5 twinkles round the flowers of a plant. Each one starts a little after the one before it.
  sparkle(id, t0) {
    const { blooms } = PLANTS[id];
    const count = Math.min(5, blooms.length + 2);
    for (let k = 0; k < count; k++) {
      const [bx, by] = blooms[k % blooms.length];
      this.twinkles.push({ x: Math.round(bx + rand(-5, 5)), y: Math.round(by + rand(-5, 3)), t0: t0 + k * 0.08 });
    }
  }

  // How far a flower is open at `age` seconds after its plant's tap: null, "bud", "half", or "full".
  stage(age, index) {
    if (this.reducedMotion) return "full";
    const t = age - index * T.open;
    if (t < 0) return null;
    if (t < T.bud) return "bud";
    if (t < T.bud + T.half) return "half";
    return "full";
  }

  // The room in bloom: petals in the colors of all the flowers, a sparkle on every plant, a chord, and Audrey's line.
  // The petals start above the room and fall with a sway. With reduced motion, they rest on the floor and do not move.
  startMoment() {
    const time = this.scene.time;
    const flowers = IDS.map((id) => FLOWERS[id]);
    const petals = Array.from({ length: PETALS.count }, (_, k) => {
      const flower = flowers[k % flowers.length];
      if (this.reducedMotion) return { x: rand(8, ROOM_W - 8), y: rand(96, ROOM_H - 8), flower, speed: 0, sway: 0, phase: rand(0, 6), spin: 0 };
      return {
        x: rand(0, ROOM_W),
        y: -rand(2, PETALS.rise),
        flower,
        speed: rand(...PETALS.speed),
        sway: rand(...PETALS.sway),
        phase: rand(0, Math.PI * 2),
        spin: rand(2, 4),
      };
    });
    this.moment = { t0: time, petals };
    this.momentDone = true;
    for (const id of IDS) this.sparkle(id, time + rand(0, 0.3));
    this.sound.bouquet();
    const audrey = this.scene.sprites.find((s) => s.id === "daughter");
    if (audrey) this.scene.say(audrey, BLOOM_LINE, 3);
  }

  // ---- the layer hooks that the scene calls ----
  update(dt) {
    const time = this.scene.time;
    this.twinkles = this.twinkles.filter((t) => time - t.t0 < T.twinkle);
    if (!this.momentDone && this.bloomed.size === IDS.length) {
      const last = Math.max(...this.bloomed.values());
      if (time >= last + T.moment) this.startMoment();
    }
    const m = this.moment;
    if (!m) return;
    if (this.reducedMotion) {
      if (time - m.t0 > T.still) this.moment = null;
      return;
    }
    for (const p of m.petals) p.y += p.speed * dt;
    if (m.petals.every((p) => p.y > ROOM_H + 1)) this.moment = null;
  }

  // The flowers sit on the plants, over the room image and under the people.
  drawBack(g) {
    const time = this.scene.time;
    for (const [id, t0] of this.bloomed) {
      const flower = FLOWERS[id];
      PLANTS[id].blooms.forEach(([x, y, size], i) => {
        const stage = this.stage(time - t0, i);
        if (!stage) return;
        const rows = stage === "bud" ? BUD : stage === "half" ? SHAPES.small : SHAPES[flower[size]];
        drawGrid(g, rows, x, y, { o: OUTLINE, P: flower.P, S: flower.S, c: flower.c });
      });
    }
  }

  // The sparkles and the falling petals, over everything.
  drawFront(g) {
    const time = this.scene.time;
    const m = this.moment;
    if (m) {
      const dark = this.dark();
      const fade = this.reducedMotion ? Math.min(1, (T.still - (time - m.t0)) / 0.5) : 1;
      g.globalAlpha = Math.max(0, fade);
      for (const p of m.petals) {
        const { x, y, turn } = this.petalAt(p, time - m.t0);
        if (y < -2 || y > ROOM_H) continue;
        const { P, S } = p.flower;
        const colors = dark ? { P: shade(P, NIGHT_TINT), S: shade(S, NIGHT_TINT) } : { P, S };
        eachPixel(turn, colors, (i, j, color) => {
          g.fillStyle = color;
          g.fillRect(x + i, y + j, 1, 1);
        });
      }
      g.globalAlpha = 1;
    }
    for (const t of this.twinkles) {
      const age = time - t.t0;
      if (age < 0) continue;
      // A dot, then a gold cross with a white heart, then a dot again.
      const k = age / T.twinkle;
      const big = this.reducedMotion || (k > 0.25 && k < 0.7);
      drawTwinkle(g, t.x, t.y, big ? 1 : 0, { gold: PALETTE.gold });
    }
  }

  // Where a petal is at `age` seconds into the moment, in room pixels, and how it turns.
  petalAt(p, age) {
    const turn = PETAL_TURN[Math.floor(this.reducedMotion ? p.phase : age * p.spin + p.phase) % PETAL_TURN.length];
    return { x: Math.round(p.x + Math.sin(age * 2 + p.phase) * p.sway), y: Math.round(p.y), turn };
  }

  // The state of the plants, for the tests.
  // flowers: each flower that shows, with its center in room pixels and the color there.
  state() {
    const time = this.scene.time;
    const m = this.moment;
    return {
      bloomed: [...this.bloomed.keys()],
      flowers: [...this.bloomed].flatMap(([id, t0]) => PLANTS[id].blooms.map(([x, y], i) => ({
        plant: id, x, y, stage: this.stage(time - t0, i), center: FLOWERS[id].c,
      }))),
      twinkles: this.twinkles.filter((t) => time >= t.t0).length,
      // petals: the petals in the room now. Each one is the room pixel of its first petal pixel, and the petal color in full light.
      moment: m ? {
        age: time - m.t0,
        petals: m.petals.map((p) => {
          const { x, y, turn } = this.petalAt(p, time - m.t0);
          return { x: x + turn[0].indexOf("P"), y, color: p.flower.P };
        }).filter((p) => p.x >= 0 && p.x < ROOM_W && p.y >= 0 && p.y < ROOM_H),
      } : null,
      momentDone: this.momentDone,
    };
  }
}

// Draws a text grid with its center pixel at (cx, cy).
function drawGrid(g, rows, cx, cy, colors) {
  const x0 = cx - Math.floor(rows[0].length / 2);
  const y0 = cy - Math.floor(rows.length / 2);
  eachPixel(rows, colors, (i, j, color) => {
    g.fillStyle = color;
    g.fillRect(x0 + i, y0 + j, 1, 1);
  });
}

// A color multiplied by the tint, the way the room darkens with the lamp off.
const shades = new Map();
function shade(hex, [r, g, b]) {
  const key = `${hex}${r},${g},${b}`;
  if (!shades.has(key)) {
    const n = parseInt(hex.slice(1), 16);
    const m = (v, t) => Math.round((v * t) / 255);
    shades.set(key, `rgb(${m(n >> 16, r)}, ${m((n >> 8) & 255, g)}, ${m(n & 255, b)})`);
  }
  return shades.get(key);
}

export default {
  name: "plants",
  spots: Object.entries(PLANTS).map(([id, { x, y, w, h }]) => ({ id, x, y, w, h })),
  hints: [{ host: "daughter", text: "I bet the plants would love some attention." }],
  setup(ctx) {
    // While the lamp is off, the falling petals take the dark blue of the room.
    const plants = new Plants({ ...ctx, dark: () => !!ctx.extra("lamp")?.dark });
    return {
      layer: plants,
      tap: (id) => plants.tap(id),
      test: () => ({
        // The plants: { bloomed: [ids], flowers: [{ plant, x, y, stage, center }], twinkles, moment: { age, petals } or null, momentDone }.
        // x, y is the center of a flower in room pixels, and center is the color there once the flower is "full".
        plants: () => plants.state(),
        constants: () => ({ PLANTS }),
      }),
    };
  },
};
