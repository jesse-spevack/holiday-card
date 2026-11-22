// The registry of the hidden extras. It reads the list in extras/index.js and connects each extra to the scene,
// the hosts' hints, the record of what the guest found, and the test API. No other shared file names an extra.
//
// An extra is the default export of its module:
//   name     the name the page reports to the Worker (EGGS in src/interactions.ts) and the key of its hints. One word.
//   spots    optional. The tap areas: [{ id, x, y, w, h, back }] in room pixels, with the boxes from room.js.
//            A "back" spot (the window) takes only the taps that no other spot takes.
//   hints    optional. Host lines that hint at the extra: [{ host, text }], with host a sprite id from HOSTS in hosts.js.
//            A hint stops after the guest finds the extra.
//   fits     optional. fits(ctx) is false when the hints make no sense for this guest now.
//   setup    optional. setup(ctx) runs once at the start and returns the extra's runtime.
//
// ctx is { scene, sound, reducedMotion, found, extra, mine }:
//   found()       records an interaction with the extra. The registry calls it on each tap of a spot, a sprite, or a look,
//                 so an extra calls it only for a thing that happens with no tap (a car that drives past).
//   extra(name)   the runtime of an extra earlier in the list, for example extra("lamp").dark.
//   mine()        the families that this browser signed up.
//
// The runtime is an object with any of these:
//   layer               a scene layer (Scene.addLayer in scene.js).
//   tap(id)             a tap on the spot `id`.
//   open(id)            false while the spot `id` takes no taps (the book while the album is open).
//   tapSprite(sprite)   a tap on a guest sprite. Return true when the extra reacts; the registry then records it.
//   look(sprite, look)  a guest puts a new look on their own sprite. Return true when that finds the extra.
//   test(helpers)       the extra's part of the test API on window.__hc (test-api.js). helpers is { rect, center, spy }.

import { EXTRAS } from "./extras/index.js";

// Every tap area of every extra, in the order of the list. Plain data, for the scene and the tests.
export const HOTSPOTS = EXTRAS.flatMap((e) => e.spots ?? []);

// The hints of each host: { host: [{ egg, text }] }, in the order of the list.
export function hintsByHost() {
  const out = {};
  for (const e of EXTRAS) for (const { host, text } of e.hints ?? []) (out[host] ??= []).push({ egg: e.name, text });
  return out;
}

// found(name) records an interaction with the extra `name`. mine() is the families that this browser signed up.
export function setupExtras({ scene, sound, reducedMotion, found, mine }) {
  const live = new Map();
  const ctxOf = (e) => ({ scene, sound, reducedMotion, mine, found: () => found(e.name), extra: (name) => live.get(name) });
  for (const e of EXTRAS) {
    const runtime = e.setup?.(ctxOf(e)) ?? {};
    live.set(e.name, runtime);
    if (runtime.layer) scene.addLayer(runtime.layer);
  }
  const owner = new Map(EXTRAS.flatMap((e) => (e.spots ?? []).map((s) => [s.id, e])));
  scene.spots = HOTSPOTS.map((s) => {
    const runtime = live.get(owner.get(s.id).name);
    return runtime.open ? { ...s, open: () => runtime.open(s.id) } : s;
  });
  // Runs `hook` on each extra that has it, and records the first extra whose hook returns true.
  const first = (hook, ...args) => {
    for (const e of EXTRAS) {
      if (live.get(e.name)[hook]?.(...args)) {
        found(e.name);
        return true;
      }
    }
    return false;
  };

  return {
    // A tap on a spot: the registry records it, then the extra acts.
    tap(id) {
      const e = owner.get(id);
      if (!e) return;
      found(e.name);
      live.get(e.name).tap?.(id);
    },
    // A tap on a guest sprite. True when an extra reacts to it.
    tapSprite: (sprite) => first("tapSprite", sprite),
    // A guest puts a new look on their own sprite.
    look: (sprite, look) => first("look", sprite, look),
    // False when the hint for the extra `name` makes no sense for this guest now.
    fits(name) {
      const e = EXTRAS.find((x) => x.name === name);
      return e?.fits ? e.fits(ctxOf(e)) : true;
    },
    // The test API of every extra. A name that two extras give must be the same function.
    // eggs, constants, and loaded give an object, and the test API joins the objects of every extra.
    test(helpers) {
      const api = {};
      const joined = { eggs: [], constants: [], loaded: [] };
      for (const e of EXTRAS) {
        for (const [name, fn] of Object.entries(live.get(e.name).test?.(helpers) ?? {})) {
          if (joined[name]) joined[name].push(fn);
          else if (api[name] && api[name] !== fn) throw new Error(`two extras give the test API ${name}`);
          else api[name] = fn;
        }
      }
      const join = (fns) => () => Object.assign({}, ...fns.map((fn) => fn()));
      return { api, eggs: join(joined.eggs), constants: join(joined.constants), loaded: join(joined.loaded) };
    },
  };
}
