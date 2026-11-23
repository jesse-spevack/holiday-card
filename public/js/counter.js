// The counter: a small label in the bottom right corner of the room, for example "3 of 12 surprises".
// The total counts only the hidden extras that fit this guest now (`fits` of each extra). A car counts once the guest sees it.
// A tap on the counter makes a host say a hint (idle.js). When the guest finds the last extra, the room sparkles (glint.js),
// a short tune plays, Jess cheers, and the counter shows its done state.
// The counter shows only after the thank-you tucks away, so only a guest with a family in this browser sees it.

import { h } from "./dom.js";

// What Jess says when the guest finds every extra.
export const DONE_LINE = "You found every surprise!";

// A gift and a star in pixels, 9 wide and 9 high. Each string is one row, and "#" is a pixel in the label's color.
const ICONS = {
  gift: ["..#...#..", "...#.#...", "#########", "#...#...#", "#########", ".#..#..#.", ".#..#..#.", ".#..#..#.", ".#######."],
  star: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", ".#.....#."],
};

function icon(rows) {
  const rects = rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  const el = h("span", { class: "counter-icon", "aria-hidden": "true" });
  el.innerHTML = `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" fill="currentColor">${rects}</svg>`;
  return el;
}

export class Counter {
  // fitting() is the extras that fit: [{ name, spots }] (registry.js). has(name) is true once this browser found the extra.
  // onAsk() runs on a tap of the counter. onDone(spots) runs when the guest finds the last extra.
  // busy() is true while a window covers the room. The cheer waits until the room shows, for example after the album closes.
  constructor({ scene, fitting, has, busy, onAsk, onDone }) {
    this.scene = scene;
    this.fitting = fitting;
    this.has = has;
    this.busy = busy;
    this.onDone = onDone;
    this.shown = false;
    this.count = null;
    this.cheerDue = false;
    this.celebrations = 0;
    this.text = h("span", { class: "counter-text" });
    this.el = h("button", { type: "button", class: "counter", hidden: true, onClick: onAsk });
    // The room does not take a tap on the counter.
    for (const type of ["pointerdown", "pointerup"]) this.el.addEventListener(type, (e) => e.stopPropagation());
    scene.overlay.append(this.el);
    scene.onFrame(() => this.update());
  }

  show(on) {
    this.shown = on;
    this.el.hidden = !on;
    // A counter that shows again starts from the count now, with no cheer for what the guest found while it hid.
    this.count = null;
    this.cheerDue = false;
    this.update();
  }

  // The count now: { found, total, missing }.
  tally() {
    const names = this.fitting().map((e) => e.name);
    const missing = names.filter((n) => !this.has(n));
    return { found: names.length - missing.length, total: names.length, missing };
  }

  update() {
    if (!this.shown) return;
    this.recount();
    if (this.cheerDue && !this.busy()) {
      this.cheerDue = false;
      this.celebrate();
    }
  }

  // Shows the count when it changes.
  recount() {
    const { found, total } = this.tally();
    const last = this.count;
    if (last && last.found === found && last.total === total) return;
    this.count = { found, total };
    const done = total > 0 && found === total;
    this.el.classList.toggle("done", done);
    this.text.textContent = done ? `All ${total} found!` : `${found} of ${total} surprises`;
    this.el.replaceChildren(icon(done ? ICONS.star : ICONS.gift), this.text);
    this.el.setAttribute("aria-label", done ? `You found all ${total} surprises. Tap for a line from the hosts.` : `${found} of ${total} surprises found. Tap for a hint.`);
    // The cheer comes only when the guest finds the last one now, not when the counter first shows.
    this.cheerDue = done && (this.cheerDue || (!!last && found > last.found));
  }

  celebrate() {
    this.celebrations++;
    this.el.classList.remove("cheer");
    this.el.getBoundingClientRect();
    this.el.classList.add("cheer");
    this.onDone(this.fitting().flatMap((e) => e.spots));
  }

  // The state of the counter, for the tests. box is its place on the screen.
  state() {
    this.recount();
    const r = this.el.getBoundingClientRect();
    return {
      shown: this.shown && !this.el.hidden,
      text: this.el.textContent,
      done: this.el.classList.contains("done"),
      celebrations: this.celebrations,
      ...this.tally(),
      box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  }
}
