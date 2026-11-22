// The hidden extras that this browser found, and the record of each interaction with them.
// The registry (registry.js) calls mark(name) on each interaction with an extra, not only the first.
// mark tells the Worker (POST /api/interaction), and the hosts stop a hint after the guest finds its extra.
// The found list stays in local storage for the next visit.

import { api } from "./api.js";

const KEY = "hc.found";

// family() is the family this browser signed up last, or undefined.
export function createFound({ family }) {
  const seen = new Set(load());
  // A guest who taps fast sends at most one call for each extra in `gapMs`. The test API changes the gap.
  const tracking = { gapMs: 5000, sentAt: new Map() };

  // Records the interaction for the family this browser signed up last. A guest with no family sends nothing.
  // A failed call stays silent.
  function track(egg) {
    const f = family();
    if (!f) return;
    const now = performance.now();
    if (now - (tracking.sentAt.get(egg) ?? -Infinity) < tracking.gapMs) return;
    tracking.sentAt.set(egg, now);
    api.interaction({ id: f.id, token: f.token, egg }).catch(() => {});
  }

  function mark(egg) {
    if (!egg) return;
    track(egg);
    if (seen.has(egg)) return;
    seen.add(egg);
    try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch {}
  }

  return { seen, tracking, mark, has: (egg) => seen.has(egg) };
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
