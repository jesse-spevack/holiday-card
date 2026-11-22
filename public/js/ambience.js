// The room's own small motions, which are not hidden extras: the snow in the window, the glow of the fire,
// and the candle flames that flicker on their own. The scene runs this module each frame (scene.js).
// The menorah extra says which flames burn (a layer's flame(i)), and the lamp extra draws the flames again over its night tint.

import { ROOM_W, WINDOW, CANDLES, FIRE, isNight } from "./room.js";

const rand = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(scene) {
    this.scene = scene;
    this.flakes = Array.from({ length: 36 }, () => newFlake(true));
    this.flames = [];
    this.glass = new Set();
  }

  // Called once the room image loads, with its RGBA pixels, before the layers prepare.
  prepare(pixels) {
    this.flames = flamePixels(pixels);
    this.glass = glassPixels(pixels);
  }

  update(dt) {
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += f.drift * dt;
      if (f.y > WINDOW.snow.y1 || f.x < f.pane[0] || f.x > f.pane[1]) Object.assign(f, newFlake());
    }
  }

  // Over the layers' drawBack, under the sprites.
  draw(g) {
    // snow in the window, only on the glass, never over the frame or the menorah
    g.fillStyle = "#ffffff";
    for (const f of this.flakes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (this.glass.has(y * ROOM_W + x)) g.fillRect(x, y, 1, 1);
    }
    this.drawGlow(g);
    this.drawFlames(g);
  }

  flicker() {
    const t = this.scene.time;
    return 0.5 + 0.5 * Math.sin(t * 9) * Math.sin(t * 5.3 + 1);
  }

  drawGlow(g) {
    const flicker = this.flicker();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.06 + 0.06 * flicker;
    g.fillStyle = "#ffb050";
    g.fillRect(FIRE.x, FIRE.y, FIRE.w, FIRE.h);
    g.globalAlpha = 0.05 + 0.05 * flicker;
    g.beginPath();
    g.ellipse(128, 88, 34, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }

  // Each candle flame flickers on its own: a bright core and a tip that comes and goes.
  // A flame that was just lit shows only a small dim core for a moment.
  drawFlames(g) {
    const t = this.scene.time;
    this.flames.forEach(({ x, y }, i) => {
      const state = this.scene.flameState(i);
      if (state === "out") return;
      const wave = Math.sin(t * (7 + i) + i * 1.7) + Math.sin(t * 3.1 + i);
      g.fillStyle = state === "new" ? "#f6b74a" : wave > 0 ? "#fff4c2" : "#ffd36b";
      g.fillRect(x, y, 1, 1);
      if (state === "lit" && wave > -0.6) {
        g.fillStyle = wave > 0.8 ? "#ffe9a0" : "#f6b74a";
        g.fillRect(x, y - 1, 1, 1);
      }
    });
  }
}

function newFlake(anywhere = false) {
  const { panes, y0, y1 } = WINDOW.snow;
  const pane = panes[Math.floor(Math.random() * panes.length)];
  return {
    x: rand(pane[0], pane[1]),
    y: anywhere ? rand(y0, y1) : y0,
    pane,
    speed: rand(5, 11),
    drift: rand(-1.5, 1.5),
  };
}

// The candle flames are the bright yellow pixels around the menorah.
function flamePixels(data) {
  const flames = [];
  for (let y = CANDLES.y0; y < CANDLES.y1; y++) {
    for (let x = CANDLES.x0; x < CANDLES.x1; x++) {
      const i = (y * ROOM_W + x) * 4;
      if (data[i] > 220 && data[i + 1] > 170 && data[i + 2] < 160) flames.push({ x, y });
    }
  }
  return flames;
}

// The window glass where snow falls: the dark blue night sky and the snow on it.
function glassPixels(data) {
  const glass = new Set();
  const { panes, y0, y1 } = WINDOW.snow;
  for (let y = y0; y < y1; y++) {
    for (const [x0, x1] of panes) {
      for (let x = x0; x <= x1; x++) {
        if (isNight(data, (y * ROOM_W + x) * 4)) glass.add(y * ROOM_W + x);
      }
    }
  }
  return glass;
}
