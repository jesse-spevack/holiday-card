// The hidden photo album. Nothing on the page points to it. A guest finds the small red book on the sofa
// and taps it. The book flies up, opens, and shows one photo from our year on each page.
// The photos and captions come from the Worker (/album/list), never from the repo.
// The book is pixel art like the room (album-art.js), and it moves in a few steps like a sprite.
// The small book on the sofa is public/assets/book.png. This extra draws it as a scene layer, and hides it while the album is open.

import { sideArt, coverArt, spriteArt, CORNER_SIZE, FLAKE_SIZE } from "./album-art.js";
import { h, loadCss, dialogRoot, PageBehind } from "../dom.js";
import { BOOK, BOOK_TAP } from "../room.js";
import { loadImage } from "../scene.js";

const CSS = "/album.css";
const TITLE = "Our 2026";
const FAMILY = "Jesse, Jess, Eddie & Audrey Spevack";
const FLY_MS = 480;
const OPEN_MS = 650;
const TURN_MS = 420;
const CLOSE_MS = 300;
const SWIPE_PX = 40;
const FLY = "steps(6, jump-end)";
const OPEN = "steps(6, jump-end)";
const SLIDE = "steps(4, jump-end)";
const TURN = "steps(5, jump-end)";
const FADE = "steps(4, jump-end)";
// About this many book pixels across one side.
const BOOK_PIXELS = 115;
const MAT = 2;
// A long caption takes the lines it needs, and the photo gets smaller.
// If the photo gets smaller than this share of its size with no caption, the caption font gets smaller, down to MIN_FONT.
const MIN_PHOTO = 0.6;
const MIN_FONT = 14;

export class Album {
  // bookRect: where the book is on screen now. showBook: show or hide the book in the room.
  constructor({ sound, reducedMotion, bookRect, showBook }) {
    this.sound = sound;
    this.reducedMotion = reducedMotion;
    this.bookRect = bookRect;
    this.showBook = showBook;
    this.el = null;
    this.list = null;
    this.photos = [];
    this.pages = [];
    this.at = 0;
    this.spread = false;
    this.isOpen = false;
    this.busy = false;
    this.session = 0;
    this.settle = null;
    this.down = null;
    this.ignoreClicksUntil = 0;
    this.page = new PageBehind({ onKey: (e) => this.key(e), onResize: () => this.resize() });
  }

