// Hidden extras in the living room. Nothing on screen points to them.
// A Waymo drives past the window now and then. A tap on the window sends a shooting star,
// a tap on the menorah lights it again, and a tap on the floor lamp turns it off and on.
// The tap areas are HOTSPOTS in scene.js.

import { ROOM_W, ROOM_H, FIRE } from "./scene.js";

// The window glass in room pixels. The bottom rows are the snowy ground outside.
const PANES = [[166, 184], [189, 212], [217, 235]];
const GLASS_Y = [8, 48];
// The menorah's white candles stand in front of the glass, so the car and the star pass behind them.
const MENORAH = { x0: 190, y0: 36, x1: 213, y1: 49 };

// The floor lamp's light is one yellow on the wall around it. The shade inside its outline is the same yellow.
const LAMP = { x0: 0, y0: 0, x1: 60, y1: 72, shade: { x0: 24, y0: 29, x1: 42, y1: 46 } };
const LAMP_YELLOW = 0xfef09f;
const WALL = [0xed, 0xd7, 0xb6];
const SHADE_OFF = [0xd0, 0xb3, 0x99];
const NIGHT_TINT = [0x7c, 0x84, 0xb8];
const FIRE_COLORS = new Set([0xaa5317, 0xfbe55d, 0xfef09f, 0xf5cf6f, 0xe1a468, 0xf8f5f1]);

// The Waymo, facing right. O outline, W white body, S body shade, G window, D lidar dome, R tail light, H headlight, K tire, h hub.
const CAR = [
  "......OOO.....",
  ".....ODDDO....",
  "...OOOOOOOOO..",
  "..OWGGWGGGGO..",
  ".OWWWWWWWWWWOO",
  "ORWWWWWWWWWWWH",
  "OSSOOSSSSOOSSO",
  ".OOKhOOOOKhOO.",
  "...OO....OO...",
];
const CAR_COLORS = { O: "#1b1a2e", W: "#f8f5f1", S: "#bec6d2", G: "#273049", D: "#2a2f45", R: "#e0504a", H: "#fef09f", K: "#3c3e50", h: "#9da8b6" };
const CAR_W = CAR[0].length;
const DOME = { x: 6, y: 1, w: 3 };
const HEADLIGHT_Y = 5;
const ROAD_Y = 47;
const CAR_SPEED = 13;
const CAR_PARKED = { x: 168, seconds: 5 };
const WAYMO_GAP = [40, 90];

const STAR = { tail: 14, seconds: 1, fade: 0.4, still: 1.4 };
const WISH = { text: "Make a wish", x: 201, y: 61, ms: 2200 };
const LIGHTING = { pause: 0.7, step: 0.45, grow: 0.18 };

const rand = (a, b) => a + Math.random() * (b - a);
const rgb = (data, i) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];

export class Eggs {
  constructor({ scene, sound, reducedMotion }) {
    this.scene = scene;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.lampOn = true;
    this.car = null;
    this.star = null;
    this.lighting = null;
    this.wisps = [];
    this.nextCar = rand(...WAYMO_GAP);
  }

  // Called once the room image loads, with its RGBA pixels.
  prepare(pixels) {
    this.glassLayer = layer((x, y, i) => isGlass(pixels, x, y, i));
    this.lampOffLayer = lampOff(pixels);
    const fire = (x, y, i) => x >= FIRE.x && x < FIRE.x + FIRE.w && y >= FIRE.y && y < FIRE.y + FIRE.h && FIRE_COLORS.has(rgb(pixels, i));
    this.tintLayer = layer((x, y, i) => !isGlass(pixels, x, y, i) && !fire(x, y, i), NIGHT_TINT);
    // An unlit candle shows the night sky two pixels above its flame.
    this.skyAbove = this.scene.flames.map(({ x, y }) => {
      const i = ((y - 2) * ROOM_W + x) * 4;
      return `rgb(${pixels[i]}, ${pixels[i + 1]}, ${pixels[i + 2]})`;
    });
    this.sky = canvas();
  }

  tap(id) {
    if (id === "window") this.shootStar();
    else if (id === "menorah") this.relight();
    else if (id === "lamp") this.toggleLamp();
  }

  // ---- the Waymo ----
  waymo() {
    const time = this.scene.time;
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (this.reducedMotion) {
      this.car = { x: CAR_PARKED.x, dir, until: time + CAR_PARKED.seconds };
    } else {
      // Start and end out of sight, with room for the headlight beam.
      const x = dir > 0 ? PANES[0][0] - CAR_W - 10 : PANES[2][1] + 10;
      this.car = { x, dir };
    }
    this.nextCar = Infinity;
  }

