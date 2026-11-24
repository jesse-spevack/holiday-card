// The hidden extras that this browser found, and the record of each interaction with them.
// The registry (registry.js) calls mark(name) on each interaction with an extra, not only the first.
// mark tells the Worker (POST /api/interaction), and the hosts stop a hint after the guest finds its extra.
// A guest can find extras on the form, before there is a family. Those finds wait in the found list, and
// signedUp() sends one call for each of them for the new family, so the record keeps them.
// The found list stays in local storage for the next visit, except in demo mode (demo.js).

import { api } from "./api.js";
import { DEMO } from "./demo.js";

const KEY = "hc.found";

// family() is the family this browser signed up last, or undefined.
export function createFound({ family }) {
  const seen = new Set(load());
  // A guest who taps fast sends at most one call for each extra in `gapMs`. The test API changes the gap and reads `sent`, the count of calls.
  const tracking = { gapMs: 5000, sentAt: new Map(), sent: 0 };

  // Records the interaction for the family this browser signed up last. A guest with no family sends nothing.
  // A failed call stays silent.
  function track(egg) {
    const f = family();
    if (!f) return;
    const now = performance.now();
    if (now - (tracking.sentAt.get(egg) ?? -Infinity) < tracking.gapMs) return;
    tracking.sentAt.set(egg, now);
    tracking.sent++;
    api.interaction({ id: f.id, token: f.token, egg }).catch(() => {});
  }

  function mark(egg) {
    if (!egg) return;
    track(egg);
    if (seen.has(egg)) return;
    seen.add(egg);
    if (DEMO) return;
    try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch {}
  }

  // A new sign-up, or a confirmed invite: one call for each extra in the found list, for the new family.
  // The gap still holds for each extra. Demo mode sends nothing.
  function signedUp() {
    if (DEMO) return;
    for (const egg of seen) track(egg);
  }

  return { seen, tracking, mark, signedUp, has: (egg) => seen.has(egg) };
}

// Demo mode starts with nothing found and keeps its finds in memory, so the browser's own list stays as it was.
function load() {
  if (DEMO) return [];
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
