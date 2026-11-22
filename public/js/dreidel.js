// The hidden dreidel game. Two small dreidels stand on the window sill, beside the menorah.
// A tap on one grows it to fill the screen. A tap spins it: it whirrs, slows, wobbles, and falls on one side.
// The side is random, and each letter has its meaning, with a small pile of gelt that changes.

import { W, H, FLOOR, FACES, LENGTH, drawRoom, drawDreidel, drawFlake, drawShadow, drawGelt, drawLetter, drawSpeed, lowest, PANES, PANE_Y } from "./dreidel-art.js";
import { DreidelSound } from "./dreidel-sound.js";

const CSS = "/dreidel.css";
const GROW_MS = 520;
const CLOSE_MS = 320;
const FADE_MS = 180;
const EASE = "cubic-bezier(0.3, 0.1, 0.3, 1)";
const CX = 44; // where the point of the standing dreidel is, in canvas pixels
const QUARTER = Math.PI / 2;
const DEG = Math.PI / 180;

// The spin, in seconds.
const SPIN_S = 2.8;
const FALL_S = 0.34;
const BOUNCE_S = 0.32;
const LIFT_S = 0.22;
const WOBBLE = 15 * DEG; // the biggest lean before it falls

// The gelt at the start. Nothing here is real money.
const POT = 4;
const YOU = 8;

const h = (tag, cls, ...children) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children);
  return el;
};

const ease = {
  out: (u) => 1 - (1 - u) ** 2,
  in: (u) => u * u,
};

export class Dreidel {
  constructor({ sound, reducedMotion }) {
    this.sound = new DreidelSound(sound);
    this.reducedMotion = reducedMotion;
    this.el = null;
    this.isOpen = false;
    this.busy = false;
    this.session = 0;
    // A test can set { face: "gimel", speed: 8 } to choose the side and run the clock faster.
    this.rig = null;
    this.pot = POT;
    this.you = YOU;
    this.face = null;
    this.spins = 0;
    this.pose = { x: CX, theta: 0, tilt: 0, hop: 0 };
    this.motion = null;
    this.flakes = Array.from({ length: 16 }, () => newFlake(true));
    this.ignoreClicksUntil = 0;
  }