  carGone() {
    const c = this.car;
    if (this.reducedMotion) return this.scene.time > c.until;
    return c.dir > 0 ? c.x > PANES[2][1] + 1 : c.x < PANES[0][0] - CAR_W - 1;
  }

  drawCar(g) {
    const c = this.car;
    const x0 = Math.round(c.x);
    const y0 = ROAD_Y - CAR.length + 1;
    const px = (col) => x0 + (c.dir > 0 ? col : CAR_W - 1 - col);
    CAR.forEach((row, r) => {
      [...row].forEach((ch, col) => {
        if (!CAR_COLORS[ch]) return;
        g.fillStyle = CAR_COLORS[ch];
        g.fillRect(px(col), y0 + r, 1, 1);
      });
    });
    // The lidar dome spins: a glint sweeps across it.
    const sweep = this.reducedMotion ? 1 : Math.floor(this.scene.time * 10) % (DOME.w + 1);
    if (sweep < DOME.w) {
      g.fillStyle = "#c8f0ff";
      g.fillRect(px(DOME.x + sweep), y0 + DOME.y, 1, 1);
    }
    // Soft headlight beams on the snow ahead.
    g.fillStyle = "#fff4c2";
    for (let i = 1; i <= 8; i++) {
      g.globalAlpha = 0.4 * (1 - i / 9);
      const x = c.dir > 0 ? x0 + CAR_W - 1 + i : x0 - i;
      const spread = i > 5 ? 2 : i > 2 ? 1 : 0;
      g.fillRect(x, y0 + HEADLIGHT_Y - Math.min(spread, 1), 1, 1 + spread + Math.min(spread, 1));
    }
    g.globalAlpha = 1;
  }

  // ---- the shooting star ----
  shootStar() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.star = {
      t0: this.scene.time,
      x0: dir < 0 ? rand(222, 236) : rand(166, 180),
      y0: rand(9, 14),
      dx: dir * rand(48, 62),
      dy: rand(14, 20),
    };
    this.sound.sparkle();
    this.showWish();
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

  showWish() {
    this.wishEl?.remove();
    clearTimeout(this.wishTimer);
    const el = document.createElement("div");
    el.className = "wish";
    el.textContent = WISH.text;
    this.scene.overlay.append(el);
    this.scene.pin(el, WISH.x, WISH.y);
    this.wishEl = el;
    this.wishTimer = setTimeout(() => {
      el.remove();
      if (this.wishEl === el) this.wishEl = null;
    }, WISH.ms);
  }

  // ---- the menorah ----
  // The flames go out, then light one by one: the raised shamash first, then left to right.
  relight() {
    if (this.lighting) return;
    const flames = this.scene.flames;
    const order = flames.map((f, i) => i).sort((a, b) => flames[a].y - flames[b].y || flames[a].x - flames[b].x);
    const rank = new Map(order.map((i, k) => [i, k]));
    this.lighting = { t0: this.scene.time, rank, played: 0, total: flames.length };
    this.wisps = flames.map(({ x, y }) => ({ x, y: y - 1, t0: this.scene.time }));
    this.sound.snuff();
  }

  flame(i) {
    const l = this.lighting;
    if (!l) return "lit";
    const age = this.scene.time - (l.t0 + LIGHTING.pause + l.rank.get(i) * LIGHTING.step);
    return age < 0 ? "out" : age < LIGHTING.grow ? "new" : "lit";
  }

  // How many candles burn, for the tests.
  get menorahLit() {
    return this.lighting ? this.lighting.played : this.scene.flames.length;
  }

