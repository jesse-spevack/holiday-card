// Hidden extras in the living room. Nothing on screen points to them.
// A light blue Waymo van or a steel Cybertruck drives past the window now and then. A tap on the window sends a shooting star,
// a tap on the menorah lights it again and asks about miracles, and a tap on the floor lamp turns it off and on.
// The tap areas are HOTSPOTS in room.js. The scene draws this module as a layer (Scene.addLayer).

import { ROOM_W, ROOM_H, FIRE, WINDOW, ROAD_Y, MENORAH, LAMP, LAMP_YELLOW, WALL, SHADE_OFF, FIRE_COLORS, rgb, isNight } from "./room.js";
import { eachPixel } from "./pixels.js";

const PANES = WINDOW.glass.panes;
// With the lamp off, the room goes this dark blue. plants.js darkens its falling petals with it too.
export const NIGHT_TINT = [0x7c, 0x84, 0xb8];

// The Waymo Ojai, the light blue van, facing right. O outline, L roof light, B blue body, S body shade, G window,
// D lidar dome, R tail light, H headlight, K tire, h hub.
const CAR = [
  "......OOO.....",
  ".....ODDDO....",
  ".OOOOOOOOOOO..",
  "OLLLLLLLLLLLO.",
  "OBGGGBGGGGGGO.",
  "OBGGGBGGGGGGBO",
  "OBBBBBBBBBBBBO",
  "RBBBBBBBBBBBBH",
  "OSSOOSSSSOOSSO",
  ".OOKhOOOOKhOO.",
  "...OO....OO...",
];
const CAR_COLORS = { O: "#1b1a2e", L: "#c6e7fa", B: "#86c5ea", S: "#5a93bf", G: "#273049", D: "#2a2f45", R: "#e0504a", H: "#fef09f", K: "#3c3e50", h: "#9da8b6" };
const DOME = { x: 6, y: 1, w: 3 };

// The Cybertruck, facing right: a steel wedge with one sharp peak, a long flat slope to the tail, and a steeper slope to the nose.
// L steel edge in the light, S steel, T lower steel in shade, G glass, g glint, C black arches, sill, and bumpers,
// K tire, h wheel cover, R tail light bar, W front light bar.
const TRUCK = [
  "..............LL............",
  "..........LLLLGgLL..........",
  "......LLLLSGGGgGGGLLL.......",
  "..LLLLSSSSSGGgGGGGGGGLL.....",
  "RLSSSSSSSSSSSSSSSSSSSSSLLL..",
  "SSSCCCCCSSSSSSSSSSSSSCCCCCWW",
  "SSCCKKKCCSSSSSSSSSSSCCKKKCCC",
  "CTCKhhhKCTTTTTTTTTTTCKhhhKCC",
  "CCCKhKhKCCCCCCCCCCCCCKhKhKCC",
  "...KhhhK.............KhhhK..",
  "....KKK...............KKK...",
];
const TRUCK_COLORS = { L: "#eef0f3", S: "#c4c8cf", T: "#a2a7b0", G: "#334058", g: "#55657f", C: "#1b1a2e", K: "#3c3e50", h: "#8a94a3", R: "#e0504a", W: "#ffffff" };

// The cars that drive past the window, one at a time. Each car comes back `gap` seconds after it drives out of sight.
// speed is in room pixels a second. light is the row of the headlight and the color of its beam on the snow.
// With reduced motion, a car stops in the window at x = park[0] when it faces left, or park[1] when it faces right.
// The Cybertruck is too long for one pane, so it stops with its nose and its light bar in an outer pane.
export const CARS = {
  waymo: { rows: CAR, colors: CAR_COLORS, speed: 13, gap: [40, 90], light: { y: 7, color: "#fff4c2" }, park: [168, 168] },
  cybertruck: { rows: TRUCK, colors: TRUCK_COLORS, speed: 16, gap: [60, 120], light: { y: 5, color: "#eef6ff" }, park: [166, 208] },
};
for (const car of Object.values(CARS)) car.w = car.rows[0].length;
// With reduced motion, a car stays this many seconds. After a car goes, the next car waits this many seconds or more.
const PARKED_SECONDS = 5;
const ROAD_CLEAR = 3;
// Eddie calls out the Cybertruck once it shows in the window. If he talks already, he calls out after that, while the truck still shows.
const SHOUT = { host: "son", text: "Cybertruck!", seconds: 4 };

const STAR = { tail: 14, seconds: 1, fade: 0.4, still: 1.4 };
// Words that show for a moment, centered on x with their top at y, in room pixels.
// The wish sits high on the window glass, away from the menorah. It has no box, so the star shows around its letters.
// The question sits under the sill, below the menorah.
const WISH = { text: "Make a wish", x: 201, y: 10, ms: 2200, sky: true };
const MIRACLES = { text: "What miracles are you grateful for?", x: 201, y: 61, ms: 3500 };
const LIGHTING = { pause: 0.7, step: 0.45, grow: 0.18 };

const rand = (a, b) => a + Math.random() * (b - a);

