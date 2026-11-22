// The living room party. Draws at the room's native 256x192 pixels on a canvas,
// which CSS scales up with crisp pixels. Bubbles and nametags are HTML on top.

export const ROOM_W = 256;
export const ROOM_H = 192;

// Places in living-room.png, in room pixels.
const FLOOR = { x0: 98, x1: 196, y0: 100, y1: 168 };
const DOOR = { x: 127, y: 200 };
const DOOR_WAIT = { x: 128, y: 182 };
const WINDOW_PANES = [[167, 184], [190, 212], [217, 236]];
const WINDOW_Y = [9, 44];
const FIRE = { x: 112, y: 44, w: 32, h: 24 };
const CANDLES = { x0: 188, y0: 34, x1: 212, y1: 46 };

export const HOSTS = [
  { id: "jessica", name: "Jess", x: 172, y: 132 },
  { id: "jesse", name: "Jesse", x: 187, y: 130 },
  { id: "daughter", name: "Audrey", x: 98, y: 160 },
  { id: "son", name: "Eddie", x: 114, y: 162 },
];
export const HOST_LINES = [
  "Happy holidays!",
  "Happy New Year!",
  "We're so glad you're in our lives.",
  "Thank you for being here.",
  "We're grateful for you.",
  "So happy to see you!",
];

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
    this.layout();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- camera ----
  // A phone may crop the room's sides a lot to make it bigger. A wide screen crops at most a sliver.
  baseScale() {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    const crop = matchMedia("(min-width: 900px)").matches ? 1.06 : 1.35;
    return Math.max(2, Math.floor(Math.min((w * crop) / ROOM_W, h / ROOM_H)));
  }

  focus(x, y, zoom = 0) {
    this.camera.target = { x, y, scale: this.baseScale() + zoom };
    if (this.reducedMotion) Object.assign(this.camera, this.camera.target);
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

  removeFamily(id) {
    this.sprites = this.sprites.filter((s) => s.familyId !== id);
    this.families.delete(id);
  }

  walkTo(sprite, x, y) {
    sprite.path = { x, y };
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
      c.x += (c.target.x - c.x) * k;
      c.y += (c.target.y - c.y) * k;
      c.scale += (c.target.scale - c.scale) * k;
      if (Math.abs(c.target.scale - c.scale) < 0.01) c.scale = c.target.scale;
      this.layout();
    }
    for (const s of this.sprites) {
      if (s.path) {
        const dx = s.path.x - s.x;
        const dy = s.path.y - s.y;
        const d = Math.hypot(dx, dy);
        const step = 22 * dt;
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
        const home = s.home || { x: s.x, y: s.y };
        this.walkTo(s, clamp(home.x + rand(-12, 12), FLOOR.x0, FLOOR.x1), clamp(home.y + rand(-6, 6), FLOOR.y0, FLOOR.y1));
        s.nextMove = this.time + rand(5, 12);
      }
    }
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += f.drift * dt;
      if (f.y > WINDOW_Y[1] || f.x < f.pane[0] || f.x > f.pane[1]) Object.assign(f, this.newFlake());
    }
  }

  draw() {
    const g = this.ctx;
    if (!this.room) return;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(this.room, 0, 0);

    // snow in the window, only on the glass, never over the frame or the menorah
    g.fillStyle = "#ffffff";
    for (const f of this.flakes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (this.glass.has(y * ROOM_W + x)) g.fillRect(x, y, 1, 1);
    }

    // fire and candle flicker
    const flicker = 0.5 + 0.5 * Math.sin(this.time * 9) * Math.sin(this.time * 5.3 + 1);
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

    // each candle flame flickers on its own: a bright core and a tip that comes and goes
    this.flames.forEach(({ x, y }, i) => {
      const wave = Math.sin(this.time * (7 + i) + i * 1.7) + Math.sin(this.time * 3.1 + i);
      g.fillStyle = wave > 0 ? "#fff4c2" : "#ffd36b";
      g.fillRect(x, y, 1, 1);
      if (wave > -0.6) {
        g.fillStyle = wave > 0.8 ? "#ffe9a0" : "#f6b74a";
        g.fillRect(x, y - 1, 1, 1);
      }
    });

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
      if (s.flip) {
        g.save();
        g.scale(-1, 1);
        g.drawImage(s.img, -x - s.img.width, y);
        g.restore();
      } else {
        g.drawImage(s.img, x, y);
      }
    }
  }

  // ---- HTML on top: bubbles, nametags, popovers ----
  pin(el, x, y) {
    el.style.left = `${(x / ROOM_W) * 100}%`;
    el.style.top = `${(y / ROOM_H) * 100}%`;
  }

  updateOverlay() {
    for (const s of this.sprites) {
      if (s.bubbleEl) this.pin(s.bubbleEl, s.x, s.y - (s.img?.height || 30) - 3);
      if (s.nameEl) this.pin(s.nameEl, s.x, s.y + 3 + (s.nameRow || 0) * 9);
    }
    for (const fam of this.families.values()) {
      if (!fam.tagEl) continue;
      const members = this.sprites.filter((s) => s.familyId === fam.id);
      if (!members.length) continue;
      const x = members.reduce((a, s) => a + s.x, 0) / members.length;
      const y = Math.max(...members.map((s) => s.y));
      this.pin(fam.tagEl, x, y + 3);
    }
    if (this.popEl && this.popSprite) this.pin(this.popEl, this.popSprite.x, this.popSprite.y - (this.popSprite.img?.height || 30) - 4);
  }

  say(sprite, text, seconds = 4) {
    if (sprite.bubbleEl) sprite.bubbleEl.remove();
    clearTimeout(sprite.bubbleTimer);
    if (!text) return;
    const el = document.createElement("div");
    el.className = "bubble";
    el.textContent = text;
    this.overlay.append(el);
    sprite.bubbleEl = el;
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

  // One name under each sprite, for the hosts. Neighbors take turns on two rows so their names never overlap.
  showNames(sprites, seconds = 0) {
    [...sprites].sort((a, b) => a.x - b.x).forEach((s, i) => (s.nameRow = i % 2));
    for (const s of sprites) {
      if (!s.nameEl) {
        s.nameEl = document.createElement("div");
        s.nameEl.className = "tag";
        s.nameEl.textContent = s.name;
        this.overlay.append(s.nameEl);
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

  spriteAt(x, y) {
    const hits = this.sprites.filter((s) => {
      if (!s.img || this.time < s.popAt) return false;
      const w = s.img.width;
      return x >= s.x - w / 2 - 2 && x <= s.x + w / 2 + 2 && y >= s.y - s.img.height - 2 && y <= s.y + 2;
    });
    // In a crowd, a tap prefers your own family, then whoever stands in front.
    hits.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.y - a.y);
    return hits[0] || null;
  }

  handleTap(e) {
    if (this.popEl && this.popEl.contains(e.target)) return;
    const p = this.toRoom(e.clientX, e.clientY);
    const sprite = this.spriteAt(p.x, p.y);
    if (!sprite) {
      this.closePop();
      return;
    }
    this.onTap(sprite);
  }
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
