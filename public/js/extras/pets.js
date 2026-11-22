// Hidden pet reactions. A tap on a dog or a cat makes it react with a small move and a sound.
// Nothing on the page points this out. A reaction is the field `react` on a sprite: { kind, at }.
// This extra is a scene layer: it draws a sprite with a reaction through drawPet (drawSprite), and its heart or flame through drawPetMark.
// It is the last layer in extras/index.js, so the marks show over every other layer.

import { eachPixel } from "../pixels.js";

// The silly pets in looks.json each get their own reaction. Every other pet reacts as its type.
const SILLY = { "dog-11": "robot", "dog-12": "dragon", "cat-07": "alien", "cat-08": "penguin" };
const SOUND = { dog: "woof", cat: "mrrp", robot: "beep", dragon: "puff", alien: "warble", penguin: "waddle" };
// The seconds that each reaction lasts, with its heart or flame.
const LENGTH = { dog: 0.9, cat: 1.3, robot: 0.6, dragon: 1.0, alien: 1.3, penguin: 1.1 };
// With reduced motion, a pet does not move. Its heart or flame shows, still, for this long.
const STILL = 1.2;
// The dragon's mouth, in its sprite pixels, from the top-left corner.
const MOUTH = { x: 4, y: 8 };

export const isPet = (sprite) => sprite.type === "dog" || sprite.type === "cat";
export const reactionKind = (sprite) => SILLY[sprite.look] || sprite.type;

// Starts a reaction on a pet and plays its sound. Returns the kind, or null for a person.
export function react(sprite, { time, sound }) {
  if (!isPet(sprite)) return null;
  const kind = reactionKind(sprite);
  sprite.react = { kind, at: time };
  sound[SOUND[kind]]?.();
  return kind;
}

const bounce = (t, start, dur, height) => (t >= start && t < start + dur ? Math.round(Math.sin(((t - start) / dur) * Math.PI) * height) : 0);

// How a reaction moves its pet at `t` seconds: dx and dy in pixels (dy is up), tilt in radians,
// and stretch in pixels (the top half of the pet rises, and the middle row fills the gap).
export function petPose(kind, t) {
  const pose = { dx: 0, dy: 0, tilt: 0, stretch: 0 };
  if (kind === "dog") {
    // two happy hops, then a quick wag
    pose.dy = bounce(t, 0, 0.22, 4) + bounce(t, 0.22, 0.18, 2);
    if (t >= 0.4 && t < 0.8) pose.dx = Math.floor(t * 20) % 2 ? 1 : -1;
  } else if (kind === "cat") {
    // a slow stretch up, then a small hop
    pose.stretch = t < 0.6 ? Math.round(Math.sin((t / 0.6) * Math.PI) * 3) : 0;
    pose.dy = bounce(t, 0.6, 0.22, 2);
  } else if (kind === "robot") {
    // stiff steps up and down, one pixel at a time
    if (t < 0.48) pose.dy = [0, 1, 2, 1][Math.floor(t * 16) % 4];
  } else if (kind === "dragon") {
    pose.dy = bounce(t, 0, 0.25, 3);
  } else if (kind === "alien") {
    // a float up and back down
    pose.dy = Math.round(Math.sin((Math.min(t, 1) / 1) * Math.PI) * 5);
  } else if (kind === "penguin") {
    // a waddle: rock side to side, with a small step on each rock
    if (t < 1) {
      const rock = Math.sin(t * Math.PI * 6);
      pose.tilt = rock * 0.14;
      pose.dx = Math.round(rock);
      pose.dy = Math.abs(rock) > 0.7 ? 1 : 0;
    }
  }
  return pose;
}

// The time into the reaction, or -1 when it ended. An ended reaction clears itself.
function age(sprite, time, still) {
  const r = sprite.react;
  if (!r) return -1;
  const t = time - r.at;
  if (t <= (still ? Math.max(STILL, LENGTH[r.kind]) : LENGTH[r.kind])) return t;
  sprite.react = null;
  return -1;
}

// Draws a pet with its reaction. (x, y) is the top-left corner where the pet stands now.
export function drawPet(g, sprite, x, y, time, still) {
  const { img, flip } = sprite;
  const t = age(sprite, time, still);
  const p = t < 0 || still ? petPose(null, 0) : petPose(sprite.react.kind, t);
  const w = img.width;
  const h = img.height;
  g.save();
  // the origin is the middle of the pet's feet, so a flip and a tilt keep the pet on its spot
  g.translate(x + w / 2 + p.dx, y + h - p.dy);
  if (p.tilt) g.rotate(p.tilt);
  if (flip) g.scale(-1, 1);
  if (p.stretch) {
    const mid = Math.floor(h * 0.55);
    g.drawImage(img, 0, 0, w, mid, -w / 2, -h - p.stretch, w, mid);
    g.drawImage(img, 0, mid, w, 1, -w / 2, -h + mid - p.stretch, w, p.stretch + 1);
    g.drawImage(img, 0, mid, w, h - mid, -w / 2, -h + mid, w, h - mid);
  } else {
    g.drawImage(img, -w / 2, -h);
  }
  g.restore();
}

