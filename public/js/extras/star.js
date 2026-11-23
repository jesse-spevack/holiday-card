// The shooting star, a hidden extra. A tap on the window sends a shooting star across the night sky,
// and "Make a wish" shows high on the window glass for about 2 seconds.

import { WINDOW_TAP } from "../room.js";
import { Sky } from "../masks.js";
import { showWords } from "../words.js";
import { carInSight } from "./road.js";

const STAR = { tail: 14, seconds: 1, fade: 0.4, still: 1.4 };
// The wish sits high on the window glass, away from the menorah. It has no box, so the star shows around its letters.
const WISH = { text: "Make a wish", x: 201, y: 10, ms: 2200, sky: true };

const rand = (a, b) => a + Math.random() * (b - a);

class Star {
  constructor({ scene, sound, reducedMotion }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.star = null;
  }

  prepare(pixels) {
    this.sky = new Sky(pixels);
  }

  shoot() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.star = {
      t0: this.scene.time,
      x0: dir < 0 ? rand(222, 236) : rand(166, 180),
      y0: rand(9, 14),
      dx: dir * rand(48, 62),
      dy: rand(14, 20),
    };
    this.sound.sparkle();
    showWords(this.scene, WISH);
  }

  // Over the room image, under the snow: the star shows through the window glass.
  drawBack(g) {
    if (this.star && this.sky) this.sky.draw(g, (s) => this.drawStar(s));
  }

  drawStar(g) {
    const s = this.star;
    const age = this.scene.time - s.t0;
    let progress;
    let alpha;
    if (this.reducedMotion) {
      progress = 0.6;
      alpha = Math.min(1, (STAR.still + STAR.fade - age) / STAR.fade);
    } else {
      progress = Math.min(1, age / STAR.seconds);
      alpha = age < STAR.seconds ? 1 : 1 - (age - STAR.seconds) / STAR.fade;
    }
    if (alpha <= 0) {
      this.star = null;
      return;
    }
    const len = Math.hypot(s.dx, s.dy);
    const ux = s.dx / len;
    const uy = s.dy / len;
    const hx = s.x0 + s.dx * progress;
    const hy = s.y0 + s.dy * progress;
    const tail = Math.min(STAR.tail, this.reducedMotion ? STAR.tail : progress * len);
    for (let i = tail; i >= 0; i--) {
      g.globalAlpha = alpha * (1 - i / (STAR.tail + 1));
      g.fillStyle = i < 2 ? "#ffffff" : i < 5 ? "#fff4c2" : "#b9c7ff";
      g.fillRect(Math.round(hx - ux * i), Math.round(hy - uy * i), 1, 1);
    }
    // a small twinkle around the head
    g.globalAlpha = alpha * 0.45;
    g.fillStyle = "#ffffff";
    const x = Math.round(hx);
    const y = Math.round(hy);
    g.fillRect(x - 1, y, 3, 1);
    g.fillRect(x, y - 1, 1, 3);
    g.globalAlpha = 1;
  }
}

export default {
  name: "star",
  // The window is "back": it takes only the taps that no small thing in front of it takes.
  spots: [{ id: "window", ...WINDOW_TAP, back: true }],
  hints: [
    { host: "jessica", text: "The window is good for wishes." },
    { host: "daughter", text: "I saw a shooting star in our window!" },
  ],
  setup(ctx) {
    const star = new Star(ctx);
    return {
      layer: star,
      tap: () => star.shoot(),
      // The window glints only while a car drives past, so the glint does not sit on an empty window.
      cue: () => carInSight(ctx.scene),
      test: () => ({ eggs: () => ({ star: !!star.star }) }),
    };
  },
};
