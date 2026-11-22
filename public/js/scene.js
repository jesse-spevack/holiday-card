// The living room party. Draws at the room's native 256x192 pixels on a canvas,
// which CSS scales up with crisp pixels. Bubbles and nametags are HTML on top.

import { drawPet, drawPetMark } from "./pets.js";

export const ROOM_W = 256;
export const ROOM_H = 192;

// Places in living-room.png, in room pixels.
export const FLOOR = { x0: 98, x1: 180, y0: 100, y1: 168 };
// Places on the open floor where the hosts like to stand.
const PLACES = {
  table: { x: 175, y: 126 },
  rug: { x: 130, y: 136 },
  fire: { x: 124, y: 103 },
  presents: { x: 166, y: 105 },
};
const DOOR = { x: 127, y: 200 };
const DOOR_WAIT = { x: 128, y: 182 };
const WINDOW_PANES = [[167, 184], [190, 212], [217, 236]];
const WINDOW_Y = [9, 44];
export const FIRE = { x: 112, y: 44, w: 32, h: 24 };
const CANDLES = { x0: 188, y0: 34, x1: 212, y1: 46 };
// The photo album on the sofa (art/scripts/book.py). Its cover is the top 12x8 pixels.
const BOOK = { x: 43, y: 99, w: 12, h: 8 };
// Hidden things a tap finds. Each box is the thing as drawn, in room pixels.
// The window is "back": it takes only the taps that no small thing in front of it takes.
export const HOTSPOTS = [
  { id: "book", x: 43, y: 99, w: 12, h: 12 },
  { id: "lamp", x: 24, y: 28, w: 19, h: 50 },
  { id: "dreidel-left", x: 183, y: 45, w: 11, h: 15 },
  { id: "menorah", x: 194, y: 39, w: 17, h: 19 },
  { id: "dreidel-right", x: 214, y: 45, w: 11, h: 15 },
  { id: "window", x: 162, y: 6, w: 80, h: 38, back: true },
];
// A tap finds a thing from a little way off. Each thing gets this much screen (in CSS pixels) in each direction
// where the room allows. A finger needs more than a mouse. Where two areas overlap, the nearer thing wins.
export const TAP_PX = { touch: 44, mouse: 20 };
// Every hidden thing also reaches this far (in room pixels) past its edges.
const TAP_PAD = 2;
// The corners that show which thing a tap found.
// Gold arms with a dark outline, so they show on the night glass, the wood, and the lamp light.
const PRESS = { seconds: 0.45, gold: "#ffd27a", dark: "#2a1813", arm: 4, gap: 2 };

// The two dreidels on the window sill, as drawn in room.png. The dreidel game grows from them.
export const DREIDELS = {
  "dreidel-left": { x: 183, y: 45, w: 10, h: 14 },
  "dreidel-right": { x: 214, y: 45, w: 10, h: 14 },
};

// Each host has a home spot and places to visit. Jess and Jesse also visit the guests. Eddie walks with Audrey.
export const HOSTS = [
  { id: "jessica", name: "Jess", x: 153, y: 130, places: ["table", "rug", "fire"], mingle: true },
  { id: "jesse", name: "Jesse", x: 171, y: 130, places: ["table", "rug", "fire"], mingle: true },
  { id: "daughter", name: "Audrey", x: 98, y: 160, places: ["rug", "fire", "presents", "table"] },
  { id: "son", name: "Eddie", x: 114, y: 162, follow: "daughter" },
];
// What each host says when a guest taps them. Most lines thank the guest. A line with an egg hints at a hidden
// thing in the room (app.js drops it after the guest finds that thing).
const hint = (egg, text) => ({ egg, text });
export const HOST_LINES = {
  jessica: [
    "Thank you for being here.",
    "We're grateful for you.",
    "So happy to see you!",
    hint("album", "Have you seen our year? It's somewhere comfy."),
    hint("menorah", "The candles by the window have a question."),
    hint("star", "The window is good for wishes."),
  ],
  jesse: [
    "Happy holidays!",
    "Happy New Year!",
    "We're so glad you're in our lives.",
    hint("album", "Our whole year fits in one little book."),
    hint("lamp", "This room is cozier with the lights low."),
    hint("waymo", "Watch the street. Some cars drive themselves."),
    hint("menorah", "Those candles love to be lit again."),
  ],
  daughter: [
    "So happy you came!",
    "Thanks for coming to our party!",
    hint("dreidel", "The little tops on the sill look lonely."),
    hint("star", "I saw a shooting star in our window!"),
    hint("pets", "Have you met the pets? They know tricks."),
    hint("silly", "My favorite looks are the silly ones."),
  ],
  son: [
    "Hi! Happy holidays!",
    "I'm glad you're here!",
    hint("dreidel", "Bet you can't beat me at dreidel."),
    hint("waymo", "I saw a van with nobody driving it!"),
    hint("pets", "Some pets here are not normal pets."),
    hint("lamp", "The fire looks so cool in the dark."),
  ],
};