// A small heart with one light pixel.
const HEART = [".#.#.", "#h###", ".###.", "..#.."];
const HEART_COLORS = { "#": "#e8486a", h: "#ffb3c2" };

function drawHeart(g, x, y) {
  eachPixel(HEART, HEART_COLORS, (i, j, color) => {
    g.fillStyle = color;
    g.fillRect(x + i, y + j, 1, 1);
  });
}

// A small flame that puffs out of the dragon's mouth. It grows, flickers, and shrinks.
// The flame is a little teardrop: thin at the mouth, round in the middle, and thin at the tip.
const FLAME_SHAPE = [1, 1, 3, 3, 3, 1];
const FLAME_COLORS = ["#fff4c2", "#ffe9a0", "#ffd36b", "#f6b74a", "#e8602c", "#c0392b"];
function drawFlame(g, sprite, x, y, t, still) {
  const life = still ? 0.5 : t / LENGTH.dragon;
  if (life < 0.15 || life > 0.85) return;
  const grow = Math.sin(((life - 0.15) / 0.7) * Math.PI);
  const flicker = still ? 0 : Math.round(Math.random() - 0.3);
  const len = Math.max(2, Math.min(FLAME_SHAPE.length, Math.round(grow * FLAME_SHAPE.length) - flicker));
  const dir = sprite.flip ? 1 : -1;
  const mouthX = sprite.flip ? x + sprite.img.width - 1 - MOUTH.x : x + MOUTH.x;
  for (let i = 0; i < len; i++) {
    const tall = i === len - 1 ? 1 : FLAME_SHAPE[i];
    g.fillStyle = FLAME_COLORS[Math.round((i / Math.max(1, len - 1)) * (FLAME_COLORS.length - 1))];
    g.fillRect(mouthX + dir * (i + 1), y + MOUTH.y - Math.floor(tall / 2), 1, tall);
  }
}

// Draws what floats over a pet: a heart for a cat, a flame for the dragon.
// With reduced motion, every pet shows its heart or flame, still.
export function drawPetMark(g, sprite, time, still) {
  const t = age(sprite, time, still);
  if (t < 0) return;
  const { kind } = sprite.react;
  const p = still ? petPose(null, 0) : petPose(kind, t);
  const x = Math.round(sprite.x - sprite.img.width / 2) + p.dx;
  const top = Math.round(sprite.y - sprite.img.height - sprite.bob) - p.dy - p.stretch;
  if (kind === "dragon") return drawFlame(g, sprite, x, top + p.stretch, t, still);
  const hearts = still || kind === "cat" || kind === "alien";
  if (!hearts) return;
  const rise = still ? 0 : Math.floor(t * 6);
  // a heart blinks out at the end
  if (!still && t > LENGTH[kind] - 0.3 && Math.floor(t * 12) % 2) return;
  drawHeart(g, Math.round(sprite.x) + (sprite.flip ? -7 : 2), top - 6 - rise);
}

// The scene layer: a pet with a reaction draws in its pose, and its mark shows over everything.
class PetLayer {
  constructor({ scene, reducedMotion }) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
  }

  drawSprite(g, s, x, y) {
    if (!s.react) return false;
    drawPet(g, s, x, y, this.scene.time, this.reducedMotion);
    return true;
  }

  drawFront(g) {
    for (const s of this.scene.visibleSprites()) if (s.react) drawPetMark(g, s, this.scene.time, this.reducedMotion);
  }
}

export default {
  name: "pets",
  hints: [
    { host: "daughter", text: "Have you met the pets? They know tricks." },
    { host: "son", text: "Some pets here are not normal pets." },
  ],
  // The pets hints need a pet at the party.
  fits: ({ scene }) => scene.sprites.some(isPet),
  setup(ctx) {
    const { scene, sound } = ctx;
    return {
      layer: new PetLayer(ctx),
      // A pet reacts to every tap. Its own sound plays in place of the editor's chime.
      tapSprite: (sprite) => !!react(sprite, { time: scene.time, sound }),
    };
  },
};