  // ---- open and close ----
  async open() {
    if (this.isOpen) return;
    const session = ++this.session;
    this.isOpen = true;
    this.busy = true;
    this.ignoreClicksUntil = performance.now() + 400;
    this.page.remember();
    const photos = this.load();
    const from = this.bookRect();
    // The caption sizes come from the pixel font, so the font must load first.
    await Promise.all([loadCss(CSS), pixelFont()]);
    if (session !== this.session) return;

    this.build();
    this.reset();
    // The album shows before the layout, because the layout measures the captions.
    this.el.hidden = false;
    this.layout();
    this.page.hold();
    this.showBook(false);

    // The closed book: the cover lies on the right side, and the left side waits under the open cover.
    this.left.hidden = true;
    this.fill(this.right, null);
    const cover = this.leaf(this.cover(), this.spread ? this.side("l") : null);
    const shift = this.spread ? this.size.sideW / 2 : 0;
    const closed = `translate(${-shift}px, 0px)`;
    this.count.textContent = "";
    this.prev.disabled = this.next.disabled = true;

    if (!this.reducedMotion) {
      const r = this.right.getBoundingClientRect();
      const b = this.book.getBoundingClientRect();
      this.book.style.transformOrigin = `${r.left - b.left}px 0px`;
      const start = `translate(${from.left - r.left}px, ${from.top - r.top}px) scale(${from.width / r.width}, ${from.height / r.height})`;
      this.shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FLY_MS, easing: FADE });
      await this.play([this.book.animate([{ transform: start }, { transform: closed }], { duration: FLY_MS, easing: FLY, fill: "forwards" })]);
      if (session !== this.session) return;
    }
    this.book.style.transform = closed;

    this.photos = await photos;
    if (session !== this.session) return;
    this.pages = this.makePages();
    this.at = 0;
    // Wait a moment for the first photo, so the cover opens onto a picture.
    const first = this.pages.find((p) => p.kind === "photo");
    if (first) await Promise.race([decoded(this.pageEl(first)), wait(1200)]);
    if (session !== this.session) return;

    this.fill(this.right, this.pages[this.spread ? 1 : 0]);
    if (this.spread) this.fill(cover.lastChild, this.pages[0]);
    this.sound.coverOpen();
    const done = () => {
      this.book.style.transform = this.book.style.transformOrigin = "";
      cover.remove();
      this.left.hidden = !this.spread;
      this.busy = false;
      this.show();
    };
    if (this.reducedMotion) {
      done();
    } else {
      const turn = this.spread
        ? cover.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(-180deg)" }], { duration: OPEN_MS, easing: OPEN, fill: "forwards" })
        : cover.animate([{ transform: "rotateY(0deg)", opacity: 1 }, { transform: "rotateY(-90deg)", opacity: 1, offset: 0.9 }, { transform: "rotateY(-90deg)", opacity: 0 }], { duration: OPEN_MS, easing: OPEN, fill: "forwards" });
      // The book slides to the center before the cover passes the spine, so the open book never leaves the screen.
      const slide = this.book.animate([{ transform: closed }, { transform: "translate(0px, 0px)" }], { duration: OPEN_MS * 0.55, easing: SLIDE, fill: "forwards" });
      await this.play([turn, slide], done);
      if (session !== this.session) return;
    }
    this.el.focus({ preventScroll: true });
  }

  async close() {
    if (!this.isOpen) return;
    const session = ++this.session;
    this.settle?.();
    this.isOpen = false;
    this.sound.coverClose();
    this.busy = true;
    if (!this.reducedMotion && this.el && !this.el.hidden) {
      const to = this.bookRect();
      const b = this.book.getBoundingClientRect();
      const r = this.right.getBoundingClientRect();
      this.book.style.transformOrigin = `${r.left - b.left}px 0px`;
      const end = `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(${to.width / r.width}, ${to.height / r.height})`;
      const current = getComputedStyle(this.book).transform;
      this.shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: FADE, fill: "forwards" });
      await this.play([
        this.book.animate([{ transform: current === "none" ? "translate(0px, 0px)" : current, opacity: 1 }, { transform: end, opacity: 0.2 }], { duration: CLOSE_MS, easing: FLY, fill: "forwards" }),
      ]);
      if (session !== this.session) return;
    }
    this.finishClose();
  }

  finishClose() {
    this.reset();
    if (this.el) this.el.hidden = true;
    this.showBook(true);
    this.busy = false;
    this.page.release();
  }

  // Stops every animation and removes the turning pages, so a new open or a close starts clean.
  reset() {
    this.settle = null;
    if (!this.el) return;
    for (const a of this.el.getAnimations({ subtree: true })) a.cancel();
    this.book.style.transform = this.book.style.transformOrigin = "";
    this.book.querySelectorAll(".album-leaf").forEach((l) => l.remove());
  }

  // ---- data ----
  load() {
    this.list ??= fetch("/album/list")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => (d.photos || []).map((p, i) => ({ kind: "photo", n: i + 1, ...p })))
      .catch(() => {
        this.list = null; // try again on the next open
        return [];
      });
    return this.list;
  }

  // Wide screens show two pages side by side: a title page, then the photos, then an end page if one is short.
  makePages() {
    this.title ??= { kind: "title" };
    this.end ??= { kind: "end" };
    this.empty ??= { kind: "empty" };
    const photos = this.photos.length ? this.photos : [this.empty];
    if (!this.spread) return photos;
    const pages = [this.title, ...photos];
    if (pages.length % 2) pages.push(this.end);
    return pages;
  }

  // ---- the DOM ----
  build() {
    if (this.el) return;
    this.shade = h("div", "album-shade");
    this.left = this.side("l");
    this.right = this.side("r");
    this.book = h("div", "album-book", this.left, this.right);
    this.closeBtn = h("button", { class: "album-close", type: "button", "aria-label": "Close the album" });
    this.closeBtn.innerHTML = pixelIcon(CLOSE_ICON);
    this.prev = h("button", { class: "album-arrow", type: "button", "aria-label": "Previous page" });
    this.next = h("button", { class: "album-arrow", type: "button", "aria-label": "Next page" });
    this.prev.innerHTML = pixelIcon(ARROW_ICON, true);
    this.next.innerHTML = pixelIcon(ARROW_ICON);
    this.count = h("span", { class: "album-count", "aria-live": "polite" });
    const foot = h("div", "album-foot", this.prev, h("div", "album-count-box", this.count), this.next);
    // A hidden caption that measures the height of each caption before its page shows.
    this.ruler = h("div", { class: "album-ruler", "aria-hidden": "true" });
    this.stage = h("div", "album-stage", this.book);
    this.el = dialogRoot("album", "Photo album", this.shade, this.stage, this.closeBtn, foot, this.ruler);
    document.body.append(this.el);

    this.closeBtn.addEventListener("click", () => this.close());
    this.prev.addEventListener("click", () => this.turn(-1));
    this.next.addEventListener("click", () => this.turn(1));
    // A tap on the left half goes back, and a tap on the right half goes forward. A swipe works too.
    this.el.addEventListener("click", (e) => {
      if (e.target.closest("button") || performance.now() < this.ignoreClicksUntil) return;
      this.turn(e.clientX < innerWidth / 2 ? -1 : 1);
    });
    this.el.addEventListener("pointerdown", (e) => { this.down = { x: e.clientX, y: e.clientY }; });
    this.el.addEventListener("pointerup", (e) => {
      if (!this.down || e.target.closest("button")) return;
      const dx = e.clientX - this.down.x;
      const dy = e.clientY - this.down.y;
      this.down = null;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
      this.ignoreClicksUntil = performance.now() + 400;
      this.turn(dx < 0 ? 1 : -1);
    });
  }

  side(which) {
    return h("div", `album-side ${which}`, h("div", "album-paper"));
  }

  cover() {
    return h("div", "album-cover", h("div", "album-label", TITLE));
  }

  paint() {
    const { u, cols, rows } = this.size;
    const key = `${u} ${cols} ${rows} ${this.spread}`;
    if (this.painted !== key) {
      this.painted = key;
      this.paper = this.draw(u, cols, rows);
    }
    const { paper } = this;
    this.size.paperW = this.size.sideW - (paper.outer + paper.inner) * u;
    this.size.paperH = this.size.sideH - (paper.top + paper.bottom) * u;
  }

  draw(u, cols, rows) {
    const s = this.el.style;
    const right = sideArt(cols, rows, "r", this.spread);
    const left = sideArt(cols, rows, "l", true);
    const cover = coverArt(cols, rows);
    const sprites = spriteArt();
    s.setProperty("--art-r", `url(${right.url})`);
    s.setProperty("--art-l", `url(${left.url})`);
    s.setProperty("--art-cover", `url(${cover.url})`);
    s.setProperty("--art-sheet-r", `url(${sideArt(cols, rows, "r", this.spread, true).url})`);
    s.setProperty("--art-sheet-l", `url(${sideArt(cols, rows, "l", true, true).url})`);
    s.setProperty("--art-corner-tl", `url(${sprites.cornerTL})`);
    s.setProperty("--art-corner-tr", `url(${sprites.cornerTR})`);
    s.setProperty("--art-corner-bl", `url(${sprites.cornerBL})`);
    s.setProperty("--art-corner-br", `url(${sprites.cornerBR})`);
    s.setProperty("--art-flake", `url(${sprites.flake})`);
    const paper = right.paper;
    const px = (n) => `${n * u}px`;
    s.setProperty("--paper-top", px(paper.top));
    s.setProperty("--paper-bottom", px(paper.bottom));
    s.setProperty("--paper-outer", px(paper.outer));
    s.setProperty("--paper-inner", px(paper.inner));
    s.setProperty("--paper-inner-l", px(left.paper.inner));
    const { plate } = cover;
    s.setProperty("--plate-x", px(plate.x));
    s.setProperty("--plate-y", px(plate.y));
    s.setProperty("--plate-w", px(plate.w));
    s.setProperty("--plate-h", px(plate.h));
    return paper;
  }

  // A turning page: front shows now, back shows after a half turn.
  leaf(front, back) {
    front.classList.add("front");
    const leaf = h("div", "album-leaf", front);
    if (back) {
      back.classList.add("back");
      leaf.append(back);
    }
    this.book.append(leaf);
    return leaf;
  }

  // Each page's content is made once and moved between the sides and the turning page, so a photo never reloads.
  pageEl(page) {
    if (page.el) return page.el;
    if (page.kind === "photo") {
      const img = h("img");
      img.alt = page.caption;
      img.decoding = "async";
      img.width = page.w;
      img.height = page.h;
      img.addEventListener("load", () => img.classList.add("in"), { once: true });
      img.src = page.src;
      page.img = img;
      page.print = h("div", "album-print", img);
      page.cap = h("figcaption", "", page.caption);
      page.el = h("figure", "album-photo", page.print, page.cap);
      this.sizePrint(page);
    } else if (page.kind === "title") {
      page.el = h("div", "album-title", h("i", "album-flake"), h("h2", "", TITLE), h("p", "", FAMILY));
    } else if (page.kind === "end") {
      page.el = h("div", "album-end", h("i", "album-flake"), h("p", "", "Happy holidays!"));
    } else {
      page.el = h("div", "album-end", h("p", "", "No photos yet."));
    }
    return page.el;
  }

  fill(side, page) {
    const paper = side.firstChild;
    if (!page) return paper.replaceChildren();
    const el = this.pageEl(page);
    if (paper.firstChild !== el) paper.replaceChildren(el);
  }

  show() {
    const p = this.pages;
    if (this.spread) {
      this.fill(this.left, p[this.at]);
      this.fill(this.right, p[this.at + 1]);
    } else {
      this.fill(this.right, p[this.at]);
    }
    this.foot();
    this.preload();
  }

  foot() {
    const step = this.spread ? 2 : 1;
    const shown = this.pages.slice(this.at, this.at + step).filter((p) => p.kind === "photo").map((p) => p.n);
    const total = this.photos.length;
    this.count.textContent = !total ? "" : shown.length > 1 ? `${shown[0]}-${shown.at(-1)} / ${total}` : `${shown[0] ?? 1} / ${total}`;
    this.prev.disabled = this.at === 0;
    this.next.disabled = this.at + step >= this.pages.length;
  }

  // Load the next pages before the guest turns to them.
  preload() {
    const step = this.spread ? 2 : 1;
    for (const page of this.pages.slice(this.at + step, this.at + step * 2)) this.pageEl(page);
  }

  // ---- sizes ----
  // The book is a whole number of book pixels, and each book pixel is a whole number of screen pixels.
  // The stage is the space between the buttons (album.css).
  layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    this.spread = vw >= 900 && vw >= vh * 1.2;
    const across = this.spread ? 2 : 1;
    const stage = this.stage.getBoundingClientRect();
    const availW = stage.width - 32;
    const availH = stage.height;
    // A short, wide screen like a phone on its side gets one wide page, so a photo and its caption have room.
    const ratio = this.spread ? 0.76 : vw > vh ? Math.min(1.5, Math.max(0.7, availW / availH)) : 0.7;
    let sideH = Math.min(availH, 900);
    let sideW = sideH * ratio;
    if (sideW * across > availW) {
      sideW = availW / across;
      sideH = sideW / ratio;
    }
    const u = Math.max(2, Math.min(6, Math.round(sideW / BOOK_PIXELS)));
    const cols = Math.floor(sideW / u);
    const rows = Math.floor(sideH / u);
    sideW = cols * u;
    sideH = rows * u;
    const pad = u * Math.max(3, Math.round((sideW * 0.04) / u));
    const font = Math.min(sideW, sideH) < 420 ? 18 : 22;
    this.size = { u, cols, rows, sideW, sideH, pad, font };
    this.el.classList.toggle("spread", this.spread);
    const s = this.el.style;
    s.setProperty("--u", `${u}px`);
    s.setProperty("--side-w", `${sideW}px`);
    s.setProperty("--side-h", `${sideH}px`);
    s.setProperty("--pad", `${pad}px`);
    s.setProperty("--cap-font", `${font}px`);
    s.setProperty("--corner", `${CORNER_SIZE * u}px`);
    s.setProperty("--flake", `${FLAKE_SIZE * u}px`);
    this.paint();
    for (const page of this.photos) if (page.el) this.sizePrint(page);
  }

  // Fit the photo inside the page, above the whole caption, in a white mat with a pixel outline and shadow.
  sizePrint(page) {
    const { u, paperW, paperH, pad, font } = this.size;
    const frame = (MAT * 2 + 3) * u;
    const w = paperW - pad * 2 - frame;
    const hh = paperH - pad * 2 - frame;
    const scale = (cap) => Math.max(0, Math.min(w / page.w, (hh - cap) / page.h));
    let size = font;
    let cap = this.captionHeight(page.caption, size);
    while (size > MIN_FONT && scale(cap) < scale(0) * MIN_PHOTO) {
      size -= 2;
      cap = this.captionHeight(page.caption, size);
    }
    const k = scale(cap);
    page.cap.style.fontSize = size === font ? "" : `${size}px`;
    page.img.style.width = `${Math.floor((page.w * k) / u) * u}px`;
    page.img.style.height = `${Math.floor((page.h * k) / u) * u}px`;
  }

  // The height of a caption at this font size, with the full width of the page.
  captionHeight(text, font) {
    const { paperW, pad } = this.size;
    const r = this.ruler;
    r.style.width = `${paperW - pad * 2}px`;
    r.style.fontSize = `${font}px`;
    r.textContent = text;
    return Math.ceil(r.getBoundingClientRect().height);
  }

  resize() {
    if (!this.isOpen || this.busy) return;
    this.settle?.();
    const was = this.spread;
    const photo = this.pages.slice(this.at).find((p) => p.kind === "photo")?.n ?? 1;
    this.layout();
    if (was === this.spread) return;
    this.pages = this.makePages();
    // Keep the same photo in view: in a spread, photo n is page n, after the title page.
    this.at = this.spread ? photo - (photo % 2) : this.photos.length ? photo - 1 : 0;
    this.left.hidden = !this.spread;
    this.show();
  }

  // ---- turning pages ----
  turn(dir) {
    if (!this.isOpen || this.busy) return;
    this.settle?.();
    const step = this.spread ? 2 : 1;
    const from = this.at;
    const to = from + dir * step;
    if (to < 0 || to >= this.pages.length) return;
    this.at = to;
    this.sound.pageTurn();
    this.foot();
    this.preload();
    const p = this.pages;
    if (this.reducedMotion) return this.show();

    let leaf;
    let frames;
    if (this.spread && dir > 0) {
      this.fill(this.right, p[to + 1]);
      leaf = this.leaf(this.sideWith("r", p[from + 1]), this.sideWith("l", p[to]));
      frames = [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-180deg)" }];
    } else if (this.spread) {
      this.fill(this.left, p[to]);
      leaf = this.leaf(this.sideWith("r", p[to + 1]), this.sideWith("l", p[from]));
      frames = [{ transform: "rotateY(-180deg)" }, { transform: "rotateY(0deg)" }];
    } else if (dir > 0) {
      this.fill(this.right, p[to]);
      leaf = this.leaf(this.sideWith("r", p[from]));
      frames = [{ transform: "rotateY(0deg)", opacity: 1 }, { transform: "rotateY(-90deg)", opacity: 1, offset: 0.9 }, { transform: "rotateY(-90deg)", opacity: 0 }];
    } else {
      leaf = this.leaf(this.sideWith("r", p[to]));
      frames = [{ transform: "rotateY(-90deg)", opacity: 0 }, { transform: "rotateY(-90deg)", opacity: 1, offset: 0.1 }, { transform: "rotateY(0deg)", opacity: 1 }];
    }
    const anim = leaf.animate(frames, { duration: TURN_MS, easing: TURN, fill: "forwards" });
    this.play([anim], () => {
      leaf.remove();
      this.show();
    });
  }

  // A page that turns: paper only, with no board under it.
  sideWith(which, page) {
    const side = this.side(which);
    side.classList.add("sheet");
    this.fill(side, page);
    return side;
  }

  // Runs animations. A new turn or a close settles the running one at once, so fast taps never pile up.
  play(anims, done = () => {}) {
    const settle = () => {
      if (this.settle !== settle) return;
      this.settle = null;
      done();
      for (const a of anims) a.cancel();
    };
    this.settle = settle;
    return Promise.all(anims.map((a) => a.finished)).then(settle, () => {});
  }

  key(e) {
    if (e.key === "Escape") this.close();
    else if (e.key === "ArrowLeft") this.turn(-1);
    else if (e.key === "ArrowRight") this.turn(1);
    else return;
    e.preventDefault();
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Loads the page's pixel font (--pixel in style.css). If it does not load, the captions use the fallback font.
function pixelFont() {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--pixel");
  return document.fonts.load(`16px ${family}`).catch(() => {});
}

function decoded(el) {
  const img = el.querySelector("img");
  return img?.decode ? img.decode().catch(() => {}) : Promise.resolve();
}

// Small icons drawn as pixels, like the room. Each "#" is one square.
const CLOSE_ICON = [
  "##....##",
  "###..###",
  ".######.",
  "..####..",
  "..####..",
  ".######.",
  "###..###",
  "##....##",
];
const ARROW_ICON = [
  "..#.....",
  "..##....",
  "..###...",
  "..####..",
  "..####..",
  "..###...",
  "..##....",
  "..#.....",
];

function pixelIcon(rows, flip = false) {
  const n = rows.length;
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "#") rects += `<rect x="${flip ? n - 1 - x : x}" y="${y}" width="1" height="1"/>`;
  }));
  return `<svg aria-hidden="true" width="${n * 3}" height="${n * 3}" viewBox="0 0 ${n} ${n}" fill="currentColor" shape-rendering="crispEdges">${rects}</svg>`;
}

