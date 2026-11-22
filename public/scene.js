import { drawFigure, hostImage, loadImage, loadSprites, lookImage } from "./sprites.js";

const ROOM_W = 256;
const ROOM_H = 192;
// Places in room.png, in room pixels. Positions are where a figure's feet touch the floor.
const FLOOR = { x0: 98, x1: 196, y0: 100, y1: 168 };
const DOOR = { x: 127, outside: 204, inside: 172 };
const WINDOW = { x0: 165, y0: 9, x1: 238, y1: 45 };
const FIRE = { x: 112, y: 44, w: 32, h: 24 };
const CANDLES = { x0: 188, y0: 34, x1: 212, y1: 46 };
const HOSTS = [
  { id: "jessica", x: 172, y: 132 },
  { id: "jesse", x: 187, y: 130 },
  { id: "daughter", x: 104, y: 160 },
  { id: "son", x: 119, y: 162 },
];
const HOST_NAME = "Jesse & Jessica";
const HOST_LINES = ["Pass the latkes!", "Who's winning at dreidel?", "Happy Hanukkah!", "Mind the gelt!", "So glad you're here."];
const SPEED = { adult: 20, kid: 22, baby: 14, dog: 28, cat: 26 };
const ARRIVAL_GAP_MS = 350;
const LABEL_MS = 2600;
const HOST_LINE_MS = 4000;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Scene {
  constructor({ canvas, frame, overlay, isMine, onTapMine }) {
    this.canvas = canvas;
    this.frame = frame;
    this.overlay = overlay;
    this.isMine = isMine;
    this.onTapMine = onTapMine;
    this.ctx = canvas.getContext("2d");
    this.actors = new Map();
    this.households = new Map();
    this.arrivals = [];
    this.label = null;
    this.hostLine = null;
    this.nextHostLine = performance.now() + rand(4000, 9000);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scale = 0;
    this.cssScale = 1;
    this.last = 0;
  }

  async start() {
    const [room] = await Promise.all([loadImage("/art/room.png"), loadSprites()]);
    this.room = room;
    const pixels = roomPixels(room);
    this.glass = glassMask(pixels);
    this.flames = flamePixels(pixels);
    this.snow = Array.from({ length: 30 }, () => newFlake(true));
    for (const host of HOSTS) this.actors.set(`host:${host.id}`, newHost(host));
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

  // Families already at the party when the page opens stand in their groups. Later ones walk in.
  setParty(families, { arrive }) {
    const seen = new Set();
    for (const family of families) {
      this.households.set(family.id, family.household);
      for (const member of family.members) seen.add(member.id);
      const known = family.members.filter((m) => this.actors.has(m.id));
      for (const member of known) Object.assign(this.actors.get(member.id), { look: member.look, bubble: member.bubble });
      const fresh = family.members.filter((m) => !this.actors.has(m.id) && !this.arrivals.some((a) => a.member.id === m.id));
      if (!fresh.length) continue;
      if (arrive) this.queueArrival(family, fresh);
      else this.placeFamily(family, fresh);
    }
    for (const [id, actor] of this.actors) if (!actor.host && !seen.has(id)) this.actors.delete(id);
  }

  placeFamily(family, members) {
    const homes = groupAround(this.openSpot(), members.length);
    members.forEach((member, i) => {
      const actor = newActor(family.id, member, homes[i]);
      this.actors.set(member.id, actor);
    });
  }

  queueArrival(family, members, onChime) {
    const homes = groupAround(this.openSpot(), members.length);
    const start = Math.max(performance.now(), this.arrivals.at(-1)?.at ?? 0);
    members.forEach((member, i) => {
      this.arrivals.push({ family, member, home: homes[i], at: start + i * ARRIVAL_GAP_MS, onChime: i === 0 ? onChime : null });
    });
  }

  welcome(family, onChime) {
    this.households.set(family.id, family.household);
    this.queueArrival(family, family.members, onChime);
  }

  updateMember(memberId, change) {
    const actor = this.actors.get(memberId);
    if (actor) Object.assign(actor, change);
  }

  familyCount() {
    return new Set([...this.actors.values()].filter((a) => !a.host).map((a) => a.familyId)).size;
  }

  // The open spot farthest from everyone already in the room, so families spread out.
  openSpot() {
    const people = [...this.actors.values()].map((a) => a.home);
    for (const a of this.arrivals) people.push(a.home);
    let best = null;
    let bestGap = -1;
    for (let i = 0; i < 20; i++) {
      const p = { x: rand(FLOOR.x0 + 16, FLOOR.x1 - 16), y: rand(FLOOR.y0 + 4, FLOOR.y1 - 12) };
      const gap = people.length ? Math.min(...people.map((q) => Math.hypot(q.x - p.x, (q.y - p.y) * 1.5))) : 0;
      if (gap > bestGap) [best, bestGap] = [p, gap];
    }
    return best;
  }

  tick(now) {
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.releaseArrivals(now);
    for (const actor of this.actors.values()) this.step(actor, dt, now);
    for (const flake of this.snow) fall(flake, dt);
    this.speakAsHost(now);
    this.draw(now);
    requestAnimationFrame((t) => this.tick(t));
  }

  releaseArrivals(now) {
    while (this.arrivals.length && this.arrivals[0].at <= now) {
      const { family, member, home, onChime } = this.arrivals.shift();
      const actor = newActor(family.id, member, home);
      if (!this.reducedMotion) {
        actor.x = DOOR.x + rand(-3, 3);
        actor.y = DOOR.outside;
        actor.path = [{ x: DOOR.x + rand(-4, 4), y: DOOR.inside }, { ...home }];
        actor.entering = true;
      }
      this.actors.set(member.id, actor);
      onChime?.();
    }
  }

  step(actor, dt, now) {
    const target = actor.path?.[0];
    if (!target) {
      actor.bob = 0;
      if (!this.reducedMotion && now >= actor.nextMove) {
        actor.path = [{ x: clamp(actor.home.x + rand(-12, 12), FLOOR.x0, FLOOR.x1), y: clamp(actor.home.y + rand(-6, 6), FLOOR.y0, FLOOR.y1) }];
        actor.nextMove = now + rand(5000, 12000);
      }
      return;
    }
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    const distance = Math.hypot(dx, dy);
    const move = (SPEED[actor.kind] ?? SPEED.adult) * dt;
    if (distance <= move) {
      actor.x = target.x;
      actor.y = target.y;
      actor.path.shift();
      if (!actor.path.length) {
        actor.path = null;
        actor.entering = false;
      }
      return;
    }
    actor.x += (dx / distance) * move;
    actor.y += (dy / distance) * move;
    if (Math.abs(dx) > 0.5) actor.flip = dx < 0;
    actor.bob = Math.floor(now / 110) % 2;
  }

  speakAsHost(now) {
    if (this.hostLine && this.hostLine.until < now) this.hostLine = null;
    if (this.reducedMotion || now < this.nextHostLine) return;
    const host = HOSTS[Math.floor(Math.random() * 2)];
    this.hostLine = { actorId: `host:${host.id}`, text: HOST_LINES[Math.floor(Math.random() * HOST_LINES.length)], until: now + HOST_LINE_MS };
    this.nextHostLine = now + rand(14000, 24000);
  }

  draw(now) {
    const { ctx, scale } = this;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.room, 0, 0);
    this.drawSnow();
    this.drawGlow(now);

    const sorted = [...this.actors.values()].sort((a, b) => a.y - b.y);
    ctx.fillStyle = "rgba(50, 25, 10, 0.35)";
    for (const actor of sorted) {
      const image = imageFor(actor);
      if (!image) continue;
      ctx.beginPath();
      ctx.ellipse(Math.round(actor.x), Math.round(actor.y), Math.max(3, (image.width - 4) / 2), 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const actor of sorted) drawFigure(ctx, imageFor(actor), actor.x, actor.y - actor.bob, { flip: actor.flip });
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

  drawGlow(now) {
    const { ctx } = this;
    const t = now / 1000;
    const flicker = 0.5 + 0.5 * Math.sin(t * 9) * Math.sin(t * 5.3 + 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffb050";
    ctx.globalAlpha = 0.06 + 0.06 * flicker;
    ctx.fillRect(FIRE.x, FIRE.y, FIRE.w, FIRE.h);
    ctx.globalAlpha = 0.05 + 0.05 * flicker;
    ctx.beginPath();
    ctx.ellipse(128, 88, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Each candle flame flickers on its own: a bright core and a tip that comes and goes.
    this.flames.forEach(({ x, y }, i) => {
      const wave = Math.sin(t * (7 + i) + i * 1.7) + Math.sin(t * 3.1 + i);
      ctx.fillStyle = wave > 0 ? "#fff4c2" : "#ffd36b";
      ctx.fillRect(x, y, 1, 1);
      if (wave > -0.6) {
        ctx.fillStyle = wave > 0.8 ? "#ffe9a0" : "#f6b74a";
        ctx.fillRect(x, y - 1, 1, 1);
      }
    });
  }

  drawBubbles(sorted, now) {
    if (this.label && this.label.until < now) this.label = null;
    const wanted = [];
    for (const actor of sorted) {
      if (this.label?.actorId === actor.id) {
        wanted.push({ actor, text: actor.host ? HOST_NAME : (this.households.get(actor.familyId) ?? ""), kind: "label" });
      } else if (this.hostLine?.actorId === actor.id) {
        wanted.push({ actor, text: this.hostLine.text, kind: "bubble" });
      } else if (actor.bubble && !actor.entering) {
        wanted.push({ actor, text: actor.bubble, kind: "bubble" });
      }
    }
    syncBubbles(this.overlay, wanted, (actor) => {
      const height = imageFor(actor)?.height ?? 30;
      return { left: actor.x * this.cssScale, top: (actor.y - height - 3) * this.cssScale };
    });
  }

  tap(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ROOM_W;
    const y = ((event.clientY - rect.top) / rect.height) * ROOM_H;
    const mine = (actor) => (!actor.host && this.isMine(actor.id) ? 1 : 0);
    // In a crowd, a tap prefers your own family, then whoever stands in front.
    const hit = [...this.actors.values()]
      .filter((actor) => {
        const image = imageFor(actor);
        if (!image) return false;
        return Math.abs(actor.x - x) <= image.width / 2 + 2 && y <= actor.y + 2 && y >= actor.y - image.height - 2;
      })
      .sort((a, b) => mine(b) - mine(a) || b.y - a.y)[0];
    if (!hit) return;
    if (!hit.host && this.isMine(hit.id)) return this.onTapMine(hit);
    this.label = { actorId: hit.id, until: performance.now() + LABEL_MS };
  }
}

function imageFor(actor) {
  return actor.host ? hostImage(actor.host) : lookImage(actor.kind, actor.look);
}

function newActor(familyId, member, home) {
  return {
    id: member.id,
    familyId,
    kind: member.kind,
    look: member.look,
    bubble: member.bubble ?? "",
    x: home.x,
    y: home.y,
    home,
    path: null,
    flip: Math.random() < 0.5,
    bob: 0,
    entering: false,
    nextMove: performance.now() + rand(2000, 8000),
  };
}

function newHost({ id, x, y }) {
  return { ...newActor("hosts", { id: `host:${id}`, kind: "adult", look: 0 }, { x, y }), host: id, flip: false };
}

// A loose group, up to 4 across, with every other figure a step forward.
function groupAround(center, count) {
  return Array.from({ length: count }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      x: clamp(center.x + (col - (Math.min(count, 4) - 1) / 2) * 15 + rand(-2, 2), FLOOR.x0, FLOOR.x1),
      y: clamp(center.y + row * 10 + (col % 2) * 4, FLOOR.y0, FLOOR.y1),
    };
  });
}

function newFlake(anywhere) {
  return {
    x: rand(WINDOW.x0, WINDOW.x1),
    y: anywhere ? rand(WINDOW.y0, WINDOW.y1) : WINDOW.y0,
    speed: rand(5, 11),
    drift: rand(-1.5, 1.5),
  };
}

function fall(flake, dt) {
  flake.y += flake.speed * dt;
  flake.x += flake.drift * dt;
  if (flake.y > WINDOW.y1 || flake.x < WINDOW.x0 || flake.x > WINDOW.x1) Object.assign(flake, newFlake(false));
}

function roomPixels(room) {
  const canvas = document.createElement("canvas");
  canvas.width = ROOM_W;
  canvas.height = ROOM_H;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(room, 0, 0);
  return ctx.getImageData(0, 0, ROOM_W, ROOM_H).data;
}

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

// Snow shows only on the window glass: the dark blue night sky and the snow on it, not the frame or the menorah.
function glassMask(data) {
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
