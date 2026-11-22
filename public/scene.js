import { DIRECTION, drawSprite, loadImage, loadSprites, spriteFor } from "./sprites.js";

const ROOM_W = 256;
const ROOM_H = 192;
// Open floor between the bookshelf, the rug edge, and the table, in room pixels (feet positions).
const FLOOR = { x0: 92, x1: 166, y0: 100, y1: 168 };
const DOOR = { x: 128, outside: 200, inside: 162 };
const WINDOW = { x0: 165, y0: 16, x1: 214, y1: 57 };
const FIRE = { x: 72, y: 66 };
const SPEED = { adult: 16, kid: 18, baby: 11, dog: 24, cat: 22 };
const ARRIVAL_GAP_MS = 450;
const LABEL_MS = 2600;

export class Scene {
  constructor({ canvas, frame, overlay, onTapMine }) {
    this.canvas = canvas;
    this.frame = frame;
    this.overlay = overlay;
    this.onTapMine = onTapMine;
    this.ctx = canvas.getContext("2d");
    this.actors = new Map();
    this.households = new Map();
    this.arrivals = [];
    this.label = null;
    this.snow = [];
    this.scale = 1;
    this.cssScale = 1;
    this.last = 0;
  }

  async start() {
    const [room] = await Promise.all([loadImage("/art/cabin.png"), loadSprites()]);
    this.room = room;
    this.glass = glassMask(room);
    this.snow = Array.from({ length: 22 }, () => newFlake(true));
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.frame.parentElement);
    this.canvas.addEventListener("click", (event) => this.tap(event));
    requestAnimationFrame((t) => this.tick(t));
  }

  // Draw at the next whole-number scale above the screen size, then let the browser smooth it down.
  // This fills the column and keeps the room pixels even, where a fractional nearest-neighbor scale would not.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.frame.parentElement.clientWidth;
    const scale = Math.max(1, Math.ceil((cssWidth * dpr) / ROOM_W));
    if (scale === this.scale && cssWidth === this.cssWidth) return;
    this.scale = scale;
    this.cssWidth = cssWidth;
    this.cssScale = cssWidth / ROOM_W;
    this.canvas.width = ROOM_W * scale;
    this.canvas.height = ROOM_H * scale;
    this.frame.style.width = `${cssWidth}px`;
    this.frame.style.height = `${(cssWidth * ROOM_H) / ROOM_W}px`;
  }

  // Families already at the party when the page opens are placed on the floor. Later ones walk in.
  setParty(families, { arrive }) {
    const seen = new Set();
    for (const family of families) {
      this.households.set(family.id, family.household);
      family.members.forEach((member, index) => {
        seen.add(member.id);
        const actor = this.actors.get(member.id);
        if (actor) {
          Object.assign(actor, { look: member.look, bubble: member.bubble });
        } else if (arrive) {
          this.queueArrival(family, member, index);
        } else {
          this.actors.set(member.id, newActor(family.id, member, randomFloorPoint()));
        }
      });
    }
    for (const id of this.actors.keys()) if (!seen.has(id)) this.actors.delete(id);
  }

  queueArrival(family, member, index) {
    if (this.arrivals.some((a) => a.member.id === member.id)) return;
    this.arrivals.push({ family, member, at: performance.now() + this.arrivals.length * ARRIVAL_GAP_MS, chime: index === 0 });
  }

  welcome(family, onChime) {
    this.households.set(family.id, family.household);
    family.members.forEach((member, index) => this.queueArrival(family, member, index));
    this.onChime = onChime;
  }

  updateMember(memberId, change) {
    const actor = this.actors.get(memberId);
    if (actor) Object.assign(actor, change);
  }

  familyCount() {
    return new Set([...this.actors.values()].map((a) => a.familyId)).size;
  }

  tick(now) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.releaseArrivals(now);
    for (const actor of this.actors.values()) step(actor, dt, now);
    for (const flake of this.snow) fall(flake, dt);
    this.draw(now);
    requestAnimationFrame((t) => this.tick(t));
  }

  releaseArrivals(now) {
    while (this.arrivals.length && this.arrivals[0].at <= now) {
      const { family, member, chime } = this.arrivals.shift();
      const actor = newActor(family.id, member, { x: DOOR.x + (Math.random() * 8 - 4), y: DOOR.outside });
      actor.entering = true;
      actor.tx = DOOR.x + (Math.random() * 16 - 8);
      actor.ty = DOOR.inside - Math.random() * 10;
      this.actors.set(member.id, actor);
      if (chime) this.onChime?.();
    }
  }

  draw(now) {
    const { ctx, scale } = this;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.room, 0, 0);
    this.drawSnow();
    this.drawFire(now);

    const sorted = [...this.actors.values()].sort((a, b) => a.y - b.y);
    for (const actor of sorted) {
      const bob = actor.moving && Math.floor(now / 160) % 2 ? -1 : 0;
      drawSprite(ctx, actor.kind, actor.look, actor.direction, actor.x, actor.y + bob);
    }
    this.drawBubbles(sorted, now);
  }

  drawSnow() {
    const { ctx } = this;
    ctx.fillStyle = "#ffffff";
    for (const flake of this.snow) {
      const x = Math.round(flake.x);
      const y = Math.round(flake.y);
      if (this.glass.has(y * ROOM_W + x)) ctx.fillRect(x, y, 1, 1);
    }
  }

  drawFire(now) {
    const { ctx } = this;
    const flicker = 0.1 + 0.05 * Math.sin(now / 90) + 0.04 * Math.sin(now / 37);
    const glow = ctx.createRadialGradient(FIRE.x, FIRE.y, 2, FIRE.x, FIRE.y + 30, 70);
    glow.addColorStop(0, `rgba(255, 170, 60, ${flicker})`);
    glow.addColorStop(1, "rgba(255, 170, 60, 0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.restore();
  }

  drawBubbles(sorted, now) {
    if (this.label && this.label.until < now) this.label = null;
    const wanted = [];
    for (const actor of sorted) {
      if (this.label?.memberId === actor.id) {
        wanted.push({ actor, text: this.households.get(actor.familyId) ?? "", kind: "label" });
      } else if (actor.bubble && !actor.entering) {
        wanted.push({ actor, text: actor.bubble, kind: "bubble" });
      }
    }
    syncBubbles(this.overlay, wanted, (actor) => {
      const { feet } = spriteFor(actor.kind, actor.look);
      const headY = actor.y - feet + 6;
      return { left: actor.x * this.cssScale, top: headY * this.cssScale };
    });
  }

  tap(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ROOM_W;
    const y = ((event.clientY - rect.top) / rect.height) * ROOM_H;
    const hit = [...this.actors.values()]
      .sort((a, b) => b.y - a.y)
      .find((a) => {
        const { feet } = spriteFor(a.kind, a.look);
        return Math.abs(a.x - x) <= 9 && y <= a.y + 2 && y >= a.y - feet + 6;
      });
    if (!hit) return;
    if (this.onTapMine?.(hit)) return;
    this.label = { memberId: hit.id, until: performance.now() + LABEL_MS };
  }
}

