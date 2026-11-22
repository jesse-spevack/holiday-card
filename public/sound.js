const STORAGE_KEY = "holiday-card:sound";

let context = null;
let enabled = readSetting();

function readSetting() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {}
}

// Browsers allow audio only after a tap, so every caller runs inside a user gesture or after one.
function audio() {
  if (!enabled) return null;
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") context.resume();
  return context;
}

function note(ctx, frequency, start, length, { type = "triangle", volume = 0.18 } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

export function playDoorChime() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  note(ctx, 1046.5, t, 0.9);
  note(ctx, 784, t + 0.22, 1.1);
  note(ctx, 2093, t, 0.4, { type: "sine", volume: 0.04 });
}

export function playBlip() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  note(ctx, 660, t, 0.08, { type: "square", volume: 0.05 });
  note(ctx, 990, t + 0.06, 0.1, { type: "square", volume: 0.05 });
}

export function unlockAudio() {
  audio();
}