  // ---- open and close ----
  // from: a function that returns where the small dreidel is on the screen now.
  async open(from) {
    if (this.isOpen) return;
    const session = ++this.session;
    this.from = from;
    this.isOpen = true;
    this.busy = true;
    this.ignoreClicksUntil = performance.now() + 400;
    this.returnFocus = document.activeElement;
    await this.styles();
    if (session !== this.session) return;

    this.build();
    this.stopAnims();
    this.motion = null;
    if (this.state !== "result") this.stand(Math.floor(Math.random() * 4));
    this.layout();
    this.text();
    this.el.hidden = false;
    document.getElementById("app")?.setAttribute("inert", "");
    document.addEventListener("keydown", this.onKey);
    addEventListener("resize", this.onResize);
    this.last = performance.now();
    this.loop();

    if (this.reducedMotion) {
      await this.play([
        this.shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS }),
        this.card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS }),
      ]);
    } else {
      const start = this.fromTransform();
      await this.play([
        this.shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GROW_MS }),
        this.card.animate(
          [{ transform: start, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1 }],
          { duration: GROW_MS, easing: EASE },
        ),
      ]);
    }
    if (session !== this.session) return;
    this.busy = false;
    this.el.focus({ preventScroll: true });
  }

  async close() {
    if (!this.isOpen) return;
    const session = ++this.session;
    this.isOpen = false;
    this.busy = true;
    this.sound.stop();
    // A close in the middle of a spin skips to the end, so the next open shows the result.
    if (this.motion) this.finishSpin();
    if (this.el && !this.el.hidden) {
      this.stopAnims();
      const end = this.reducedMotion ? null : this.fromTransform();
      await this.play([
        this.shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: end ? CLOSE_MS : FADE_MS, fill: "forwards" }),
        this.card.animate(
          end ? [{ transform: "none", opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: end, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }],
          { duration: end ? CLOSE_MS : FADE_MS, easing: "ease-in", fill: "forwards" },
        ),
      ]);
      if (session !== this.session) return;
    }
    this.stopAnims();
    if (this.el) this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    document.getElementById("app")?.removeAttribute("inert");
    document.removeEventListener("keydown", this.onKey);
    removeEventListener("resize", this.onResize);
    this.busy = false;
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  // The card moves from the small dreidel on the sill: the big dreidel's box lands on the small one.
  fromTransform() {
    const s = this.from();
    const c = this.card.getBoundingClientRect();
    const k = this.k;
    const pad = this.canvas.getBoundingClientRect();
    const box = { left: pad.left + (CX - 11) * k, top: pad.top + (FLOOR - LENGTH - 1) * k, width: 22 * k, height: (LENGTH + 2) * k };
    const scale = s.height / box.height;
    const x = s.left + s.width / 2 - (c.left + (box.left + box.width / 2 - c.left) * scale);
    const y = s.top - (c.top + (box.top - c.top) * scale);
    return `translate(${x}px, ${y}px) scale(${scale})`;
  }

  play(anims) {
    this.anims = anims;
    return Promise.all(anims.map((a) => a.finished)).catch(() => {});
  }

  stopAnims() {
    for (const a of this.anims || []) a.cancel();
    this.anims = [];
  }

  styles() {
    this.css ??= new Promise((resolve) => {
      const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: CSS });
      link.onload = link.onerror = () => resolve();
      document.head.append(link);
    });
    return this.css;
  }

  // ---- the DOM ----
  build() {
    if (this.el) return;
    this.onKey = (e) => this.key(e);
    this.onResize = () => this.layout();
    this.shade = h("div", "dreidel-shade");
    this.canvas = h("canvas", "dreidel-canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    this.image = this.ctx.createImageData(W, H);
    this.px = new Uint32Array(this.image.data.buffer);
    this.room = new Uint32Array(W * H);
    drawRoom(this.room);

    this.letter = h("canvas", "dreidel-letter");
    this.letter.width = this.letter.height = 14;
    this.letter.setAttribute("aria-hidden", "true");
    this.nameEl = h("p", "dreidel-name");
    this.saysEl = h("p", "dreidel-says");
    this.potEl = h("span", "dreidel-pot");
    this.youEl = h("span", "dreidel-you");
    this.words = h("div", "dreidel-words", this.nameEl, this.saysEl);
    this.words.setAttribute("aria-live", "polite");
    const panel = h("div", "dreidel-panel", h("div", "dreidel-result", this.letter, this.words), h("div", "dreidel-gelt", this.potEl, this.youEl));
    this.card = h("button", "dreidel-card", this.canvas, panel);
    this.card.type = "button";
    this.card.setAttribute("aria-label", "Spin the dreidel");
    this.card.setAttribute("aria-describedby", "dreidel-words");
    this.words.id = "dreidel-words";
    this.closeBtn = h("button", "dreidel-close");
    this.closeBtn.type = "button";
    this.closeBtn.setAttribute("aria-label", "Close the dreidel game");
    this.closeBtn.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M5 5l14 14M19 5L5 19"></path></svg>';
    this.el = h("div", "dreidel", this.shade, h("div", "dreidel-stage", this.card), this.closeBtn);
    this.el.hidden = true;
    this.el.tabIndex = -1;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.setAttribute("aria-label", "Dreidel game");
    document.body.append(this.el);

    this.closeBtn.addEventListener("click", () => this.close());
    this.card.addEventListener("click", (e) => {
      e.stopPropagation();
      if (performance.now() < this.ignoreClicksUntil) return;
      this.spin();
    });
    // A tap outside the play area closes the game.
    this.el.addEventListener("click", (e) => {
      if (performance.now() < this.ignoreClicksUntil || e.target.closest("button")) return;
      this.close();
    });
  }

  // The biggest whole-number scale that fits the canvas and the words under it.
  layout() {
    if (!this.el) return;
    const fit = (panel) => Math.max(1, Math.min(Math.floor((innerWidth - 32) / W), Math.floor((innerHeight - 64 - panel - 40) / H)));
    let k = fit(140);
    if (k >= 7) k = Math.max(6, fit(190));
    this.k = k;
    this.el.style.setProperty("--k", k);
    this.el.classList.toggle("big", k >= 7);
    this.el.style.setProperty("--card-w", `${W * k}px`);
    this.el.style.setProperty("--canvas-h", `${H * k}px`);
  }

  // The words under the dreidel: a hint before the first spin, then the letter and what it means.
  text() {
    const face = this.state === "result" ? FACES[this.face] : null;
    this.el.dataset.state = this.state;
    this.el.dataset.face = face ? face.id : "";
    this.letter.hidden = !face;
    if (face) drawLetter(this.letter.getContext("2d"), face.id);
    this.nameEl.textContent = face ? face.name : this.state === "spinning" ? "Spinning..." : "Tap to spin";
    this.saysEl.textContent = face ? face.says : this.state === "spinning" ? "" : "Spin the dreidel and see where it lands.";
    this.potEl.textContent = `Pot: ${this.pot} gelt`;
    this.youEl.textContent = `You: ${this.you} gelt`;
  }

  key(e) {
    if (e.key === "Escape") this.close();
    else if ((e.key === " " || e.key === "Enter") && !e.target.closest?.("button")) this.spin();
    else return;
    e.preventDefault();
  }

  // ---- the game ----
  stand(k) {
    this.face = k;
    this.state = "idle";
    Object.assign(this.pose, { x: CX, theta: -k * QUARTER, tilt: 0, hop: 0 });
  }

  spin() {
    if (!this.isOpen || this.busy || this.motion) return;
    const rig = this.rig || {};
    const k = rig.face ? FACES.findIndex((f) => f.id === rig.face) : Math.floor(Math.random() * 4);
    // An empty pot gets two coins from the table, and a guest with no gelt gets five more.
    if (this.pot < 2) this.pot += 2;
    if (this.you < 1) this.you += 5;
    this.state = "spinning";
    this.spins++;
    this.text();
    if (this.reducedMotion) return this.quickSpin(k);

    const p = this.pose;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const lifted = Math.abs(p.tilt) > 0.01;
    const lift = lifted ? LIFT_S : 0;
    // Turn a whole number of times, plus the part that ends with side k to the front.
    const turns = 2.4 + Math.random() * 0.7;
    const start = p.theta % (2 * Math.PI);
    const end = -k * QUARTER;
    let total = end - start;
    total += Math.round((turns * SPIN_S * Math.PI - total) / (2 * Math.PI)) * 2 * Math.PI;
    // The wobble goes around faster as the dreidel slows, and ends leaning the way it falls.
    const f0 = 1.7;
    const f1 = 1.4;
    const phaseAt = (t) => 2 * Math.PI * (f0 * t + f1 * (t - (t * t) / (2 * SPIN_S)));
    const offset = dir * QUARTER - phaseAt(SPIN_S);
    this.motion = { k, dir, lift, from: { x: p.x, tilt: p.tilt }, start, total, phaseAt, offset, t: 0, peak: 0, clacked: 0 };
    if (lifted) this.sound.lift();
    const speed = this.rig?.speed || 1;
    this.sound.whirr(SPIN_S / speed, (t) => (total / (2 * Math.PI)) * (2 / SPIN_S) * (1 - (t * speed) / SPIN_S) * speed);
  }

  // With reduced motion, the dreidel fades out and back in on its side, with no spin.
  async quickSpin(k) {
    this.busy = true;
    const session = this.session;
    const out = this.canvas.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: FADE_MS, fill: "forwards" });
    await this.play([out]);
    out.cancel();
    if (session !== this.session) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.lie(k, dir);
    this.sound.clack(0.8);
    this.settle(k);
    this.busy = false;
    this.play([this.canvas.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: FADE_MS })]);
  }

  lie(k, dir) {
    Object.assign(this.pose, { theta: -k * QUARTER, tilt: dir * QUARTER, x: CX - dir * 22, hop: 0 });
  }

  // Moves the pose along the spin. Called each frame with the time since the last frame.
  step(dt) {
    const m = this.motion;
    if (!m) return;
    m.t += dt;
    const p = this.pose;
    let t = m.t;
    if (t < m.lift) {
      // pick the fallen dreidel up and stand it on its point
      const u = ease.out(t / m.lift);
      p.tilt = m.from.tilt * (1 - u);
      p.x = m.from.x + (CX - m.from.x) * u;
      p.hop = Math.sin(u * Math.PI) * 4;
      return;
    }
    t -= m.lift;
    p.hop = 0;
    if (t < SPIN_S) {
      const u = t / SPIN_S;
      p.x = CX;
      p.theta = m.start + m.total * ease.out(u);
      const grow = Math.max(0, (u - 0.38) / 0.62) ** 1.6;
      const phase = m.phaseAt(t) + m.offset;
      p.tilt = WOBBLE * grow * Math.sin(phase);
      // a wooden tick each time the wobble leans out
      const peak = Math.floor((phase - Math.PI / 2) / Math.PI);
      if (peak !== m.peak) {
        m.peak = peak;
        if (grow > 0.12) this.sound.tick(grow);
      }
      return;
    }
    t -= SPIN_S;
    p.theta = m.start + m.total;
    if (t < FALL_S) {
      const u = ease.in(t / FALL_S);
      p.tilt = m.dir * (WOBBLE + (QUARTER - WOBBLE) * u);
      p.x = CX - m.dir * 22 * u * u;
      return;
    }
    if (!m.clacked) {
      m.clacked = 1;
      this.sound.clack(1);
    }
    t -= FALL_S;
    if (t < BOUNCE_S) {
      // one small bounce on the sill
      const u = t / BOUNCE_S;
      p.tilt = m.dir * (QUARTER - 9 * DEG * Math.sin(Math.min(1, u / 0.7) * Math.PI));
      p.x = CX - m.dir * 22;
      if (u >= 0.7 && m.clacked === 1) {
        m.clacked = 2;
        this.sound.clack(0.35);
      }
      return;
    }
    this.finishSpin();
  }

  finishSpin() {
    const { k, dir } = this.motion;
    this.motion = null;
    this.lie(k, dir);
    this.settle(k);
  }

  // The result: the letter, what it means, and the gelt.
  settle(k) {
    this.face = k;
    this.state = "result";
    const id = FACES[k].id;
    if (id === "gimel") {
      this.you += this.pot;
      this.pot = 0;
    } else if (id === "hei") {
      const half = Math.ceil(this.pot / 2);
      this.you += half;
      this.pot -= half;
    } else if (id === "shin" && this.you > 0) {
      this.you -= 1;
      this.pot += 1;
    }
    if (this.isOpen) this.sound.result(id);
    this.text();
  }

  // ---- drawing ----
  loop() {
    cancelAnimationFrame(this.raf);
    const frame = (now) => {
      const speed = this.rig?.speed || 1;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt * speed);
      this.draw(dt);
      if (!this.el.hidden) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  draw(dt) {
    const px = this.px;
    px.set(this.room);
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += f.drift * dt;
      if (f.y > PANE_Y[1] || f.x < f.pane[0] || f.x > f.pane[1]) Object.assign(f, newFlake());
      drawFlake(px, f.x, f.y);
    }
    drawGelt(px, 15, 51, this.pot, -1);
    drawGelt(px, 73, 51, this.you, 1);
    const p = this.pose;
    const lean = Math.abs(Math.sin(p.tilt));
    drawShadow(px, p.x + Math.sin(p.tilt) * LENGTH * 0.42, FLOOR, 7 + lean * 30);
    const y = FLOOR - lowest(p.theta, p.tilt) - p.hop;
    drawDreidel(px, { x: p.x, y, theta: p.theta, tilt: p.tilt });
    const m = this.motion;
    const u = m ? (m.t - m.lift) / SPIN_S : 1;
    if (u > 0 && u < 0.55) drawSpeed(px, p.x, y, p.theta, 1 - u / 0.55);
    this.ctx.putImageData(this.image, 0, 0);
  }
}

function newFlake(anywhere = false) {
  const pane = PANES[Math.floor(Math.random() * PANES.length)];
  return {
    x: pane[0] + Math.random() * (pane[1] - pane[0]),
    y: anywhere ? PANE_Y[0] + Math.random() * (PANE_Y[1] - PANE_Y[0]) : PANE_Y[0],
    pane,
    speed: 4 + Math.random() * 5,
    drift: Math.random() * 2 - 1,
  };
}
