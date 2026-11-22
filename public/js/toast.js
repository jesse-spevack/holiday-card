// The toast, a hidden extra. A tap on the wine on the dining table makes the whole party raise a glass.
// Each person (not the pets) holds a small red wine glass in one hand, lifts it, and hops once.
// The glasses clink, one of the two big hosts says a toast, and after about 2 seconds everyone lowers the glass.
// The tap area is "wine" in HOTSPOTS (room.js). The scene draws this module as a layer (Scene.addLayer).

import { eachPixel } from "./pixels.js";
import { isPet } from "./pets.js";

// The lines for the toast. One of Jess and Jesse says one, never the same line twice in a row.
export const TOAST_LINES = [
  "To 2027!",
  "To all of you!",
  "To friends near and far!",
  "Cheers to another year together!",
  "To old friends and new ones!",
  "To the people we love!",
];
// The hosts who can give the toast, by sprite id.
const SPEAKERS = ["jessica", "jesse"];

// A red wine glass from the side, in the colors of the glasses on the table (art/scripts/table_wine.py).
// The room glasses stand on the table and need no outline. This glass shows on the floor, the rug, and clothes,
// so a dark outline goes all round it. "." stays clear.
const GLASS = [
  "oxixo",
  "oWWRo",
  "oRRro",
  ".oro.",
  "..o..",
  "..o..",
  ".ooo.",
];
const GLASS_COLORS = {
  o: "#090100", // outline
  r: "#4a101c", // wine, dark
  R: "#7a1a28", // wine
  W: "#a8343a", // wine, lit
  x: "#b8c0c6", // clear glass
  i: "#f8f5f1", // glint
};
// The stem column and the row that the hand holds, in GLASS.
const STEM = { x: 2, y: 4 };

// The times in the toast, in seconds from the tap.
//   up: the hand and the glass rise one pixel at a time, `lift` pixels in all.
//   hop: each person hops once as the glasses clink, each at a slightly different time.
//   down: the glass goes back down. end: the glasses go away. rest: after the end, a tap waits this long.
const T = { up: 0.12, lift: 1, hop: 0.15, hopLength: 0.28, hopHeight: 2, hopSpread: 0.25, down: 2.45, end: 2.75, rest: 0.6 };

const rand = (a, b) => a + Math.random() * (b - a);

export class Toast {
  constructor({ scene, sound, reducedMotion }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.toast = null;
    this.readyAt = 0;
    this.lastLine = null;
    // The hand of each sprite image, found once for each image.
    this.hands = new WeakMap();
  }

  // The people in the room now: every sprite with an image, except the pets and a family that still waits outside.
  guests() {
    const waiting = !this.scene.families.get("pending")?.entered;
    return this.scene.sprites.filter((s) => s.img && this.scene.time >= s.popAt && !isPet(s) && !(waiting && s.familyId === "pending"));
  }

  // Starts a toast. A tap during a toast, or just after it, does nothing. Returns true when a toast starts.
  tap() {
    const time = this.scene.time;
    if (this.toast || time < this.readyAt) return false;
    const people = this.guests();
    const hosts = people.filter((s) => SPEAKERS.includes(s.id));
    const speaker = hosts[Math.floor(Math.random() * hosts.length)] || null;
    const lines = TOAST_LINES.filter((l) => l !== this.lastLine);
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.lastLine = line;
    this.toast = {
      t0: time,
      speaker,
      line,
      people: people.map((s) => ({ sprite: s, hop: rand(0, T.hopSpread) })),
      holds: new Set(people),
    };
    // Everyone stops where they stand for the toast, and stays a moment after it.
    for (const s of people) {
      Object.assign(s, { path: null, bob: 0, rise: 0 });
      s.nextMove = Math.max(s.nextMove ?? 0, time + T.end + rand(0.5, 2));
    }
    if (speaker) this.scene.say(speaker, line, 3);
    this.sound.cheers(people.length);
    return true;
  }

  // How high the glass is above the hand at `age` seconds into the toast.
  liftAt(age) {
    if (this.reducedMotion) return T.lift;
    if (age < T.down) return Math.min(T.lift, Math.floor(age / T.up));
    return Math.max(0, T.lift - 1 - Math.floor((age - T.down) / T.up));
  }

  // How high a person hops at `age` seconds into the toast. With reduced motion, nobody hops.
  hopAt(age, delay) {
    if (this.reducedMotion) return 0;
    const t = age - T.hop - delay;
    if (t < 0 || t >= T.hopLength) return 0;
    return Math.round(Math.sin((t / T.hopLength) * Math.PI) * T.hopHeight);
  }