const WALK_SPEED = 22;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${src}`));
    img.src = src;
  });
}

export class Scene {
  constructor({ stage, world, canvas, overlay, reducedMotion }) {
    this.stage = stage;
    this.world = world;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.overlay = overlay;
    this.reducedMotion = reducedMotion;
    this.sprites = [];
    this.families = new Map();
    this.flakes = Array.from({ length: 36 }, () => this.newFlake(true));
    this.camera = { scale: 2, x: 128, y: 120, target: null };
    this.last = performance.now();
    this.time = 0;
    this.onTap = () => {};
    this.onHover = () => {};
    this.onHotspot = () => {};
    this.eggs = null;
    this.onLayout = () => {};
    this.bookHidden = false;
    this.press = null;
    stage.addEventListener("pointerdown", (e) => this.handlePress(e));
    stage.addEventListener("pointercancel", () => { this.press = null; });
    stage.addEventListener("pointerup", (e) => this.handleTap(e));
    // Hover labels are for a mouse only. A phone shows them on tap.
    stage.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const p = this.toRoom(e.clientX, e.clientY);
      this.onHover(this.spriteAt(p.x, p.y));
    });
    stage.addEventListener("pointerleave", () => this.onHover(null));
    new ResizeObserver(() => this.layout()).observe(stage);
  }

  async load(roomSrc) {
    this.room = await loadImage(roomSrc);
    const pixels = roomPixels(this.room);
    this.flames = flamePixels(pixels);
    this.glass = glassMask(pixels);
    this.eggs?.prepare(pixels);
    loadImage("/assets/book.png").then((img) => { this.book = img; }, () => {});
    this.layout();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- camera ----
  // The whole room, wall to wall, as large as the stage allows. The scale can be fractional:
  // the canvas keeps crisp pixels with image-rendering: pixelated.
  baseScale() {
    return Math.min(this.stage.clientWidth / ROOM_W, this.stage.clientHeight / ROOM_H);
  }

  focus(x, y, zoom = 0) {
    this.camera.target = { x, y, zoom };
    if (this.reducedMotion) Object.assign(this.camera, { x, y, scale: this.baseScale() + zoom });
  }

  layout() {
    const c = this.camera;
    if (!c.target) c.scale = this.baseScale();
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    const pw = ROOM_W * c.scale;
    const ph = ROOM_H * c.scale;
    let left = w / 2 - c.x * c.scale;
    let top = h / 2 - c.y * c.scale;
    left = pw > w ? clamp(left, w - pw, 0) : (w - pw) / 2;
    top = ph > h ? clamp(top, h - ph, 0) : (h - ph) / 2;
    Object.assign(this.world.style, { left: `${left}px`, top: `${top}px`, width: `${pw}px`, height: `${ph}px` });
    this.view = { left, top, scale: c.scale };
    this.onLayout(this.view);
  }

  toRoom(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.left) / this.view.scale, y: (clientY - r.top - this.view.top) / this.view.scale };
  }

  // ---- sprites ----
  addSprite(s) {
    const sprite = {
      x: 0, y: 0, flip: false, bob: 0, path: null, wander: false, popAt: this.time,
      nextMove: this.time + rand(2, 6), ...s,
    };
    this.sprites.push(sprite);
    return sprite;
  }

  addHost({ x, y, ...host }, img) {
    return this.addSprite({
      ...host, img, x, y, home: { x, y }, host: true, familyId: "hosts",
      wander: !host.follow, nextMove: this.time + rand(1.5, 4),
    });
  }

  removeFamily(id) {
    this.sprites = this.sprites.filter((s) => s.familyId !== id);
    this.families.delete(id);
  }

  walkTo(sprite, x, y) {
    sprite.path = { x, y };
    if (Math.abs(x - sprite.x) > 0.5) sprite.flip = x < sprite.x;
  }

  // Home now and then, else a new place, or a guest family for Jess and Jesse.
  hostMove(s) {
    const away = s.away || 0;
    let place;
    if (away && Math.random() < 0.2 + 0.25 * away) {
      place = { name: "home", ...s.home, reach: 4 };
    } else {
      // Two hosts do not go to the same place at once.
      const taken = this.sprites.filter((q) => q.host && q !== s).map((q) => q.place);
      const open = s.places.filter((n) => n !== s.place && !taken.includes(n) && Math.hypot(PLACES[n].x - s.x, PLACES[n].y - s.y) > 20);
      const names = open.length ? open : s.places.filter((n) => n !== s.place);
      const guests = s.mingle && !taken.includes("guests") && Math.random() < 0.35 ? this.besideGuests(s) : null;
      const name = names[Math.floor(Math.random() * names.length)];
      place = guests ? { name: "guests", ...guests, reach: 3 } : { name, ...PLACES[name], reach: 8 };
    }
    s.place = place.name;
    s.away = place.name === "home" ? 0 : away + 1;
    const kids = this.sprites.filter((q) => q.follow === s.id);
    const goal = this.openSpot(place, [s, ...kids]);
    this.walkTo(s, goal.x, goal.y);
    for (const kid of kids) {
      const dx = kid.home.x - s.home.x;
      const side = goal.x + dx > FLOOR.x1 ? -1 : 1;
      this.walkTo(kid, clamp(goal.x + dx * side, FLOOR.x0, FLOOR.x1), clamp(goal.y + kid.home.y - s.home.y, FLOOR.y0, FLOOR.y1));
    }
    const walk = Math.hypot(goal.x - s.x, goal.y - s.y) / WALK_SPEED;
    s.nextMove = this.time + walk + (s.mingle ? rand(5, 11) : rand(4, 9));
  }

  // A spot next to a random guest family, on the side nearer the host.
  besideGuests(host) {
    const ids = [...this.families.keys()].filter((id) => id !== "pending");
    const id = ids[Math.floor(Math.random() * ids.length)];
    const members = this.sprites.filter((q) => q.familyId === id).map((q) => q.home || q);
    if (!members.length) return null;
    const xs = members.map((q) => q.x);
    const y = members.reduce((a, q) => a + q.y, 0) / members.length;
    const sides = [Math.min(...xs) - 18, Math.max(...xs) + 18].filter((x) => x >= FLOOR.x0 && x <= FLOOR.x1);
    if (!sides.length) return null;
    sides.sort((a, b) => Math.abs(a - host.x) - Math.abs(b - host.x));
    return { x: sides[0], y: clamp(y, FLOOR.y0, FLOOR.y1) };
  }

  // The spot near a place that is farthest from everyone else, so hosts do not stand on top of people.
  openSpot(place, skip) {
    const others = this.sprites.filter((q) => q.img && !skip.includes(q)).map((q) => q.path || q);
    let best = null;
    let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const p = {
        x: clamp(place.x + rand(-place.reach, place.reach), FLOOR.x0, FLOOR.x1),
        y: clamp(place.y + rand(-place.reach, place.reach) * 0.6, FLOOR.y0, FLOOR.y1),
      };
      const gap = others.length ? Math.min(...others.map((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 1.5))) : 0;
      if (gap > bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    return best;
  }

  // A tapped host stops to talk. Audrey and Eddie stop together.
  pause(sprite, seconds) {
    const lead = sprite.follow ? this.sprites.find((q) => q.id === sprite.follow) : sprite;
    for (const q of this.sprites) {
      if (q !== lead && q.follow !== lead.id) continue;
      q.path = null;
      q.bob = 0;
    }
    lead.nextMove = Math.max(lead.nextMove, this.time + seconds);
  }

  // Pick the open spot farthest from the people already in the room.
  randomSpot() {
    const people = this.sprites.filter((s) => s.wander || s.host).map((s) => s.home || s);
    let best = null;
    let bestGap = -1;
    for (let i = 0; i < 16; i++) {
      const p = { x: rand(FLOOR.x0 + 20, FLOOR.x1 - 20), y: rand(FLOOR.y0 + 4, FLOOR.y1 - 14) };
      const gap = people.length ? Math.min(...people.map((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 1.5))) : 0;
      if (gap > bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    return best;
  }

  // Put a family's sprites in a loose group around a point.
  arrange(sprites, center) {
    const n = sprites.length;
    sprites.forEach((s, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      s.home = {
        x: clamp(center.x + (col - (Math.min(n, 4) - 1) / 2) * 15 + rand(-2, 2), FLOOR.x0, FLOOR.x1),
        y: clamp(center.y + row * 10 + (col % 2) * 4, FLOOR.y0, FLOOR.y1),
      };
    });
  }

  // A family waiting in the doorway (during the form).
  placeAtDoor(sprites) {
    const n = sprites.length;
    sprites.forEach((s, i) => {
      s.x = DOOR_WAIT.x + (i - (n - 1) / 2) * 13;
      s.y = DOOR_WAIT.y + (i % 2) * 5;
      s.popAt = this.time + i * 0.12;
      s.wander = false;
    });
  }

  // Walk in through the front door to a spot on the floor, then mill around.
  enter(sprites, { fromDoor = true } = {}) {
    const center = this.randomSpot();
    this.arrange(sprites, center);
    sprites.forEach((s, i) => {
      if (fromDoor && s.y < DOOR_WAIT.y - 10) {
        s.x = DOOR.x + rand(-4, 4);
        s.y = DOOR.y + i * 6;
      }
      if (this.reducedMotion || !fromDoor) {
        s.x = s.home.x;
        s.y = s.home.y;
      } else {
        this.walkTo(s, s.home.x, s.home.y);
      }
      s.wander = true;
      s.nextMove = this.time + rand(4, 9);
    });
    return center;
  }

  newFlake(anywhere = false) {
    const pane = WINDOW_PANES[Math.floor(Math.random() * WINDOW_PANES.length)];
    return {
      x: rand(pane[0], pane[1]),
      y: anywhere ? rand(WINDOW_Y[0], WINDOW_Y[1]) : WINDOW_Y[0],
      pane,
      speed: rand(5, 11),
      drift: rand(-1.5, 1.5),
    };
  }

  // ---- loop ----
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    this.updateOverlay();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const c = this.camera;
    if (c.target) {
      const k = this.reducedMotion ? 1 : Math.min(1, dt * 3);
      // The goal follows the stage size, so a resize after a zoom still fits.
      const scale = this.baseScale() + c.target.zoom;
      c.x += (c.target.x - c.x) * k;
      c.y += (c.target.y - c.y) * k;
      c.scale += (scale - c.scale) * k;
      if (Math.abs(scale - c.scale) < 0.01) c.scale = scale;
      this.layout();
    }
    for (const s of this.sprites) {
      if (s.path) {
        const dx = s.path.x - s.x;
        const dy = s.path.y - s.y;
        const d = Math.hypot(dx, dy);
        const step = WALK_SPEED * dt;
        if (d <= step) {
          s.x = s.path.x;
          s.y = s.path.y;
          s.path = null;
          s.bob = 0;
        } else {
          s.x += (dx / d) * step;
          s.y += (dy / d) * step;
          if (Math.abs(dx) > 0.5) s.flip = dx < 0;
          s.bob = Math.abs(Math.sin(this.time * 12)) > 0.5 ? 1 : 0;
        }
      } else if (s.wander && this.time > s.nextMove && !this.reducedMotion) {
        if (s.host) {
          this.hostMove(s);
        } else {
          const home = s.home || { x: s.x, y: s.y };
          this.walkTo(s, clamp(home.x + rand(-12, 12), FLOOR.x0, FLOOR.x1), clamp(home.y + rand(-6, 6), FLOOR.y0, FLOOR.y1));
          s.nextMove = this.time + rand(5, 12);
        }
      }
    }
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += f.drift * dt;
      if (f.y > WINDOW_Y[1] || f.x < f.pane[0] || f.x > f.pane[1]) Object.assign(f, this.newFlake());
    }
    this.eggs?.update(dt);
  }

  draw() {
    const g = this.ctx;
    if (!this.room) return;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(this.room, 0, 0);
    this.eggs?.drawBack(g);

    // snow in the window, only on the glass, never over the frame or the menorah
    g.fillStyle = "#ffffff";
    for (const f of this.flakes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (this.glass.has(y * ROOM_W + x)) g.fillRect(x, y, 1, 1);
    }

    this.drawGlow(g);
    if (this.book && !this.bookHidden) g.drawImage(this.book, BOOK.x, BOOK.y);
    this.drawFlames(g);

    // shadows, then sprites from back to front
    const visible = this.sprites.filter((s) => s.img && this.time >= s.popAt);
    g.fillStyle = "rgba(50, 25, 10, 0.35)";
    for (const s of visible) {
      const w = Math.max(6, s.img.width - 4);
      g.beginPath();
      g.ellipse(Math.round(s.x), Math.round(s.y), w / 2, 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    visible.sort((a, b) => a.y - b.y);
    for (const s of visible) {
      const age = this.time - s.popAt;
      const hop = !this.reducedMotion && age < 0.25 ? Math.round(Math.sin((age / 0.25) * Math.PI) * 4) : 0;
      const x = Math.round(s.x - s.img.width / 2);
      const y = Math.round(s.y - s.img.height - s.bob - hop);
      if (s.react) {
        drawPet(g, s, x, y, this.time, this.reducedMotion);
      } else if (s.flip) {
        g.save();
        g.scale(-1, 1);
        g.drawImage(s.img, -x - s.img.width, y);
        g.restore();
      } else {
        g.drawImage(s.img, x, y);
      }
    }
    this.eggs?.drawFront(g);
    for (const s of visible) if (s.react) drawPetMark(g, s, this.time, this.reducedMotion);
    this.drawPress(g);
  }

  // Pixel corners around the thing that a finger or a mouse is on, like a cursor in an old game.
  // They show while the press lasts and for a moment after it. They start one pixel out, then close in.
  drawPress(g) {
    const p = this.press;
    if (!p) return;
    const age = p.t0 === null ? 0 : this.time - p.t0;
    if (age > PRESS.seconds || (p.sprite && !this.sprites.includes(p.sprite))) {
      this.press = null;
      return;
    }
    const b = p.sprite ? spriteBox(p.sprite, 0) : p.box;
    const lift = p.sprite ? p.sprite.bob : 0;
    const out = PRESS.gap + (this.reducedMotion || this.time - p.at > 0.08 ? 0 : 1);
    const x0 = Math.round(b.x) - out;
    const y0 = Math.round(b.y) - lift - out;
    const x1 = Math.round(b.x + b.w) - 1 + out;
    const y1 = Math.round(b.y + b.h) - lift - 1 + out;
    const a = PRESS.arm;
    // Each corner is two arms. The outline pass draws each arm one pixel bigger on every side.
    const corners = (grow, color) => {
      g.fillStyle = color;
      for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        g.fillRect((sx > 0 ? x : x - a + 1) - grow, y - grow, a + grow * 2, 1 + grow * 2);
        g.fillRect(x - grow, (sy > 0 ? y : y - a + 1) - grow, 1 + grow * 2, a + grow * 2);
      }
    };
    corners(1, PRESS.dark);
    corners(0, PRESS.gold);
  }

  flicker() {
    return 0.5 + 0.5 * Math.sin(this.time * 9) * Math.sin(this.time * 5.3 + 1);
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
    this.flames.forEach(({ x, y }, i) => {
      const state = this.eggs?.flame(i) ?? "lit";
      if (state === "out") return;
      const wave = Math.sin(this.time * (7 + i) + i * 1.7) + Math.sin(this.time * 3.1 + i);
      g.fillStyle = state === "new" ? "#f6b74a" : wave > 0 ? "#fff4c2" : "#ffd36b";
      g.fillRect(x, y, 1, 1);
      if (state === "lit" && wave > -0.6) {
        g.fillStyle = wave > 0.8 ? "#ffe9a0" : "#f6b74a";
        g.fillRect(x, y - 1, 1, 1);
      }
    });
  }

  // ---- HTML on top: bubbles, nametags, popovers ----
  pin(el, x, y) {
    el.style.left = `${(x / ROOM_W) * 100}%`;
    el.style.top = `${(y / ROOM_H) * 100}%`;
  }

  updateOverlay() {
    for (const s of this.sprites) {
      if (s.bubbleEl) this.pinBubble(s);
    }
    this.placeNames();
    for (const fam of this.families.values()) {
      if (!fam.tagEl) continue;
      const members = this.sprites.filter((s) => s.familyId === fam.id);
      if (!members.length) continue;
      const x = members.reduce((a, s) => a + s.x, 0) / members.length;
      const y = Math.max(...members.map((s) => s.y));
      this.pin(fam.tagEl, x, y + 3);
    }
    if (this.popEl && this.popSprite) this.pinPop();
  }

  // A bubble sits above its sprite, but it stays inside the stage near an edge.
  pinBubble(s) {
    const { left, scale } = this.view;
    const gap = 8;
    const half = s.bubbleWidth / 2;
    const x = clamp(left + s.x * scale, gap + half, this.stage.clientWidth - gap - half);
    s.bubbleEl.style.left = `${x - left}px`;
    s.bubbleEl.style.top = `${((s.y - (s.img?.height || 30) - 3) / ROOM_H) * 100}%`;
  }

  // The editor popover sits above its sprite, but it stays inside the stage near an edge.
  pinPop() {
    const { popEl: el, popSprite: s } = this;
    const { left, top, scale } = this.view;
    const gap = 8;
    const x = left + s.x * scale;
    const y = top + (s.y - (s.img?.height || 30) - 4) * scale;
    const cx = clamp(x, gap + el.offsetWidth / 2, this.stage.clientWidth - gap - el.offsetWidth / 2);
    const bottom = clamp(y, gap + el.offsetHeight, this.stage.clientHeight - gap);
    el.style.left = `${cx - left}px`;
    el.style.top = `${bottom - top}px`;
  }

  say(sprite, text, seconds = 4) {
    if (sprite.bubbleEl) sprite.bubbleEl.remove();
    clearTimeout(sprite.bubbleTimer);
    if (!text) return;
    const el = document.createElement("div");
    el.className = "bubble";
    el.textContent = text;
    this.overlay.append(el);
    fitBubble(el);
    sprite.bubbleEl = el;
    sprite.bubbleWidth = el.offsetWidth;
    this.updateOverlay();
    if (seconds) {
      sprite.bubbleTimer = setTimeout(() => {
        el.remove();
        if (sprite.bubbleEl === el) sprite.bubbleEl = null;
      }, seconds * 1000);
    }
  }

  // A name label under a family. It shows on hover or for a few seconds after a tap.
  setTag(familyId, name, { seconds = 0 } = {}) {
    const fam = this.families.get(familyId);
    if (!fam) return;
    if (!fam.tagEl) {
      fam.tagEl = document.createElement("div");
      fam.tagEl.className = "tag";
      this.overlay.append(fam.tagEl);
    }
    fam.tagEl.textContent = name;
    clearTimeout(fam.tagTimer);
    if (seconds) fam.tagTimer = setTimeout(() => this.hideTag(familyId), seconds * 1000);
    this.updateOverlay();
  }

  hideTag(familyId) {
    const fam = this.families.get(familyId);
    if (!fam) return;
    clearTimeout(fam.tagTimer);
    fam.tagEl?.remove();
    fam.tagEl = null;
  }

  // A name moves down one row while it covers another name. Names go in order of their last row, so they do not jump.
  placeNames() {
    const named = this.sprites.filter((s) => s.nameEl).sort((a, b) => a.nameRow - b.nameRow || a.x - b.x);
    const scale = this.view.scale;
    const placed = [];
    for (const s of named) {
      const w = s.nameSize.w / scale;
      const h = s.nameSize.h / scale;
      const rowH = Math.max(9, h + 1);
      const clashes = (row) => placed.some((p) => Math.abs(p.x - s.x) < (p.w + w) / 2 + 1 && Math.abs(p.top - (s.y + 3 + row * rowH)) < Math.max(p.h, h));
      let row = 0;
      while (row < 3 && clashes(row)) row++;
      s.nameRow = row;
      placed.push({ x: s.x, w, h, top: s.y + 3 + row * rowH });
      this.pin(s.nameEl, s.x, s.y + 3 + row * rowH);
    }
  }

  // One name under each sprite, for the hosts.
  showNames(sprites, seconds = 0) {
    for (const s of sprites) {
      if (!s.nameEl) {
        s.nameEl = document.createElement("div");
        s.nameEl.className = "tag";
        s.nameEl.textContent = s.name;
        this.overlay.append(s.nameEl);
        s.nameSize = { w: s.nameEl.offsetWidth, h: s.nameEl.offsetHeight };
        s.nameRow = 0;
      }
      clearTimeout(s.nameTimer);
      if (seconds) s.nameTimer = setTimeout(() => this.hideNames([s]), seconds * 1000);
    }
    this.updateOverlay();
  }

  hideNames(sprites) {
    for (const s of sprites) {
      clearTimeout(s.nameTimer);
      s.nameEl?.remove();
      s.nameEl = null;
    }
  }

  openPop(sprite, el) {
    this.closePop();
    this.popSprite = sprite;
    this.popEl = el;
    el.classList.add("pop");
    el.addEventListener("pointerup", (e) => e.stopPropagation());
    this.overlay.append(el);
    this.updateOverlay();
  }

  closePop() {
    this.popEl?.remove();
    this.popEl = null;
    this.popSprite = null;
  }

  // The sprite under a point. A tap prefers a sprite it hits. Then, with `min` (the smallest target in room
  // pixels, for a finger), it takes the nearest sprite whose area grown to that size holds the point.
  spriteAt(x, y, min = 0) {
    const shown = this.sprites.filter((s) => s.img && this.time >= s.popAt);
    const hits = shown.filter((s) => inside(spriteBox(s, 2), x, y));
    // In a crowd, a tap prefers your own family, then whoever stands in front.
    hits.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.y - a.y);
    if (hits.length || !min) return hits[0] || null;
    return nearest(shown.map((s) => ({ sprite: s, ...spriteBox(s, 2) })), x, y, min, 0)?.sprite || null;
  }

  // The hidden thing under a point, or null. `min` works as in spriteAt.
  hotspotAt(x, y, min = 0) {
    return this.hotspotBoxAt(x, y, min)?.id ?? null;
  }

  hotspotBoxAt(x, y, min = 0) {
    const open = HOTSPOTS.filter((s) => s.id !== "book" || (this.book && !this.bookHidden));
    return pickSpot(open, x, y, min);
  }

  // The smallest target in room pixels for this pointer at the camera's scale now.
  tapMin(pointerType) {
    return (pointerType === "mouse" ? TAP_PX.mouse : TAP_PX.touch) / this.view.scale;
  }

  // What a pointer event points at: { sprite } or { spot }, or null.
  targetAt(e) {
    const p = this.toRoom(e.clientX, e.clientY);
    const min = this.tapMin(e.pointerType);
    const sprite = this.spriteAt(p.x, p.y, min);
    if (sprite) return { sprite };
    const spot = this.hotspotBoxAt(p.x, p.y, min);
    return spot ? { spot } : null;
  }

  // Show the corners on a target. `held` keeps them while the finger is down.
  showPress(target, held) {
    if (!target) {
      this.press = null;
      return;
    }
    const same = this.press && (target.sprite ? this.press.sprite === target.sprite : this.press.box === target.spot);
    this.press = {
      sprite: target.sprite || null,
      box: target.spot || null,
      at: same ? this.press.at : this.time,
      t0: held ? null : this.time,
    };
  }

  handlePress(e) {
    if (this.popEl && this.popEl.contains(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.showPress(this.targetAt(e), true);
  }

  // Where a box in room pixels is on the screen now.
  roomRect({ x, y, w, h }) {
    const r = this.stage.getBoundingClientRect();
    const v = this.view;
    return new DOMRect(r.left + v.left + x * v.scale, r.top + v.top + y * v.scale, w * v.scale, h * v.scale);
  }

  // Where the book's cover is on the screen now.
  bookRect() {
    const r = this.stage.getBoundingClientRect();
    const v = this.view;
    return new DOMRect(r.left + v.left + BOOK.x * v.scale, r.top + v.top + BOOK.y * v.scale, BOOK.w * v.scale, BOOK.h * v.scale);
  }

  handleTap(e) {
    if (this.popEl && this.popEl.contains(e.target)) return;
    const target = this.targetAt(e);
    this.showPress(target, false);
    if (target?.sprite) {
      this.onTap(target.sprite);
      return;
    }
    this.closePop();
    if (target?.spot) this.onHotspot(target.spot.id);
  }
}

// A long line wraps into two balanced lines, but the box keeps the full max-width. So the box shrinks to its widest line.
// The pop animation scales the box, so it waits until the measure is done.
function fitBubble(el) {
  el.style.animation = "none";
  const range = document.createRange();
  range.selectNodeContents(el);
  const widest = Math.max(0, ...[...range.getClientRects()].map((r) => r.width));
  const css = getComputedStyle(el);
  const sides = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((a, k) => a + parseFloat(css[k]), 0);
  if (widest) el.style.width = `${Math.ceil(widest + sides) + 1}px`;
  el.style.animation = "";
}

const inside = (b, x, y) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

// A sprite's box in room pixels, `slack` pixels bigger on each side.
function spriteBox(s, slack) {
  const w = s.img.width;
  const h = s.img.height;
  return { x: s.x - w / 2 - slack, y: s.y - h - slack, w: w + slack * 2, h: h + slack * 2 };
}

// Grows a box to `min` room pixels across and down, and by `pad` pixels or more on each side.
function grow(b, min, pad) {
  const px = Math.max(pad, (min - b.w) / 2);
  const py = Math.max(pad, (min - b.h) / 2);
  return { x: b.x - px, y: b.y - py, w: b.w + px * 2, h: b.h + py * 2 };
}

// Of the boxes whose grown area holds the point, the one nearest to it. The distance is to the edge of the box,
// so a tap on a thing always finds it, and a tap in the gap between two things finds the closer one.
// When the point is inside two boxes, the nearer center wins.
function nearest(boxes, x, y, min, pad) {
  let best = null;
  let bestEdge = Infinity;
  let bestCenter = Infinity;
  for (const b of boxes) {
    if (!inside(grow(b, min, pad), x, y)) continue;
    const edge = Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
    const center = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
    if (edge < bestEdge || (edge === bestEdge && center < bestCenter)) {
      best = b;
      bestEdge = edge;
      bestCenter = center;
    }
  }
  return best;
}

// The hidden thing that a tap at (x, y) finds, with `min` as in Scene.spriteAt. The small things in front come
// first, and the nearest one wins. A "back" thing (the window) takes a tap only inside its own box.
export function pickSpot(spots, x, y, min = 0) {
  return nearest(spots.filter((s) => !s.back), x, y, min, TAP_PAD) || spots.find((s) => s.back && inside(s, x, y)) || null;
}

function roomPixels(room) {
  const canvas = document.createElement("canvas");
  canvas.width = ROOM_W;
  canvas.height = ROOM_H;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(room, 0, 0);
  return ctx.getImageData(0, 0, ROOM_W, ROOM_H).data;
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

// The window glass is the dark blue night sky and the snow on it.
function glassMask(data) {
  const glass = new Set();
  for (let y = WINDOW_Y[0]; y < WINDOW_Y[1]; y++) {
    for (const [x0, x1] of WINDOW_PANES) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * ROOM_W + x) * 4;
        const [r, gr, b] = [data[i], data[i + 1], data[i + 2]];
        if (b > r + 10 || (r > 200 && gr > 200 && b > 200)) glass.add(y * ROOM_W + x);
      }
    }
  }
  return glass;
}
