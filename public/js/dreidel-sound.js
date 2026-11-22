// The sounds of the dreidel game. The whirr, the ticks, the clack, and the tunes are made with Web Audio.
// The gelt coins play two short recordings from Kenney's RPG Audio pack (CC0, see public/assets/sounds/).
// It uses the page's Sound for the on/off setting and the audio context.

const GELT = { pile: "/assets/sounds/gelt-pile.m4a", few: "/assets/sounds/gelt-few.m4a" };

export class DreidelSound {
  constructor(sound) {
    this.sound = sound;
    this.samples = null;
    this.spin = null;
  }

  get ctx() { return this.sound.ctx; }
  ready() { return this.sound.ready(); }

  // Fetches the coin recordings one time, on the first open, so the page load stays light.
  load() {
    if (this.samples || !this.ready()) return;
    const ctx = this.ctx;
    this.samples = {};
    for (const [name, url] of Object.entries(GELT)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { this.samples[name] = buf; })
        .catch(() => {});
    }
  }

  // The whirr of the spin. speed(t) gives the turns per second at t seconds, for `seconds`.
  // Noise through a band-pass filter flutters once for each side that passes, and slows with the dreidel.
  whirr(seconds, speed) {
    this.stop();
    if (!this.ready() || seconds <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const steps = Math.max(2, Math.ceil(seconds * 30));
    const at = (i) => speed((i / (steps - 1)) * seconds);
    const top = Math.max(0.1, at(0));
    const curve = (fn) => Float32Array.from({ length: steps }, (_, i) => fn(at(i)));

    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.6;
    filter.frequency.setValueCurveAtTime(curve((s) => 260 + 260 * s), t, seconds);
    const flutter = ctx.createGain();
    flutter.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.setValueCurveAtTime(curve((s) => Math.max(1, s * 4)), t, seconds);
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(flutter.gain);
    const amp = ctx.createGain();
    const level = curve((s) => 0.02 + 0.3 * Math.min(1, s / top));
    level[0] = 0;
    amp.gain.setValueCurveAtTime(level, t, seconds);
    // A gate after the level curve, so a stop can fade out in the middle of the curve.
    const gate = ctx.createGain();
    src.connect(filter).connect(flutter).connect(amp).connect(gate).connect(ctx.destination);
    src.start(t, Math.random() * 0.5);
    lfo.start(t);
    src.stop(t + seconds + 0.05);
    lfo.stop(t + seconds + 0.05);
    this.spin = { src, lfo, gate };
  }

  // Stops the whirr at once, for a close in the middle of a spin.
  stop() {
    if (!this.spin) return;
    const { src, lfo, gate } = this.spin;
    this.spin = null;
    try {
      const t = this.ctx.currentTime;
      gate.gain.setValueAtTime(1, t);
      gate.gain.linearRampToValueAtTime(0, t + 0.04);
      src.stop(t + 0.05);
      lfo.stop(t + 0.05);
    } catch {}
  }

  // A small wooden tick, when the wobbling dreidel knocks its edge. strength is 0 to 1.
  tick(strength = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    knock(ctx, t, { freq: 2200 + Math.random() * 600, dur: 0.03, gain: 0.05 + 0.12 * strength, q: 4 });
    ping(ctx, t, 1300 + Math.random() * 200, 0.035, 0.02 + 0.03 * strength);
  }

  // The clack when the dreidel falls on its side. A soft one for the bounce after it.
  clack(strength = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    knock(ctx, t, { freq: 1500, dur: 0.06, gain: 0.32 * strength, q: 1.4 });
    ping(ctx, t, 560, 0.09, 0.1 * strength, -120);
    ping(ctx, t, 1020, 0.05, 0.05 * strength);
  }

  // A soft lift, when a guest picks up the fallen dreidel to spin it again.
  lift() {
    if (!this.ready()) return;
    ping(this.ctx, this.ctx.currentTime, 700, 0.06, 0.03, 300);
  }

  // A short sound for each result.
  result(face) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (face === "gimel") {
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => note(ctx, t + 0.05 + i * 0.075, f, 0.16, 0.035));
      note(ctx, t + 0.05 + 5 * 0.075, 2093, 0.3, 0.03, "triangle");
      this.play("pile", 0.45, 0.12);
    } else if (face === "hei") {
      note(ctx, t + 0.05, 1568, 0.12, 0.03);
      note(ctx, t + 0.13, 2093, 0.2, 0.03);
      this.play("few", 0.5, 0.05);
    } else if (face === "shin") {
      // one coin goes into the pot
      ping(ctx, t + 0.08, 2093, 0.18, 0.05);
      ping(ctx, t + 0.08, 3136, 0.12, 0.02);
      ping(ctx, t + 0.2, 2349, 0.12, 0.025);
    } else {
      note(ctx, t + 0.05, 659, 0.14, 0.03, "triangle");
      note(ctx, t + 0.19, 523, 0.22, 0.03, "triangle");
    }
  }

  // Plays a loaded recording. Until it loads, a few soft pings stand in for the coins.
  play(name, gain, at = 0) {
    const ctx = this.ctx;
    const buf = this.samples?.[name];
    if (!buf) {
      for (let i = 0; i < (name === "pile" ? 5 : 2); i++) ping(ctx, ctx.currentTime + at + i * 0.06, 2400 + Math.random() * 900, 0.08, 0.03);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(amp).connect(ctx.destination);
    src.start(ctx.currentTime + at);
  }
}

// One second of white noise for each audio context.
const noises = new WeakMap();
function noise(ctx) {
  let buf = noises.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noises.set(ctx, buf);
  return buf;
}

// A short burst of noise through a band-pass filter: the hard part of a knock on wood.
function knock(ctx, t, { freq, dur, gain, q }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(t, Math.random() * 0.8);
  src.stop(t + dur + 0.02);
}

// A sine tone that dies away fast: the ring of the wood, or a coin.
function ping(ctx, t, freq, dur, gain, slide = 0) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// One note of a tune, in the square wave of the other sounds on the page.
function note(ctx, t, freq, dur, gain, type = "square") {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