// The book on the sofa. It loads once the room loads, and a tap finds it only while it shows.
class Book {
  constructor() {
    this.img = null;
    this.shown = true;
  }

  prepare() {
    loadImage("/assets/book.png").then((img) => { this.img = img; }, () => {});
  }

  drawBack(g) {
    if (this.img && this.shown) g.drawImage(this.img, BOOK.x, BOOK.y);
  }
}

export default {
  name: "album",
  spots: [{ id: "book", ...BOOK_TAP }],
  hints: [
    { host: "jessica", text: "Have you seen our year? It's somewhere comfy." },
    { host: "jesse", text: "Our whole year fits in one little book." },
  ],
  setup({ scene, sound, reducedMotion }) {
    const book = new Book();
    const bookRect = () => scene.roomRect(BOOK);
    const album = new Album({ sound, reducedMotion, bookRect, showBook: (on) => { book.shown = on; } });
    return {
      layer: book,
      open: () => !!(book.img && book.shown),
      tap: () => album.open(),
      // From the tap, while the album loads, until it closes.
      get covers() { return album.isOpen || album.busy; },
      test: ({ rect, center }) => ({
        loaded: () => ({ book: !!book.img }),
        bookCenter: () => center(bookRect()),
        bookHidden: () => !book.shown,
        // The album in its current state: { ready, spread, book, controls, photos }. ready is true when the album is open and no page turns.
        // book and controls are screen boxes. photos has one item for each photo page that shows:
        // { caption, font, overflow, paper, print, cap }. font is the caption font size in CSS pixels.
        // overflow is true when the caption text needs more space than its box. paper, print, and cap are screen boxes.
        album: () => {
          const box = (el) => rect(el.getBoundingClientRect());
          if (!album.el || album.el.hidden) return { ready: false, spread: false, book: null, controls: [], photos: [] };
          const step = album.spread ? 2 : 1;
          const photos = album.pages.slice(album.at, album.at + step).filter((p) => p.kind === "photo" && p.el?.isConnected).map((p) => ({
            caption: p.cap.textContent,
            font: parseFloat(getComputedStyle(p.cap).fontSize),
            overflow: p.cap.scrollHeight > p.cap.clientHeight || p.cap.scrollWidth > p.cap.clientWidth,
            paper: box(p.el.parentElement),
            print: box(p.print),
            cap: box(p.cap),
          }));
          return {
            ready: album.isOpen && !album.busy && !album.settle,
            spread: album.spread,
            book: box(album.book),
            controls: [album.closeBtn, album.prev, album.count.parentElement, album.next].map(box),
            photos,
          };
        },
      }),
    };
  },
};
