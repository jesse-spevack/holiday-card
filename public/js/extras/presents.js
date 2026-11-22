// The presents, a hidden extra. A tap on the presents by the window gives a message from each host kid.
// Eddie says his line in a bubble. When his bubble goes, Audrey says hers, so a guest can read both.
// Each kid's name shows under them while they talk. The kids stand still until the last line ends.
// The tap area is "presents" in HOTSPOTS (room.js). The scene runs this module as a layer (Scene.addLayer) for its clock.

// The lines, in order. id is the host sprite id (HOSTS in scene.js). seconds is how long the bubble shows.
// A guest needs about 1.5 seconds to find a bubble, then about 4 words each second.
export const PRESENT_LINES = [
  { id: "son", text: "Happy Hanukkah! I hope your holiday season is filled with happiness.", seconds: 4.5 },
  { id: "daughter", text: "Happy Hanukkah! The lights will shine bright tonight.", seconds: 4 },
];
// beat: the pause between two bubbles. rest: after the last bubble, a tap waits this long.
const T = { beat: 0.35, rest: 0.5 };

export class Presents {
  constructor({ scene, sound }) {
    this.scene = scene;
    this.sound = sound;
    this.talk = null;
    this.readyAt = 0;
  }

  // The kids who say the lines, with the time each one starts, in seconds from the tap. A kid who is not in the room says nothing.
  plan() {
    const out = [];
    let at = 0;
    for (const line of PRESENT_LINES) {
      const sprite = this.scene.sprites.find((s) => s.host && s.id === line.id && s.img);
      if (!sprite) continue;
      out.push({ ...line, sprite, at });
      at += line.seconds + T.beat;
    }
    return { lines: out, end: at - T.beat };
  }

  // Starts the messages. A tap while the kids talk, or just after, does nothing. Returns true when the messages start.
  tap() {
    const time = this.scene.time;
    if (this.talk || time < this.readyAt) return false;
    const { lines, end } = this.plan();
    if (!lines.length) return false;
    this.talk = { t0: time, lines, end, next: 0 };
    // Audrey and Eddie walk together, so a pause on one stops both.
    this.scene.pause(lines[0].sprite, end);
    this.sound.gift();
    this.update();
    return true;
  }

  // ---- the layer hook that the scene calls each frame ----
  update() {
    const t = this.talk;
    if (!t) return;
    const age = this.scene.time - t.t0;
    while (t.next < t.lines.length && age >= t.lines[t.next].at) {
      const { sprite, text, seconds } = t.lines[t.next++];
      this.scene.say(sprite, text, seconds);
      this.scene.showNames([sprite], seconds);
    }
    if (age >= t.end) {
      this.talk = null;
      this.readyAt = this.scene.time + T.rest;
    }
  }

  // The state of the messages, for the tests: { on, age, speaker, readyIn, lines: [{ name, text, at, seconds }] }.
  // speaker is the name of the kid whose turn it is now.
  state() {
    const t = this.talk;
    const time = this.scene.time;
    const age = t ? time - t.t0 : 0;
    const now = t?.lines.findLast((l) => age >= l.at);
    return {
      on: !!t,
      age,
      speaker: now?.sprite.name ?? null,
      readyIn: t ? t.end + T.rest - age : Math.max(0, this.readyAt - time),
      lines: (t?.lines ?? this.plan().lines).map(({ sprite, text, at, seconds }) => ({ name: sprite.name, text, at, seconds })),
    };
  }
}