  // ---- the layer hooks that the scene calls ----
  update() {
    const t = this.toast;
    if (!t) return;
    const age = this.scene.time - t.t0;
    if (age >= T.end) {
      for (const p of t.people) p.sprite.rise = 0;
      this.toast = null;
      this.readyAt = this.scene.time + T.rest;
      return;
    }
    for (const p of t.people) p.sprite.rise = this.hopAt(age, p.hop);
  }

  // Draws the glass in the hand of sprite `s`, right after the scene draws the sprite with its top-left corner at (x, y).
  drawOn(g, s, x, y) {
    const t = this.toast;
    if (!t || !t.holds.has(s)) return;
    const glass = this.glassFor(s, x, y);
    if (!glass) return;
    const put = (px, py, color) => {
      g.fillStyle = color;
      g.fillRect(px, py, 1, 1);
    };
    eachPixel(GLASS, GLASS_COLORS, (i, j, color) => put(glass.x + i, glass.y + j, color), { flipX: s.flip });
    // The hand closes round the stem: a skin pixel with an outline pixel outside it.
    // With the glass up, the wrist (skin) and the arm's outline reach down to the hand as drawn.
    const { hand, lift, dir } = glass;
    for (let k = 0; k <= lift; k++) {
      put(hand.x, hand.y - k, hand.skin);
      put(hand.x + dir, hand.y - k, GLASS_COLORS.o);
    }
  }

  // Where the glass and the hand that holds it are now, in room pixels. Null when the sprite has no hand to hold it.
  glassFor(s, x, y) {
    const hand = this.handOf(s.img);
    if (!hand) return null;
    const age = this.scene.time - this.toast.t0;
    const lift = this.liftAt(age);
    const w = s.img.width;
    // The glass sits one pixel outside the hand, on the hand's side of the sprite. A flipped sprite holds it on the other side.
    const dir = s.flip ? -1 : 1;
    const handX = x + (s.flip ? w - 1 - hand.x : hand.x) + dir;
    const handY = y + hand.y;
    const stemX = s.flip ? GLASS[0].length - 1 - STEM.x : STEM.x;
    return {
      x: handX - stemX,
      y: handY - lift - STEM.y,
      lift,
      dir,
      hand: { x: handX, y: handY, skin: hand.skin },
    };
  }

  // The hand on the right side of a sprite image: the lowest point of the arm that reaches out the farthest,
  // in the band from the waist to the hips. The outline does not count. Also the color of the hand.
  handOf(img) {
    if (this.hands.has(img)) return this.hands.get(img);
    let hand = null;
    try {
      hand = findHand(imagePixels(img), img.width, img.height);
    } catch {}
    this.hands.set(img, hand);
    return hand;
  }

  // The state of the toast, for the tests.
  state() {
    const t = this.toast;
    const time = this.scene.time;
    const age = t ? time - t.t0 : 0;
    return {
      on: !!t,
      age,
      speaker: t?.speaker?.name ?? null,
      line: t?.line ?? null,
      lift: t ? this.liftAt(age) : 0,
      readyIn: t ? T.end + T.rest - age : Math.max(0, this.readyAt - time),
      people: t ? t.people.map(({ sprite: s }) => {
        const glass = this.glassFor(s, Math.round(s.x - s.img.width / 2), Math.round(s.y - s.img.height - s.bob - s.rise));
        return {
          familyId: s.familyId, index: s.index, name: s.name ?? null, flip: s.flip, hop: s.rise,
          glass: glass && { x: glass.x, y: glass.y, w: GLASS[0].length, h: GLASS.length, stem: glass.hand.x, lift: glass.lift },
        };
      }) : [],
    };
  }
}

function imagePixels(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height).data;
}

// The hand in RGBA pixels of a w x h sprite. See Toast.handOf.
export function findHand(data, w, h) {
  const at = (x, y) => (y * w + x) * 4;
  const dark = (i) => 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] <= 70;
  const right = new Map();
  for (let y = Math.round(h * 0.58); y < Math.round(h * 0.82); y++) {
    for (let x = w - 1; x >= 0; x--) {
      const i = at(x, y);
      if (data[i + 3] > 128 && !dark(i)) {
        right.set(y, x);
        break;
      }
    }
  }
  if (!right.size) return null;
  const far = Math.max(...right.values());
  const y = Math.max(...[...right].filter(([, x]) => x >= far - 1).map(([row]) => row));
  const x = right.get(y);
  const i = at(x, y);
  return { x, y, skin: `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})` };
}
