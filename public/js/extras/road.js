// The road outside the window, where the cars of the car extras drive past (waymo.js, cybertruck.js).
// This module is not an extra. Each car extra joins the road with joinRoad(ctx, car), and the road is one scene layer for all cars.
// Only one car is on the road at a time. Each car comes back `gap` seconds after it drives out of sight.
// A car that is due while another car drives waits until the road is clear, then ROAD_CLEAR seconds more.

import { WINDOW, ROAD_Y } from "../room.js";
import { eachPixel } from "../pixels.js";
import { Sky } from "../masks.js";

const PANES = WINDOW.glass.panes;
// With reduced motion, a car stays this many seconds. After a car goes, the next car waits this many seconds or more.
const PARKED_SECONDS = 5;
const ROAD_CLEAR = 3;

const rand = (a, b) => a + Math.random() * (b - a);
const roads = new WeakMap();

// A car is { kind, rows, colors, speed, gap, light, park, shout, dome }:
//   rows and colors: the car facing right, as a text grid for eachPixel.
//   speed: room pixels a second. gap: [min, max] seconds until the car comes back.
//   light: the row of the headlight and the color of its beam on the snow.
//   park: with reduced motion, the car stops in the window at x = park[0] when it faces left, or park[1] when it faces right.
//   shout: { host, text, seconds }, a host calls out the car once it shows in the window. Optional.
//   dome: { x, y, w }, a roof sensor where a glint sweeps across. Optional.
// found() runs each time the car drives out of sight. Returns the road. The first car to join adds the road to the scene.
export function joinRoad({ scene, reducedMotion, found }, car) {
  let road = roads.get(scene);
  if (!road) {
    road = new Road(scene, reducedMotion);
    roads.set(scene, road);
    scene.addLayer(road);
  }
  road.add(car, found);
  return road;
}

class Road {
  constructor(scene, reducedMotion) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.cars = {};
    this.found = {};
    // The scene time when each car comes next.
    this.next = {};
    // The car on the road: { kind, car, x, dir, until, shouted }, or null.
    this.car = null;
    // The test hooks that every car extra shares. They are the same functions, so the test API takes them once.
    this.test = { carPixels: () => this.pixels() };
  }

  add(car, found) {
    this.cars[car.kind] = { ...car, w: car.rows[0].length };
    this.found[car.kind] = found;
    this.next[car.kind] = rand(...car.gap);
  }

  prepare(pixels) {
    this.sky = new Sky(pixels);
  }

  // The x of the car `kind` while it is on the road, else null.
  x(kind) {
    return this.car?.kind === kind ? this.car.x : null;
  }

  // Sends a car now. dir 1 drives right, and -1 drives left. If another car is on the road, this car comes after that car goes.
  send(kind, dir = Math.random() < 0.5 ? 1 : -1) {
    if (this.car) {
      this.next[kind] = this.scene.time;
      return;
    }
    const time = this.scene.time;
    const car = this.cars[kind];
    if (this.reducedMotion) {
      this.car = { kind, car, x: car.park[dir > 0 ? 1 : 0], dir, until: time + PARKED_SECONDS };
    } else {
      // Start and end out of sight, with room for the headlight beam.
      const x = dir > 0 ? PANES[0][0] - car.w - 10 : PANES[2][1] + 10;
      this.car = { kind, car, x, dir };
    }
    this.next[kind] = Infinity;
  }

  gone() {
    const c = this.car;
    if (this.reducedMotion) return this.scene.time > c.until;
    return c.dir > 0 ? c.x > PANES[2][1] + 1 : c.x < PANES[0][0] - c.car.w - 1;
  }

  // Some part of the car shows through the glass.
  inSight() {
    const c = this.car;
    return c.x + c.car.w - 1 >= PANES[0][0] && c.x <= PANES[2][1];
  }

  // A host calls out the car, once for each pass, when the host does not talk already.
  // If the host talks already, the host calls out after that, while the car still shows.
  shout() {
    const c = this.car;
    const shout = c.car.shout;
    if (!shout || c.shouted || !this.inSight()) return;
    const host = this.scene.sprites.find((s) => s.id === shout.host && s.img);
    if (!host || host.bubbleEl) return;
    this.scene.say(host, shout.text, shout.seconds);
    c.shouted = true;
  }

  update(dt) {
    const time = this.scene.time;
    if (!this.car) {
      // The car that is due first drives first. The other car waits for the road to clear.
      const due = Object.keys(this.cars).filter((kind) => time >= this.next[kind]).sort((a, b) => this.next[a] - this.next[b]);
      if (due.length) this.send(due[0]);
    }
    if (!this.car) return;
    const c = this.car;
    if (!this.reducedMotion) c.x += c.dir * c.car.speed * dt;
    this.shout();
    if (this.gone()) {
      this.car = null;
      this.found[c.kind]();
      for (const kind of Object.keys(this.cars)) this.next[kind] = Math.max(this.next[kind], time + ROAD_CLEAR);
      this.next[c.kind] = time + rand(...c.car.gap);
    }
  }

  // Over the room image, under the snow: the car shows through the window glass.
  drawBack(g) {
    if (this.car && this.sky) this.sky.draw(g, (s) => this.drawCar(s));
  }

  drawCar(g) {
    const c = this.car;
    const { rows, colors, w, light, dome } = c.car;
    const x0 = Math.round(c.x);
    const y0 = ROAD_Y - rows.length + 1;
    const px = (col) => x0 + (c.dir > 0 ? col : w - 1 - col);
    eachPixel(rows, colors, (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(x0 + x, y0 + y, 1, 1);
    }, { flipX: c.dir < 0 });
    // A roof sensor spins: a glint sweeps across it.
    if (dome) {
      const sweep = this.reducedMotion ? 1 : Math.floor(this.scene.time * 10) % (dome.w + 1);
      if (sweep < dome.w) {
        g.fillStyle = "#c8f0ff";
        g.fillRect(px(dome.x + sweep), y0 + dome.y, 1, 1);
      }
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

  // The car on the road as the last frame drew it, cut to the window glass: each solid pixel as [x, y, "#rrggbb"] in room pixels.
  pixels() {
    const { width, height } = this.sky.canvas;
    const data = this.sky.canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const out = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 255) continue;
      const hex = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      out.push([(i / 4) % width, Math.floor(i / 4 / width), hex]);
    }
    return out;
  }
}
