// The hosts speak on their own. After the thank-you tucks away, a host says a line about every 20 seconds while the guest
// does nothing: no tap, no key, no open album, dreidel game, or look picker, and the tab shows. The hosts wait while the dialog shows.
// A host prefers a hint at an extra that the guest has not found (hostLine in hosts.js). After the guest finds every extra,
// the hosts speak much less often, with the thanks only. A new bubble never covers a bubble that shows (Scene.sayClear).
// The wait runs on the scene clock, so the tests can stop and move it. hint() is the hint on demand for the counter (counter.js).

import { hostLine, hostLines } from "./hosts.js";

// In scene seconds. every: the quiet time before a host speaks. done: the same after the guest finds every extra.
// retry: when every host's bubble would cover another bubble, the hosts try again after this long.
// seconds: how long a line shows, and how long the host stops to say it.
export const IDLE = { every: 20, done: 75, retry: 2, seconds: 5 };

const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

export class Idle {
  // shows(egg) is true while the guest has not found the extra `egg` and it fits. left() is the count of those extras.
  // busy() is true while a window covers the room or the guest edits a sprite.
  constructor({ scene, shows, left, busy }) {
    this.scene = scene;
    this.shows = shows;
    this.left = left;
    this.busy = busy;
    this.on = false;
    // The scene seconds since the guest last did something, or since a host last spoke on their own.
    this.quiet = 0;
    // The lines that the hosts said on their own: [{ host, text, hint, at }], at in scene seconds.
    this.said = [];
    const wake = () => { this.quiet = 0; };
    document.addEventListener("pointerdown", wake, { capture: true });
    document.addEventListener("keydown", wake, { capture: true });
  }

  start() {
    this.on = true;
    this.quiet = 0;
  }

  stop() {
    this.on = false;
  }

  // The wait before a host speaks now.
  wait() {
    return this.left() ? IDLE.every : IDLE.done;
  }

  // A host says a line, if one can without a bubble on another bubble. With hint, the line is a hint, if one is left.
  // `force` shows the line even when it covers a bubble, for a guest who asks. Returns the line, or null.
  speak({ hint, force = false }) {
    const kind = hint ? "hint" : "thanks";
    const hosts = shuffle(this.scene.sprites.filter((s) => s.host && s.img));
    // Only the hosts with a line of that kind speak, while one has a line.
    const ready = hosts.filter((s) => hostLines(s.id, this.shows, kind).length);
    const order = ready.length ? ready : hosts;
    for (const host of order) {
      const text = hostLine(host, this.shows, kind);
      if (this.scene.sayClear(host, text, IDLE.seconds)) return this.note(host, text);
    }
    if (!force || !order.length) return null;
    const text = hostLine(order[0], this.shows, kind);
    this.scene.say(order[0], text, IDLE.seconds);
    return this.note(order[0], text);
  }

  // The host stops to talk, and the line goes in the list of lines.
  note(host, text) {
    this.scene.pause(host, IDLE.seconds);
    const line = { host: host.name, text, hint: hostLines(host.id, this.shows, "hint").some((l) => l.text === text), at: this.scene.time };
    // The list keeps the last 50 lines, so a long visit does not grow it without end.
    this.said = [...this.said.slice(-49), line];
    return line;
  }

  // A hint now, for a guest who asks (a tap on the counter).
  hint() {
    return this.speak({ hint: this.left() > 0, force: true });
  }

  // ---- the layer hook that the scene calls ----
  update(dt) {
    if (!this.on || this.busy() || document.hidden) return;
    this.quiet += dt;
    if (this.quiet < this.wait()) return;
    const line = this.speak({ hint: this.left() > 0 });
    this.quiet = line ? 0 : this.wait() - IDLE.retry;
  }

  // The state of the hosts' own lines, for the tests.
  state() {
    return { on: this.on, quiet: this.quiet, wait: this.wait(), said: this.said.map((l) => ({ ...l })) };
  }
}
