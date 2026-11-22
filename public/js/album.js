// The hidden photo album. Nothing on the page points to it. A guest finds the small red book on the sofa
// and taps it. The book flies up, opens, and shows one photo from our year on each page.
// The photos and captions come from the Worker (/album/list), never from the repo.

const CSS = "/album.css";
const TITLE = "Our 2026";
const FAMILY = "Jesse, Jess, Audrey & Eddie";
const FLY_MS = 480;
const OPEN_MS = 650;
const TURN_MS = 420;
const CLOSE_MS = 300;
const SWIPE_PX = 40;
const EASE = "cubic-bezier(0.3, 0.1, 0.3, 1)";

const h = (tag, cls, ...children) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...children);
  return el;
};

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
  }

  // ---- open and close ----
  async open() {
    if (this.isOpen) return;
    const session = ++this.session;
    this.isOpen = true;
    this.busy = true;
    this.ignoreClicksUntil = performance.now() + 400;
    this.returnFocus = document.activeElement;
    const photos = this.load();
    const from = this.bookRect();
    await this.styles();
    if (session !== this.session) return;

    this.build();
    this.reset();
    this.layout();
    this.el.hidden = false;
    document.getElementById("app")?.setAttribute("inert", "");
    document.addEventListener("keydown", this.onKey);
    addEventListener("resize", this.onResize);
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
      this.shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FLY_MS });
      await this.play([this.book.animate([{ transform: start }, { transform: closed }], { duration: FLY_MS, easing: EASE, fill: "forwards" })]);
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
        ? cover.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(-180deg)" }], { duration: OPEN_MS, easing: EASE, fill: "forwards" })
        : cover.animate([{ transform: "rotateY(0deg)", opacity: 1 }, { transform: "rotateY(-90deg)", opacity: 1, offset: 0.9 }, { transform: "rotateY(-90deg)", opacity: 0 }], { duration: OPEN_MS, easing: "ease-in", fill: "forwards" });
      // The book slides to the center before the cover passes the spine, so the open book never leaves the screen.
      const slide = this.book.animate([{ transform: closed }, { transform: "translate(0px, 0px)" }], { duration: OPEN_MS * 0.55, easing: "ease-out", fill: "forwards" });
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
      this.shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, fill: "forwards" });
      await this.play([
        this.book.animate([{ transform: current === "none" ? "translate(0px, 0px)" : current, opacity: 1 }, { transform: end, opacity: 0.2 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" }),
      ]);
      if (session !== this.session) return;
    }
    this.finishClose();
  }

  finishClose() {
    this.reset();
    if (this.el) this.el.hidden = true;
    document.getElementById("app")?.removeAttribute("inert");
    document.removeEventListener("keydown", this.onKey);
    removeEventListener("resize", this.onResize);
    this.showBook(true);
    this.busy = false;
    this.returnFocus?.focus?.({ preventScroll: true });
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

  styles() {
    this.css ??= new Promise((resolve) => {
      const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: CSS });
      link.onload = link.onerror = () => resolve();
      document.head.append(link);
    });
    return this.css;
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
    this.onKey = (e) => this.key(e);
    this.onResize = () => this.resize();
    this.shade = h("div", "album-shade");
    this.left = this.side("l");
    this.right = this.side("r");
    this.book = h("div", "album-book", this.left, this.right);
    this.closeBtn = h("button", "album-close");
    this.closeBtn.type = "button";
    this.closeBtn.setAttribute("aria-label", "Close the album");
    this.closeBtn.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M5 5l14 14M19 5L5 19"></path></svg>';
    this.prev = h("button", "album-arrow", "‹");
    this.next = h("button", "album-arrow", "›");
    this.prev.type = this.next.type = "button";
    this.prev.setAttribute("aria-label", "Previous page");
    this.next.setAttribute("aria-label", "Next page");
    this.count = h("span", "album-count");
    this.count.setAttribute("aria-live", "polite");
    this.el = h("div", "album", this.shade, h("div", "album-stage", this.book), this.closeBtn, h("div", "album-foot", this.prev, this.count, this.next));
    this.el.hidden = true;
    this.el.tabIndex = -1;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.setAttribute("aria-label", "Photo album");
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
      page.el = h("figure", "album-photo", page.print, h("figcaption", "", page.caption));
      this.sizePrint(page);
    } else if (page.kind === "title") {
      page.el = h("div", "album-title", h("h2", "", TITLE), h("p", "", FAMILY));
    } else if (page.kind === "end") {
      page.el = h("div", "album-end", h("p", "", "Happy holidays!"));
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
  layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    this.spread = vw >= 900 && vw >= vh * 1.2;
    const across = this.spread ? 2 : 1;
    const ratio = this.spread ? 0.76 : 0.7;
    const availW = vw - 32;
    const availH = vh - 136;
    let sideH = Math.min(availH, 900);
    let sideW = sideH * ratio;
    if (sideW * across > availW) {
      sideW = availW / across;
      sideH = sideW / ratio;
    }
    sideW = Math.floor(sideW);
    sideH = Math.floor(sideH);
    const rim = sideW < 420 ? 8 : 12;
    const pad = Math.round(Math.min(32, Math.max(14, sideW * 0.06)));
    const font = sideW < 420 ? 18 : 22;
    const cap = Math.round(font * 1.3 * 2 + 14);
    this.size = { sideW, sideH, rim, pad, font, cap };
    this.el.classList.toggle("spread", this.spread);
    const s = this.el.style;
    s.setProperty("--side-w", `${sideW}px`);
    s.setProperty("--side-h", `${sideH}px`);
    s.setProperty("--rim", `${rim}px`);
    s.setProperty("--pad", `${pad}px`);
    s.setProperty("--cap", `${cap}px`);
    s.setProperty("--cap-font", `${font}px`);
    for (const page of this.photos) if (page.el) this.sizePrint(page);
  }

  // Fit the photo inside the page, above the caption, with a white border like a print.
  sizePrint(page) {
    const { sideW, sideH, rim, pad, cap } = this.size;
    const border = 6;
    const w = sideW - rim * 2 - pad * 2 - border * 2 - 8;
    const hh = sideH - rim * 2 - pad * 2 - cap - border * 2 - 8;
    const k = Math.min(w / page.w, hh / page.h);
    page.img.style.width = `${Math.floor(page.w * k)}px`;
    page.img.style.height = `${Math.floor(page.h * k)}px`;
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
    const anim = leaf.animate(frames, { duration: TURN_MS, easing: this.spread ? EASE : dir > 0 ? "ease-in" : "ease-out", fill: "forwards" });
    this.play([anim], () => {
      leaf.remove();
      this.show();
    });
  }

  sideWith(which, page) {
    const side = this.side(which);
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

function decoded(el) {
  const img = el.querySelector("img");
  return img?.decode ? img.decode().catch(() => {}) : Promise.resolve();
}
