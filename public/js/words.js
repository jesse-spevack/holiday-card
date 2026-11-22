// Words that show on the room for a moment, such as "Make a wish" (extras/star.js) and the menorah's question (extras/menorah.js).
// words is { text, x, y, ms, sky }: the text is centered on x with its top at y, in room pixels. A sky line has no box.
// Only one set of words shows at a time: new words replace the old words, so they never overlap.

import { ROOM_W } from "./room.js";

const shown = new WeakMap();

export function showWords(scene, words) {
  hideWords(scene);
  const el = document.createElement("div");
  el.className = words.sky ? "wish sky" : "wish";
  el.textContent = words.text;
  el.style.setProperty("--ms", `${words.ms}ms`);
  scene.overlay.append(el);
  // Keep the words inside the room, 12 screen pixels or more from its edges.
  const reach = ((el.offsetWidth / 2 + 12) / scene.overlay.clientWidth) * ROOM_W;
  scene.pin(el, Math.min(Math.max(words.x, reach), ROOM_W - reach), words.y);
  shown.set(scene, { el, of: words, timer: setTimeout(() => hideWords(scene), words.ms) });
}

// Hides the words that show now. With `of`, only when those are the words that show.
export function hideWords(scene, of = null) {
  const w = shown.get(scene);
  if (!w || (of && w.of !== of)) return;
  clearTimeout(w.timer);
  w.el.remove();
  shown.delete(scene);
}