export class Eggs {
  // onFound("waymo") or onFound("cybertruck") runs each time that car drives out of sight.
  constructor({ scene, sound, reducedMotion, onFound = () => {} }) {
    this.scene = scene;
    this.onFound = onFound;
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.lampOn = true;
    this.car = null;
    this.star = null;
    this.lighting = null;
    this.wisps = [];
    // The scene time when each car comes next.
    this.next = Object.fromEntries(Object.entries(CARS).map(([kind, car]) => [kind, rand(...car.gap)]));
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

  // ---- the cars: the Waymo and the Cybertruck ----
  // Sends a car now, "waymo" or "cybertruck". dir 1 drives right, and -1 drives left.
  // If another car is on the road, this car comes after that car goes.
  send(kind, dir = Math.random() < 0.5 ? 1 : -1) {
    if (this.car) {
      this.next[kind] = this.scene.time;
      return;
    }
    const time = this.scene.time;
    const car = CARS[kind];
    if (this.reducedMotion) {
      this.car = { kind, car, x: car.park[dir > 0 ? 1 : 0], dir, until: time + PARKED_SECONDS };
    } else {
      // Start and end out of sight, with room for the headlight beam.
      const x = dir > 0 ? PANES[0][0] - car.w - 10 : PANES[2][1] + 10;
      this.car = { kind, car, x, dir };
    }
    this.next[kind] = Infinity;
  }

  carGone() {
    const c = this.car;
    if (this.reducedMotion) return this.scene.time > c.until;
    return c.dir > 0 ? c.x > PANES[2][1] + 1 : c.x < PANES[0][0] - c.car.w - 1;
  }

  // Some part of the car shows through the glass.
  carInSight() {
    const c = this.car;
    return c.x + c.car.w - 1 >= PANES[0][0] && c.x <= PANES[2][1];
  }

  // Eddie calls out the Cybertruck, once for each pass, when he does not talk already.
  shout() {
    const c = this.car;
    if (c.kind !== "cybertruck" || c.shouted || !this.carInSight()) return;
    const eddie = this.scene.sprites.find((s) => s.id === SHOUT.host && s.img);
    if (!eddie || eddie.bubbleEl) return;
    this.scene.say(eddie, SHOUT.text, SHOUT.seconds);
    c.shouted = true;
  }

  drawCar(g) {
    const c = this.car;
    const { rows, colors, w, light } = c.car;
    const x0 = Math.round(c.x);
    const y0 = ROAD_Y - rows.length + 1;
    const px = (col) => x0 + (c.dir > 0 ? col : w - 1 - col);
    eachPixel(rows, colors, (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(x0 + x, y0 + y, 1, 1);
    }, { flipX: c.dir < 0 });
    // The Waymo's lidar dome spins: a glint sweeps across it.
    const sweep = this.reducedMotion ? 1 : Math.floor(this.scene.time * 10) % (DOME.w + 1);
    if (c.kind === "waymo" && sweep < DOME.w) {
      g.fillStyle = "#c8f0ff";
      g.fillRect(px(DOME.x + sweep), y0 + DOME.y, 1, 1);
    }
    // Soft headlight beams on the snow ahead.
    g.fillStyle = light.color;
    for (let i = 1; i <= 8; i++) {
      g.globalAlpha = 0.4 * (1 - i / 9);
      const x = c.dir > 0 ? x0 + w - 1 + i : x0 - i;
      const spread = i > 5 ? 2 : i > 2 ? 1 : 0;
      g.fillRect(x, y0 + light.y - Math.min(spread, 1), 1, 1 + spread + Math.min(spread, 1));
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
    this.say(WISH);
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

  // Only one set of words shows at a time: new words replace the old words, so they never overlap.
  say(words) {
    this.hush();
    const el = document.createElement("div");
    el.className = words.sky ? "wish sky" : "wish";
    el.textContent = words.text;
    el.style.setProperty("--ms", `${words.ms}ms`);
    this.scene.overlay.append(el);
    // Keep the words inside the room, 12 screen pixels or more from its edges.
    const reach = ((el.offsetWidth / 2 + 12) / this.scene.overlay.clientWidth) * ROOM_W;
    this.scene.pin(el, Math.min(Math.max(words.x, reach), ROOM_W - reach), words.y);
    this.words = { el, of: words };
    this.wordsTimer = setTimeout(() => this.hush(), words.ms);
  }

  hush() {
    clearTimeout(this.wordsTimer);
    this.words?.el.remove();
    this.words = null;
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
    if (this.words?.of === MIRACLES) this.hush();
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

  // ---- the layer hooks that the scene calls ----
  update(dt) {
    const time = this.scene.time;
    if (!this.car) {
      // The car that is due first drives first. The other car waits for the road to clear.
      const due = Object.keys(CARS).filter((kind) => time >= this.next[kind]).sort((a, b) => this.next[a] - this.next[b]);
      if (due.length) this.send(due[0]);
    }
    if (this.car) {
      const c = this.car;
      if (!this.reducedMotion) c.x += c.dir * c.car.speed * dt;
      this.shout();
      if (this.carGone()) {
        this.car = null;
        this.onFound(c.kind);
        for (const kind of Object.keys(CARS)) this.next[kind] = Math.max(this.next[kind], time + ROAD_CLEAR);
        this.next[c.kind] = time + rand(...c.car.gap);
      }
    }
    const l = this.lighting;
    if (l) {
      const due = Math.min(l.total, Math.floor((time - l.t0 - LIGHTING.pause) / LIGHTING.step) + 1);
      while (l.played < due) this.sound.chime(l.played++);
      if (time > l.t0 + LIGHTING.pause + (l.total - 1) * LIGHTING.step + LIGHTING.grow) {
        this.lighting = null;
        this.say(MIRACLES);
      }
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
// The white candles of the menorah look like snow, so they do not count.
function isGlass(data, x, y, i) {
  const { y0, y1 } = WINDOW.glass;
  if (y < y0 || y > y1 || !PANES.some(([x0, x1]) => x >= x0 && x <= x1)) return false;
  if (data[i + 2] > data[i] + 10) return true;
  const candle = x >= MENORAH.x0 && x <= MENORAH.x1 && y >= MENORAH.y0 && y <= MENORAH.y1;
  return isNight(data, i) && !candle;
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
