// Small sound effects made with Web Audio. The photo album also plays a few recorded book sounds.

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

  tone(freq, { at = 0, dur = 0.08, type = "square", gain = 0.04, slide = 0 } = {}) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  blip() { this.tone(520 + Math.random() * 80, { dur: 0.035, gain: 0.025 }); }
  select() { this.tone(660, { dur: 0.06 }); this.tone(990, { at: 0.06, dur: 0.08 }); }
  pop() { this.tone(400, { dur: 0.1, slide: 500, gain: 0.035 }); }
  candle() { this.tone(1046, { dur: 0.3, type: "sine", gain: 0.06 }); this.tone(1568, { at: 0.08, dur: 0.4, type: "sine", gain: 0.04 }); }
  door() {
    this.tone(180, { dur: 0.18, type: "triangle", gain: 0.08, slide: -60 });
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, { at: 0.25 + i * 0.09, dur: 0.18, type: "square", gain: 0.035 }));
  }
  oops() { this.tone(220, { dur: 0.15, type: "triangle", gain: 0.06, slide: -80 }); }
  // The book sounds play a recording. Until it loads, or if it fails to load, they play the swish.
  pageTurn() { if (this.ready() && !this.sample(FLIPS, 0.18)) swish(this.ctx, this.ctx.destination); }
  coverOpen() { if (this.ready() && !this.sample(["book-open"], 0.13)) swish(this.ctx, this.ctx.destination, { cover: true }); }
  coverClose() { if (this.ready() && !this.sample(["book-close"], 0.09)) swish(this.ctx, this.ctx.destination, { cover: true }); }

  // Fetches and decodes the recordings one time, after the first tap, so the page load stays light.
  loadSamples() {
    if (this.samples || !this.ctx) return;
    const ctx = this.ctx;
    this.samples = {};
    for (const name of [...FLIPS, "book-open", "book-close"]) {
      fetch(`/assets/sounds/${name}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${name}: ${r.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { this.samples[name] = buf; })
        .catch(() => {});
    }
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
}

// Page turns from Kenney's RPG Audio pack (CC0). See public/assets/sounds/LICENSE.txt.
const FLIPS = ["book-flip-1", "book-flip-2", "book-flip-3"];

// One second of pink noise for each audio context. Every swish starts at a random place in it.
// Pink noise has less hiss than white noise, so the swish sounds like soft paper.
const noises = new WeakMap();
function noise(ctx) {
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
  src.buffer = noise(ctx);
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
