// Small sound effects made with Web Audio. No audio files.

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
    } catch {}
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? "on" : "off"); } catch {}
    if (this.on) this.wake();
    return this.on;
  }

  tone(freq, { at = 0, dur = 0.08, type = "square", gain = 0.04, slide = 0 } = {}) {
    if (!this.on || !this.ctx || this.ctx.state !== "running") return;
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
  page() { this.tone(900, { dur: 0.07, type: "triangle", gain: 0.03, slide: -500 }); this.tone(500, { at: 0.05, dur: 0.06, type: "triangle", gain: 0.02, slide: -200 }); }
}