  drawUnlit(g) {
    this.scene.flames.forEach(({ x, y }, i) => {
      if (this.flame(i) !== "out") return;
      g.fillStyle = this.skyAbove[i];
      g.fillRect(x, y - 1, 1, 2);
    });
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

  // ---- the floor lamp ----
  toggleLamp() {
    this.lampOn = !this.lampOn;
    this.sound.click();
  }

  // ---- loop hooks from the scene ----
  update(dt) {
    const time = this.scene.time;
    if (!this.car && time >= this.nextCar) this.waymo();
    if (this.car) {
      if (!this.reducedMotion) this.car.x += this.car.dir * CAR_SPEED * dt;
      if (this.carGone()) {
        this.car = null;
        this.nextCar = time + rand(...WAYMO_GAP);
      }
    }
    const l = this.lighting;
    if (l) {
      const due = Math.min(l.total, Math.floor((time - l.t0 - LIGHTING.pause) / LIGHTING.step) + 1);
      while (l.played < due) this.sound.chime(l.played++);
      if (time > l.t0 + LIGHTING.pause + (l.total - 1) * LIGHTING.step + LIGHTING.grow) this.lighting = null;
    }
  }

  // Over the room image, under the snow.
  drawBack(g) {
    if (!this.glassLayer) return;
    if (!this.lampOn) g.drawImage(this.lampOffLayer, 0, 0);
    if (this.car || this.star) {
      const s = this.sky.getContext("2d");
      s.globalCompositeOperation = "source-over";
      s.clearRect(0, 0, ROOM_W, ROOM_H);
      if (this.car) this.drawCar(s);
      if (this.star) this.drawStar(s);
      s.globalCompositeOperation = "destination-in";
      s.drawImage(this.glassLayer, 0, 0);
      g.drawImage(this.sky, 0, 0);
    }
    if (this.lighting || this.wisps.length) this.drawUnlit(g);
  }

  // Over everything: with the lamp off, the room goes dark blue, and the fire and the candles glow.
  drawFront(g) {
    if (this.lampOn || !this.tintLayer) return;
    g.globalCompositeOperation = "multiply";
    g.drawImage(this.tintLayer, 0, 0);
    g.globalCompositeOperation = "source-over";
    this.drawFirelight(g);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "#ffb050";
    this.scene.flames.forEach(({ x, y }, i) => {
      if (this.flame(i) === "out") return;
      g.globalAlpha = 0.16;
      g.fillRect(x - 1, y - 2, 3, 4);
    });
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    this.scene.drawFlames(g);
  }

  // A soft warm pool of light that spreads from the fireplace onto the floor.
  drawFirelight(g) {
    const flicker = this.scene.flicker();
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(FIRE.x + FIRE.w / 2, FIRE.y + FIRE.h);
    g.scale(1, 0.55);
    const pool = g.createRadialGradient(0, 0, 4, 0, 0, 64);
    pool.addColorStop(0, `rgba(255, 170, 80, ${0.3 + 0.08 * flicker})`);
    pool.addColorStop(1, "rgba(255, 170, 80, 0)");
    g.fillStyle = pool;
    g.fillRect(-64, -64, 128, 128);
    g.restore();
  }
}

function canvas() {
  const c = document.createElement("canvas");
  c.width = ROOM_W;
  c.height = ROOM_H;
  return c;
}

// A room-sized canvas: one color (white by default) where `keep` says yes, clear everywhere else.
function layer(keep, [r, gr, b] = [255, 255, 255]) {
  const c = canvas();
  const g = c.getContext("2d");
  const img = g.createImageData(ROOM_W, ROOM_H);
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      const i = (y * ROOM_W + x) * 4;
      if (keep(x, y, i)) img.data.set([r, gr, b, 255], i);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// The night sky, the snow, and the hill outside, but not the frame, the menorah, or the dreidels.
function isGlass(data, x, y, i) {
  if (y < GLASS_Y[0] || y > GLASS_Y[1] || !PANES.some(([x0, x1]) => x >= x0 && x <= x1)) return false;
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  if (b > r + 10) return true;
  const white = r > 200 && g > 200 && b > 200;
  const candle = x >= MENORAH.x0 && x <= MENORAH.x1 && y >= MENORAH.y0 && y <= MENORAH.y1;
  return white && !candle;
}

// The pixels that change when the lamp goes off: its yellow light becomes the wall, and the shade goes dull.
function lampOff(data) {
  const c = canvas();
  const g = c.getContext("2d");
  const img = g.createImageData(ROOM_W, ROOM_H);
  const { shade } = LAMP;
  for (let y = LAMP.y0; y < LAMP.y1; y++) {
    // The shade is every yellow pixel between the first and the last outline pixel on its row.
    let left = Infinity;
    let right = -Infinity;
    if (y >= shade.y0 && y <= shade.y1) {
      for (let x = shade.x0; x <= shade.x1; x++) {
        if (rgb(data, (y * ROOM_W + x) * 4) !== LAMP_YELLOW) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    for (let x = LAMP.x0; x < LAMP.x1; x++) {
      const i = (y * ROOM_W + x) * 4;
      if (rgb(data, i) !== LAMP_YELLOW) continue;
      const [r, gr, b] = x > left && x < right ? SHADE_OFF : WALL;
      img.data.set([r, gr, b, 255], i);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
