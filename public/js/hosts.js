// The four hosts and what they say when a guest taps them.

import { hintsByHost } from "./registry.js";

// Each host has a home spot and places to visit (PLACES in room.js). Jess and Jesse also visit the guests. Eddie walks with Audrey.
// Audrey and Eddie are kids, so they toast with cocoa (extras/toast.js).
export const HOSTS = [
  { id: "jessica", name: "Jess", x: 153, y: 130, places: ["table", "rug", "fire"], mingle: true },
  { id: "jesse", name: "Jesse", x: 171, y: 130, places: ["table", "rug", "fire"], mingle: true },
  { id: "daughter", name: "Audrey", x: 98, y: 160, places: ["rug", "fire", "presents", "table"], kid: true },
  { id: "son", name: "Eddie", x: 114, y: 162, follow: "daughter", kid: true },
];

// The lines that thank the guest. The hints at the hidden extras come from the extras (the `hints` of each extra).
const THANKS = {
  jessica: ["Thank you for being here.", "We're grateful for you.", "So happy to see you!"],
  jesse: ["Happy holidays!", "Happy New Year!", "We're so glad you're in our lives.", "I'm normal."],
  daughter: ["So happy you came!", "Thanks for coming to our party!"],
  son: ["Hi! Happy holidays!", "I'm glad you're here!"],
};

// Every line of each host: a string thanks the guest, and { egg, text } hints at the hidden extra `egg`.
const HINTS = hintsByHost();
export const HOST_LINES = Object.fromEntries(HOSTS.map(({ id }) => [id, [...THANKS[id], ...(HINTS[id] ?? [])]]));

// The lines that a host can say now: the thanks, and the hints where shows(egg) is true.
// kind "hint" keeps only the hints, and "thanks" only the thanks.
export function hostLines(id, shows, kind = "any") {
  return HOST_LINES[id]
    .map((l) => (typeof l === "string" ? { text: l } : l))
    .filter((l) => (l.egg ? kind !== "thanks" && shows(l.egg) : kind !== "hint"));
}

// A random line for a host: never the line this host said last, and only the hints where shows(egg) is true.
// kind is as in hostLines. A host with no line of that kind says any line.
export function hostLine(sprite, shows, kind = "any") {
  const of = (k) => hostLines(sprite.id, shows, k).filter((l) => l.text !== sprite.lastLine);
  const kept = of(kind);
  const lines = kept.length ? kept : of("any");
  const line = lines[Math.floor(Math.random() * lines.length)];
  sprite.lastLine = line.text;
  return line.text;
}