function newActor(familyId, member, at) {
  return {
    id: member.id,
    familyId,
    kind: member.kind,
    look: member.look,
    bubble: member.bubble ?? "",
    x: at.x,
    y: at.y,
    tx: at.x,
    ty: at.y,
    direction: DIRECTION.south,
    moving: false,
    restUntil: performance.now() + Math.random() * 3000,
    entering: false,
  };
}

function step(actor, dt, now) {
  const dx = actor.tx - actor.x;
  const dy = actor.ty - actor.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 0.5) {
    if (actor.moving) {
      actor.moving = false;
      actor.direction = DIRECTION.south;
      actor.restUntil = now + 1500 + Math.random() * 4500;
      if (actor.entering) {
        actor.entering = false;
        actor.restUntil = now + 400;
      }
    }
    if (now >= actor.restUntil) {
      const target = randomFloorPoint();
      actor.tx = target.x;
      actor.ty = target.y;
    }
    return;
  }

  const speed = SPEED[actor.kind] ?? SPEED.adult;
  const move = Math.min(distance, speed * dt);
  actor.x += (dx / distance) * move;
  actor.y += (dy / distance) * move;
  actor.moving = true;
  actor.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIRECTION.west : DIRECTION.east) : dy < 0 ? DIRECTION.north : DIRECTION.south;
}

function randomFloorPoint() {
  return {
    x: FLOOR.x0 + Math.random() * (FLOOR.x1 - FLOOR.x0),
    y: FLOOR.y0 + Math.random() * (FLOOR.y1 - FLOOR.y0),
  };
}

function newFlake(anywhere) {
  return {
    x: WINDOW.x0 + Math.random() * (WINDOW.x1 - WINDOW.x0),
    y: anywhere ? WINDOW.y0 + Math.random() * (WINDOW.y1 - WINDOW.y0) : WINDOW.y0,
    speed: 4 + Math.random() * 5,
    drift: Math.random() * Math.PI * 2,
  };
}

function fall(flake, dt) {
  flake.y += flake.speed * dt;
  flake.drift += dt * 1.5;
  flake.x += Math.sin(flake.drift) * dt * 2;
  if (flake.y > WINDOW.y1) Object.assign(flake, newFlake(false));
}

// Snow shows only on the window glass: bright or blue pixels, not the frame or the menorah.
function glassMask(room) {
  const canvas = document.createElement("canvas");
  canvas.width = ROOM_W;
  canvas.height = ROOM_H;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(room, 0, 0);
  const { data } = ctx.getImageData(0, 0, ROOM_W, ROOM_H);
  const glass = new Set();
  for (let y = WINDOW.y0; y < WINDOW.y1; y++) {
    for (let x = WINDOW.x0; x < WINDOW.x1; x++) {
      const i = (y * ROOM_W + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (b > r + 10 || (r > 200 && g > 200 && b > 200)) glass.add(y * ROOM_W + x);
    }
  }
  return glass;
}

function syncBubbles(overlay, wanted, position) {
  const existing = new Map([...overlay.children].map((el) => [el.dataset.key, el]));
  const keep = new Set();
  for (const { actor, text, kind } of wanted) {
    const key = `${kind}:${actor.id}`;
    keep.add(key);
    let el = existing.get(key);
    if (!el) {
      el = document.createElement("div");
      el.className = `bubble ${kind}`;
      el.dataset.key = key;
      overlay.appendChild(el);
    }
    if (el.textContent !== text) el.textContent = text;
    const { left, top } = position(actor);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.zIndex = String(Math.round(actor.y));
  }
  for (const [key, el] of existing) if (!keep.has(key)) el.remove();
}
