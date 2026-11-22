// Small sound effects made with Web Audio. The photo album also plays a few recorded book sounds.
// The dreidel game makes its own sounds in dreidel-sound.js, and plays its gelt recordings from here.

const KEY = "hc.sound";

export class Sound {
  constructor() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    this.on = saved !== "off";
    this.ctx = null;
  }

  // Browsers only allow audio after a tap or key press.
  wake() {
    if (!this.on) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.loadSamples();
    } catch {}
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? "on" : "off"); } catch {}
    if (this.on) this.wake();
    return this.on;
  }

  tone(freq, { at = 0, dur = 0.08, type = "square", gain = 0.04, slide = 0, attack = 0 } = {}) {
    if (!this.ready()) return;
    tone(this.ctx, this.ctx.currentTime + at, freq, { dur, type, gain, slide, attack });
  }

  blip() { this.tone(520 + Math.random() * 80, { dur: 0.035, gain: 0.025 }); }
  select() { this.tone(660, { dur: 0.06 }); this.tone(990, { at: 0.06, dur: 0.08 }); }
  pop() { this.tone(400, { dur: 0.1, slide: 500, gain: 0.035 }); }
  candle() { this.tone(1046, { dur: 0.3, type: "sine", gain: 0.06 }); this.tone(1568, { at: 0.08, dur: 0.4, type: "sine", gain: 0.04 }); }
  // A family walks into the party.
  arrive() {
    this.tone(180, { dur: 0.18, type: "triangle", gain: 0.08, slide: -60 });
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, { at: 0.25 + i * 0.09, dur: 0.18, type: "square", gain: 0.035 }));
  }
  oops() { this.tone(220, { dur: 0.15, type: "triangle", gain: 0.06, slide: -80 }); }
  // The hidden pet reactions (extras/pets.js). The woof and the mrrp change a little on each tap.
  woof() { if (this.ready()) woof(this.ctx, this.ctx.destination); }
  mrrp() { if (this.ready()) mrrp(this.ctx, this.ctx.destination); }
  puff() { if (this.ready()) puff(this.ctx, this.ctx.destination); }
  beep() { [880, 1320, 990].forEach((f, i) => this.tone(f, { at: i * 0.09, dur: 0.06, gain: 0.025 })); }
  warble() {
    this.tone(520, { dur: 0.3, type: "sine", gain: 0.05, slide: 420 });
    this.tone(940, { at: 0.3, dur: 0.35, type: "sine", gain: 0.04, slide: -380 });
  }
  waddle() { [0, 0.17, 0.34, 0.51].forEach((at, i) => this.tone(i % 2 ? 392 : 330, { at, dur: 0.06, type: "triangle", gain: 0.06 })); }
  // The book sounds play a recording. Until it loads, or if it fails to load, they play the swish.
  pageTurn() { if (this.ready() && !this.sample(FLIPS, 0.18)) swish(this.ctx, this.ctx.destination); }
  coverOpen() { if (this.ready() && !this.sample(["book-open"], 0.13)) swish(this.ctx, this.ctx.destination, { cover: true }); }
  coverClose() { if (this.ready() && !this.sample(["book-close"], 0.09)) swish(this.ctx, this.ctx.destination, { cover: true }); }

  // Fetches and decodes the recordings one time, after the first tap, so the page load stays light.
  loadSamples() {
    if (this.samples || !this.ctx) return;
    const ctx = this.ctx;
    this.samples = {};
    for (const name of [...FLIPS, "book-open", "book-close", ...GELT]) {
      fetch(`/assets/sounds/${name}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${name}: ${r.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { this.samples[name] = buf; })
        .catch(() => {});
    }
  }

  hasSample(name) {
    return !!this.samples?.[name];
  }

  // Plays a random loaded recording from `names`, a little faster or slower each time.
  // Returns false when none of them has loaded.
  sample(names, gain) {
    const bufs = names.map((n) => this.samples?.[n]).filter(Boolean);
    if (!bufs.length) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    src.connect(amp).connect(this.ctx.destination);
    src.start();
    return true;
  }

  ready() { return this.on && this.ctx?.state === "running"; }

  // A soft sparkle for a shooting star.
  sparkle() { [1568, 2093, 2637, 3136, 4186].forEach((f, i) => this.tone(f, { at: i * 0.06, dur: 0.4, type: "sine", gain: 0.03 })); }

  // Glasses clink for a toast. A crowd of `people` makes 3 to 5 clinks, close together, each a little different.
  // A clink is a bright ping with two higher overtones that die away fast, like thin glass.
  cheers(people = 4) {
    const count = Math.max(3, Math.min(5, Math.ceil(people / 2)));
    let at = 0;
    for (let i = 0; i < count; i++) {
      const f = 2300 + Math.random() * 900;
      const gain = 0.035 * (1 - i * 0.12);
      this.tone(f, { at, dur: 0.45, type: "sine", gain });
      this.tone(f * 2.41, { at, dur: 0.22, type: "sine", gain: gain * 0.45 });
      this.tone(f * 4.13, { at, dur: 0.08, type: "sine", gain: gain * 0.25 });
      at += 0.06 + Math.random() * 0.1;
    }
  }

  // A tap on the fire (extras/fire.js): the fire roars up, then crackles and pops.
  crackle() { if (this.ready()) crackle(this.ctx, this.ctx.destination); }
  // A tap on the presents: three quick bells that go up, like a ribbon pulled loose.
  gift() { [784, 988, 1319].forEach((f, i) => this.tone(f, { at: i * 0.07, dur: 0.3, type: "sine", gain: 0.04 })); }

  // A soft bell. Each step is one note higher on a pentatonic scale, from C5.
  chime(step = 0) {
    const semis = [0, 2, 4, 7, 9][step % 5] + 12 * Math.floor(step / 5);
    const f = 523.25 * 2 ** (semis / 12);
    this.tone(f, { dur: 0.8, type: "sine", gain: 0.05 });
    this.tone(f * 2.76, { dur: 0.3, type: "sine", gain: 0.012 });
  }

  // A soft chord for a room in bloom: C, E, G, and the D above, one after another like a harp, then held.
  bouquet() {
    [523.25, 659.25, 783.99, 1174.66].forEach((f, i) => {
      this.tone(f, { at: i * 0.07, dur: 1.6, type: "sine", gain: 0.035, attack: 0.02 });
      this.tone(f * 2, { at: i * 0.07, dur: 0.5, type: "sine", gain: 0.008 });
    });
  }

  // A small breath that blows out candles.
  snuff() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const puff = burst(this.ctx, this.ctx.destination, t, 0.35, "lowpass");
    puff.filter.frequency.value = 900;
    puff.gain.linearRampToValueAtTime(0.12, t + 0.06);
    puff.gain.linearRampToValueAtTime(0, t + 0.35);
  }

  // A lamp switch: a press and a release.
  click() {
    if (!this.ready()) return;
    [[0, 3000, 0.35], [0.05, 2200, 0.25]].forEach(([at, freq, peak]) => {
      const t = this.ctx.currentTime + at;
      const tick = burst(this.ctx, this.ctx.destination, t, 0.025, "bandpass");
      tick.filter.frequency.value = freq;
      tick.filter.Q.value = 1.5;
      tick.gain.linearRampToValueAtTime(peak, t + 0.002);
      tick.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    });
  }
}

// Page turns from Kenney's RPG Audio pack (CC0). See public/assets/sounds/LICENSE.txt.
const FLIPS = ["book-flip-1", "book-flip-2", "book-flip-3"];
// Gelt coins for the dreidel game, from the same pack.
const GELT = ["gelt-pile", "gelt-few"];

// One oscillator note that starts at time t and dies away over dur seconds. slide moves the pitch by that many Hz.
// attack is the seconds it takes to reach full gain. With no attack, it starts at full gain.
// Every beep, chime, and coin ping on the page is one of these.
export function tone(ctx, t, freq, { dur = 0.08, type = "square", gain = 0.04, slide = 0, attack = 0, out = ctx.destination } = {}) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  if (attack) {
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
  } else {
    amp.gain.setValueAtTime(gain, t);
  }
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// One second of white noise for each audio context: the dreidel's whirr and knocks.
const whiteNoises = new WeakMap();
export function whiteNoise(ctx) {
  let buf = whiteNoises.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  whiteNoises.set(ctx, buf);
  return buf;
}

// One second of pink noise for each audio context. Every swish starts at a random place in it.
// Pink noise has less hiss than white noise, so the swish sounds like soft paper.
const noises = new WeakMap();
function pinkNoise(ctx) {
  let buf = noises.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  noises.set(ctx, buf);
  return buf;
}

// Plays noise into a filter and a gain, and returns both so the caller can shape them.
function burst(ctx, out, t, dur, type) {
  const src = ctx.createBufferSource();
  src.buffer = pinkNoise(ctx);
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  src.connect(filter).connect(amp).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return { filter, gain: amp.gain };
}

// A soft woof: a low buzz through a closing filter, with a little breath. Sometimes two woofs.
export function woof(ctx, out, { at = 0 } = {}) {
  const pitch = 0.85 + Math.random() * 0.3;
  const count = Math.random() < 0.35 ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const t = ctx.currentTime + at + k * 0.18;
    const f = 200 * pitch * (k ? 0.92 : 1);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f * 0.8, t);
    osc.frequency.linearRampToValueAtTime(f * 1.25, t + 0.03);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.15);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(1000 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(350, t + 0.15);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.11, t + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(filter).connect(amp).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
    const breath = burst(ctx, out, t, 0.08, "lowpass");
    breath.filter.frequency.value = 1400;
    breath.gain.linearRampToValueAtTime(0.04, t + 0.01);
    breath.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  }
}

// A soft cat "mrrp": a quick purr trill that rises into a short meow.
export function mrrp(ctx, out, { at = 0 } = {}) {
  const t = ctx.currentTime + at;
  const p = 0.9 + Math.random() * 0.2;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(380 * p, t);
  osc.frequency.linearRampToValueAtTime(600 * p, t + 0.14);
  osc.frequency.linearRampToValueAtTime(720 * p, t + 0.24);
  osc.frequency.exponentialRampToValueAtTime(500 * p, t + 0.4);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.07, t + 0.02);
  amp.gain.setValueAtTime(0.07, t + 0.26);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  // the trill: a fast wobble of the volume at the start
  const trill = ctx.createOscillator();
  trill.frequency.value = 30;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0.05, t);
  depth.gain.linearRampToValueAtTime(0, t + 0.14);
  trill.connect(depth).connect(amp.gain);
  osc.connect(filter).connect(amp).connect(out);
  osc.start(t);
  trill.start(t);
  osc.stop(t + 0.45);
  trill.stop(t + 0.45);
}

// A small dragon puff: a breath of noise that rises, like a tiny flame.
export function puff(ctx, out, { at = 0 } = {}) {
  const t = ctx.currentTime + at + 0.15;
  const fire = burst(ctx, out, t, 0.4, "bandpass");
  fire.filter.Q.value = 0.7;
  fire.filter.frequency.setValueAtTime(400, t);
  fire.filter.frequency.exponentialRampToValueAtTime(1600, t + 0.2);
  fire.filter.frequency.exponentialRampToValueAtTime(700, t + 0.4);
  fire.gain.linearRampToValueAtTime(0.13, t + 0.04);
  fire.gain.linearRampToValueAtTime(0, t + 0.4);
}

// A happy fire crackle, about 0.7 seconds long. First a warm roar: low noise that swells and opens up, like a breath of air
// into the fire. Over it, two or three soft pops of wood, then a quick run of small crackles that thin out.
// Each crackle is a tiny click of noise at a random pitch and time, so no two taps sound the same.
// The clicks stay below 3600 Hz and die away in a few milliseconds, so the sound is loud but not harsh.
export function crackle(ctx, out, { at = 0 } = {}) {
  const r = () => Math.random();
  const t = ctx.currentTime + at;
  const roar = burst(ctx, out, t, 0.55, "lowpass");
  roar.filter.Q.value = 0.5;
  roar.filter.frequency.setValueAtTime(260, t);
  roar.filter.frequency.exponentialRampToValueAtTime(1300, t + 0.09);
  roar.filter.frequency.exponentialRampToValueAtTime(320, t + 0.55);
  roar.gain.linearRampToValueAtTime(0.26, t + 0.05);
  roar.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

  const pops = 2 + Math.floor(r() * 2);
  for (let i = 0; i < pops; i++) {
    const p = t + 0.02 + i * (0.08 + r() * 0.08);
    tone(ctx, p, 150 + r() * 60, { dur: 0.07, type: "sine", gain: 0.16, slide: -90, out });
    const knock = burst(ctx, out, p, 0.05, "bandpass");
    knock.filter.frequency.value = 700 + r() * 400;
    knock.filter.Q.value = 0.9;
    knock.gain.linearRampToValueAtTime(0.32, p + 0.003);
    knock.gain.exponentialRampToValueAtTime(0.0001, p + 0.05);
  }

  const clicks = 12 + Math.floor(r() * 6);
  for (let i = 0; i < clicks; i++) {
    // Most crackles come early, and they thin out toward the end.
    const c = t + 0.03 + 0.62 * r() ** 1.6;
    const fade = 1 - (c - t) / 0.75;
    const dur = 0.008 + r() * 0.014;
    const click = burst(ctx, out, c, dur, "bandpass");
    click.filter.frequency.value = 1400 + r() * 2200;
    click.filter.Q.value = 1.6;
    click.gain.linearRampToValueAtTime((0.22 + r() * 0.26) * fade, c + 0.001);
    click.gain.exponentialRampToValueAtTime(0.0001, c + dur);
  }
}

// A soft paper swish: noise through a band-pass filter that sweeps up and back down, then a small low flop.
// The cover is heavier, so its swish is lower, slower, and lands with a bigger flop.
// Each swish picks a slightly different length and filter range, so no two page turns sound the same.
export function swish(ctx, out, { at = 0, cover = false } = {}) {
  const r = () => Math.random();
  const t = ctx.currentTime + at;
  const dur = cover ? 0.42 + r() * 0.06 : 0.27 + r() * 0.08;
  const lo = cover ? 700 + r() * 200 : 1300 + r() * 400;
  const hi = cover ? 2000 + r() * 400 : 3200 + r() * 1000;
  const peak = cover ? 0.13 : 0.12;

  const air = burst(ctx, out, t, dur, "bandpass");
  air.filter.Q.value = 0.8;
  air.filter.frequency.setValueAtTime(lo, t);
  air.filter.frequency.exponentialRampToValueAtTime(hi, t + dur * 0.4);
  air.filter.frequency.exponentialRampToValueAtTime(lo * 1.2, t + dur);
  air.gain.linearRampToValueAtTime(peak, t + 0.025);
  air.gain.linearRampToValueAtTime(peak * 0.6, t + dur * 0.45);
  air.gain.linearRampToValueAtTime(0, t + dur);

  const land = t + dur * 0.7;
  const flopDur = cover ? 0.12 : 0.08;
  const flop = burst(ctx, out, land, flopDur, "lowpass");
  flop.filter.frequency.value = cover ? 380 : 520;
  flop.gain.linearRampToValueAtTime(cover ? 0.14 : 0.07, land + 0.006);
  flop.gain.exponentialRampToValueAtTime(0.0001, land + flopDur);
}
