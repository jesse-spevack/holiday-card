import { Scene, HOSTS, HOST_LINES, loadImage } from "./js/scene.js";
import { ROOM_W, ROOM_H, DREIDELS, PLANTS } from "./js/room.js";
import { h } from "./js/dom.js";
import { Sound } from "./js/sound.js";
import { api } from "./js/api.js";
import { openPicker } from "./js/picker.js";
import { Album } from "./js/album.js";
import { Dreidel } from "./js/dreidel.js";
import { Eggs } from "./js/eggs.js";
import { react, isPet } from "./js/pets.js";
import { Night } from "./js/night.js";
import { Toast } from "./js/toast.js";
import { Plants } from "./js/plants.js";
import { Fire } from "./js/fire.js";
import { Presents } from "./js/presents.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sound = new Sound();
// The hidden thing that each tap area finds, for the hosts' hints.
const EGG_OF = { book: "album", lamp: "lamp", "dreidel-left": "dreidel", "dreidel-right": "dreidel", menorah: "menorah", window: "star", wine: "toast", fire: "fire", presents: "presents" };
// The modules make their random choices in this order (snow, the first Waymo, the dreidel's snow). Keep it.
const scene = new Scene({
  stage: $("stage"), world: $("world"), canvas: $("canvas"), overlay: $("overlay"), reducedMotion,
  onTap: (sprite) => onTap(sprite),
  onHover: (sprite) => onHover(sprite),
  onHotspot: (id) => {
    markFound(PLANTS[id] ? "plants" : EGG_OF[id]);
    if (id === "book") album.open();
    else if (DREIDELS[id]) dreidel.open(() => scene.roomRect(DREIDELS[id]));
    else if (id === "wine") toast.tap();
    else if (PLANTS[id]) plants.tap(id);
    else if (id === "fire") fire.tap();
    else if (id === "presents") presents.tap();
    else eggs.tap(id);
  },
  onLayout: (view) => night.layout(view),
});
const app = $("app");
const dialog = $("dialog");
const album = new Album({ sound, reducedMotion, bookRect: () => scene.bookRect(), showBook: (on) => scene.showBook(on) });
const eggs = new Eggs({ scene, sound, reducedMotion, onFound: (egg) => markFound(egg) });
scene.addLayer(eggs);
const toast = new Toast({ scene, sound, reducedMotion });
scene.addLayer(toast);
const plants = new Plants({ scene, sound, reducedMotion, dark: () => !eggs.lampOn });
scene.addLayer(plants);
const fire = new Fire({ scene, sound, reducedMotion });
scene.addLayer(fire);
const presents = new Presents({ scene, sound });
scene.addLayer(presents);
const dreidel = new Dreidel({ sound, reducedMotion });
const night = new Night({ stage: $("stage"), reducedMotion, clock: scene });
const again = $("again");
const TUCK_MS = 7000;
const SAVED = "hc.families";
const POLL_MS = 30000;

// "?new" shows the site as a first-time guest sees it. It forgets this browser's families
// (the sound setting stays), then takes "new" out of the address, so a reload works as usual.
if (new URLSearchParams(location.search).has("new")) {
  try { localStorage.removeItem(SAVED); } catch {}
  const rest = location.search.slice(1).split("&").filter((p) => p && decodeURIComponent(p.split("=")[0]) !== "new");
  history.replaceState(history.state, "", location.pathname + (rest.length ? `?${rest.join("&")}` : "") + location.hash);
}

const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const state = {
  step: 1,
  envelope: "",
  household: "",
  householdAsked: "",
  members: null,
  membersPromise: null,
  addressQuery: "",
  address: null,
  unit: "",
  session: newSession(),
  looks: {},
  mine: loadMine(),
};

// ---------- saved families (this browser's own) ----------
function loadMine() {
  try { return JSON.parse(localStorage.getItem(SAVED)) || []; } catch { return []; }
}
function saveMine() {
  try { localStorage.setItem(SAVED, JSON.stringify(state.mine)); } catch {}
}
const mineById = (id) => state.mine.find((f) => f.id === id);

// ---------- hidden things this browser found ----------
// The one hook for a hidden extra: call markFound(egg) on each interaction with it, not only the first.
// It tells the Worker (see track), and the hosts stop a hint after the guest finds its thing.
// The found list stays for the next visit. A new egg name must also go in EGGS in src/interactions.ts.
const FOUND = "hc.found";
const found = new Set(loadFound());
function loadFound() {
  try { return JSON.parse(localStorage.getItem(FOUND)) || []; } catch { return []; }
}
function markFound(egg) {
  if (!egg) return;
  track(egg);
  if (found.has(egg)) return;
  found.add(egg);
  try { localStorage.setItem(FOUND, JSON.stringify([...found])); } catch {}
}

// Records the interaction for the family this browser signed up last. A guest with no family sends nothing.
// A guest who taps fast sends at most one call for each egg in `gapMs`. A failed call stays silent.
const tracking = { gapMs: 5000, sentAt: new Map() };
function track(egg) {
  const family = state.mine.at(-1);
  if (!family) return;
  const now = performance.now();
  if (now - (tracking.sentAt.get(egg) ?? -Infinity) < tracking.gapMs) return;
  tracking.sentAt.set(egg, now);
  api.interaction({ id: family.id, token: family.token, egg }).catch(() => {});
}

// ---------- Turnstile: Cloudflare's check that a real browser sends the address ----------
let turnstileWidget = null;

function renderTurnstile(siteKey) {
  if (!siteKey) return;
  const render = () => {
    turnstileWidget = window.turnstile.render("#turnstile", { sitekey: siteKey, appearance: "interaction-only" });
  };
  if (window.turnstile) render();
  else window.addEventListener("load", () => window.turnstile && render(), { once: true });
}

function turnstileToken() {
  if (turnstileWidget === null || !window.turnstile) return "";
  return window.turnstile.getResponse(turnstileWidget) || "";
}

function resetTurnstile() {
  if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
}

// ---------- host speech, typed out ----------
let typing = null;
function typeOut(el, text) {
  if (typing) typing.finish();
  if (reducedMotion) {
    el.textContent = text;
    return Promise.resolve();
  }
  // The rest of the text waits in place, unseen. So the dialog has its full height from the first letter,
  // the stage and the room above it hold still, and no word jumps to the next line while it types.
  const shown = document.createTextNode("");
  const rest = h("span", { style: "visibility: hidden", "aria-hidden": "true" }, text);
  el.replaceChildren(shown, rest);
  return new Promise((resolve) => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      shown.data = text.slice(0, i);
      rest.textContent = text.slice(i);
      if (i % 2 === 0 && text[i - 1] !== " ") sound.blip();
      if (i >= text.length) finish();
    }, 26);
    function finish() {
      clearInterval(timer);
      el.textContent = text;
      typing = null;
      resolve();
    }
    typing = { finish };
  });
}
dialog.addEventListener("pointerdown", () => typing?.finish());

function frame(sayText, ...body) {
  dialog.classList.toggle("small", state.step === "done");
  dialog.innerHTML = "";
  const say = h("p", { class: "say", id: "say" });
  dialog.append(h("span", { class: "speaker" }, "Jesse, Jess, Eddie & Audrey Spevack"), say, ...body.flat().filter(Boolean));
  typeOut(say, sayText);
  const input = dialog.querySelector("input");
  if (input && !matchMedia("(pointer: coarse)").matches) input.focus();
}

// Password managers show their icons in any text field unless told not to.
const NO_PASSWORD_MANAGER = { "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true, "data-form-type": "other" };

function answer({ id, label, value, placeholder, maxlength = 120, autocomplete, onEnter, onInput }) {
  const input = h("input", {
    id, value, placeholder, maxlength, autocomplete: autocomplete || "off", ...NO_PASSWORD_MANAGER,
    enterkeyhint: "next", spellcheck: "false",
    onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } },
    onInput,
  });
  return h("div", { class: "answer" },
    h("label", { for: id, class: "sr-only" }, label),
    h("span", { class: "caret", "aria-hidden": "true" }, "▸"),
    input);
}

const btn = (text, onClick, cls = "btn", attrs = {}) => h("button", { type: "button", class: cls, onClick, ...attrs }, text);
const errorLine = () => h("p", { class: "error", id: "error", role: "alert" });
function showError(text) {
  const el = $("error");
  if (el) el.textContent = text;
  sound.oops();
}

// ---------- steps ----------
function go(step) {
  clearTimeout(tuckTimer);
  state.step = step;
  scene.closePop();
  ({ 1: stepEnvelope, 2: stepHousehold, 3: stepAddress, unit: stepUnit, 4: stepConfirm, done: stepDone }[step])();
}

function stepEnvelope() {
  const next = () => {
    const v = $("f-envelope").value.trim();
    if (!v) return showError("We need something here.");
    state.envelope = v;
    sound.candle();
    go(2);
  };
  frame("We're sending holiday cards! Whose name goes on the envelope?",
    answer({ id: "f-envelope", label: "Name on the envelope", value: state.envelope, placeholder: "The Garcia Family", onEnter: next }),
    h("p", { class: "hint" }, "Write it how you'd like it on the envelope."),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, h("span", { class: "end" }, btn("Next ▸", next))));
}

function stepHousehold() {
  const next = () => {
    const v = $("f-household").value.trim();
    if (!v) return showError("We need something here.");
    state.household = v;
    readHousehold();
    sound.candle();
    go(3);
  };
  frame("Who lives at your house?",
    answer({ id: "f-household", label: "Who lives at your house", value: state.household, placeholder: "Sofia, Dan, Mia, and Biscuit the corgi", maxlength: 300, onEnter: next }),
    h("p", { class: "hint" }, "Pets count. I guess."),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Back", () => go(1), "btn ghost"), h("span", { class: "end" }, btn("Next ▸", next))));
}

// The LLM reads the household while the guest types the address.
function readHousehold() {
  if (state.householdAsked === state.household && state.membersPromise) return;
  state.householdAsked = state.household;
  state.members = null;
  scene.removeFamily("pending");
  const asked = state.household;
  state.membersPromise = api.household(asked).then(async ({ members }) => {
    if (asked !== state.household) return state.membersPromise;
    state.members = assignLooks(members);
    await showPending(state.members);
    return state.members;
  });
  state.membersPromise.catch(() => {});
}

let searchTimer = null;
let searchSeq = 0;
function stepAddress() {
  const list = h("ul", { class: "choices", id: "choices" });
  const credit = h("p", { class: "credit", id: "credit", hidden: true }, "powered by Google");
  const manual = h("div", { id: "manual", hidden: true }, btn("Use what I typed", () => {
    const v = $("f-address").value.trim();
    if (!v) return showError("We need something here.");
    state.address = { street: v, city: "", state: "", zip: "", formatted: v, manual: true };
    sound.select();
    go("unit");
  }, "btn ghost"));
  const search = () => {
    const q = $("f-address").value.trim();
    state.addressQuery = q;
    clearTimeout(searchTimer);
    $("error").textContent = "";
    if (q.length < 3) {
      list.innerHTML = "";
      credit.hidden = true;
      manual.hidden = true;
      return;
    }
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      let suggestions = [];
      try {
        ({ suggestions } = await api.places(q, state.session));
      } catch {
        suggestions = [];
      }
      if (seq !== searchSeq) return;
      list.innerHTML = "";
      credit.hidden = !suggestions.length;
      for (const s of suggestions) {
        list.append(h("li", {}, h("button", { type: "button", class: "choice", onClick: () => pick(s) },
          h("span", {}, s.main, h("span", { class: "sub" }, s.secondary)))));
      }
      const noMatch = !suggestions.length && q.length >= 6;
      manual.hidden = !noMatch;
      $("error").textContent = noMatch ? "We can't find that one. Type the full address and we'll use it as written." : "";
    }, 250);
  };
  const pick = async (s) => {
    sound.select();
    try {
      const { address } = await api.place(s.id, state.session);
      state.address = address;
      state.session = newSession();
      go("unit");
    } catch {
      showError("Something went wrong. Try again?");
    }
  };
  frame("Where should we mail your card?",
    answer({
      id: "f-address", label: "Street address", value: state.addressQuery, placeholder: "Start typing your street",
      onInput: search, onEnter: () => list.querySelector("button")?.click(),
    }),
    list, manual, errorLine(), h("div", { class: "spacer" }), credit,
    h("div", { class: "actions" }, btn("Back", () => go(2), "btn ghost")));
  if (state.addressQuery) search();
}

function stepUnit() {
  const next = (skip) => {
    state.unit = skip ? "" : $("f-unit").value.trim();
    sound.candle();
    go(4);
  };
  frame("Apartment or unit?",
    answer({ id: "f-unit", label: "Apartment or unit", value: state.unit, placeholder: "Apt 2B", maxlength: 40, onEnter: () => next(false) }),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Back", () => go(3), "btn ghost"),
      h("span", { class: "end" }, btn("Skip", () => next(true), "btn ghost"), btn("Next ▸", () => next(false)))));
}

function addressLines() {
  const a = state.address;
  const street = state.unit ? `${a.street}, ${state.unit}` : a.street;
  const place = a.manual ? "" : `${a.city}, ${a.state} ${a.zip}`.trim();
  return [state.envelope, street, place].filter(Boolean).join("\n");
}

function stepConfirm() {
  frame("We'll mail your card to:",
    h("p", { class: "address" }, addressLines()),
    h("p", { class: "say", style: "font-size:19px" }, "Look right?"),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Fix it", () => go(3), "btn ghost"),
      h("span", { class: "end" }, btn("Yes, send it ▸", send, "btn", { id: "send" }))));
}

// The family walks into the room while the Sheet saves.
async function send() {
  const button = $("send");
  button.disabled = true;
  $("error").textContent = "";
  try {
    const members = state.members || (await state.membersPromise);
    const family = scene.families.get("pending");
    if (!family.entered) {
      family.entered = true;
      sound.arrive();
      const center = scene.enter(scene.familySprites("pending"));
      scene.focus(center.x, center.y - 12, 1);
    }
    const address = { ...state.address, unit: state.unit };
    const { id, token } = await api.submit({ envelope: state.envelope, household: state.household, members, address, turnstileToken: turnstileToken() });
    const saved = { id, token, name: state.envelope, members, bubbles: [] };
    state.mine.push(saved);
    saveMine();
    scene.renameFamily("pending", { id, name: saved.name, mine: true });
    resetTurnstile();
    go("done");
  } catch {
    resetTurnstile();
    button.disabled = false;
    showError("Something went wrong. Try again?");
  }
}

// The thank-you stays for a few seconds. Then the dialog slides away, and the camera
// moves back out so the guest sees the whole party.
let tuckTimer = null;
function stepDone() {
  frame("Thank you. You mean a lot to us.",
    h("p", { class: "hint" }, "Your family is at our party now. Tap them to change a look or say something. Then poke around the room. A few things in here might surprise you."),
    btn("Add another address", restart, "link"));
  tuckTimer = setTimeout(() => {
    tuck(true);
    scene.focus(ROOM_W / 2, ROOM_H / 2, 0);
  }, TUCK_MS);
}

// A tucked dialog gives its space to the room. The top bar then shows "Add another address".
function tuck(away) {
  if (app.classList.contains("tucked") === away) return;
  const hadFocus = dialog.contains(document.activeElement);
  again.hidden = !away;
  if (away) {
    // The height starts from its current size, so it can slide down to zero.
    dialog.style.height = `${dialog.offsetHeight}px`;
    dialog.getBoundingClientRect();
    dialog.style.height = "0px";
  } else {
    dialog.style.height = "";
  }
  app.classList.toggle("tucked", away);
  night.showGreeting(away);
  if (away && hadFocus) again.focus();
}

function restart() {
  Object.assign(state, {
    envelope: "", household: "", householdAsked: "", members: null, membersPromise: null,
    addressQuery: "", address: null, unit: "", session: newSession(),
  });
  scene.focus(ROOM_W / 2, ROOM_H / 2, 0);
  go(1);
  tuck(false);
}

// ---------- looks ----------
const imageCache = new Map();
const image = (src) => {
  if (!imageCache.has(src)) imageCache.set(src, loadImage(src));
  return imageCache.get(src);
};
const lookById = (id) => Object.values(state.looks).flat().find((l) => l.id === id);

// A family arrives in regular looks of its own type. The look picker offers the rest.
function assignLooks(members) {
  const used = new Set();
  return members.map(({ type }) => {
    const all = state.looks[type]?.length ? state.looks[type] : state.looks.adult || [];
    const regular = all.filter((l) => !l.silly);
    const options = regular.length ? regular : all;
    const fresh = options.filter((l) => !used.has(l.id));
    const pool = fresh.length ? fresh : options;
    const look = pool[Math.floor(Math.random() * pool.length)];
    if (look) used.add(look.id);
    return { type: state.looks[type]?.length ? type : "adult", look: look?.id || "" };
  });
}

async function spritesFor(familyId, members, extra = {}) {
  const out = [];
  for (const [index, m] of members.entries()) {
    const look = lookById(m.look) || lookById(assignLooks([{ type: m.type }])[0].look);
    if (!look) continue;
    const img = await image(look.src).catch(() => null);
    if (!img) continue;
    out.push(scene.addSprite({ img, familyId, index, type: m.type, look: look.id, ...extra }));
  }
  return out;
}

async function showPending(members) {
  scene.removeFamily("pending");
  scene.families.set("pending", { id: "pending", name: state.envelope });
  const sprites = await spritesFor("pending", members, { mine: true });
  scene.placeAtEntrance(sprites);
  sound.pop();
}

// ---------- the party ----------
async function addFamily(f, { walkIn, mine = false }) {
  scene.families.set(f.id, { id: f.id, name: f.name, mine });
  const sprites = await spritesFor(f.id, f.members, { mine });
  sprites.forEach((s) => { s.bubble = f.bubbles?.[s.index] || ""; });
  scene.enter(sprites, { walkIn });
  return sprites;
}

async function loadParty(first) {
  let families = [];
  try {
    ({ families } = await api.party());
  } catch {
    return;
  }
  const seen = new Set(families.map((f) => f.id));
  for (const f of families) {
    const mine = !!mineById(f.id);
    if (scene.families.has(f.id)) {
      // keep bubbles fresh for everyone else's families
      if (!mine) scene.familySprites(f.id).forEach((s) => { s.bubble = f.bubbles?.[s.index] || ""; });
      continue;
    }
    if (mine) continue;
    await addFamily(f, { walkIn: !first });
  }
  for (const id of [...scene.families.keys()]) {
    if (id !== "pending" && !seen.has(id) && !mineById(id) && !first) scene.removeFamily(id);
  }
}

function cycleBubbles() {
  const talkers = scene.sprites.filter((s) => s.bubble && !s.bubbleEl);
  const s = talkers[Math.floor(Math.random() * talkers.length)];
  if (s) scene.say(s, s.bubble, 4);
}

const hostSprites = () => scene.sprites.filter((s) => s.host);

// On a computer, hovering over a family shows its name, and hovering over the hosts shows each of their names.
let hovered = null;
function onHover(sprite) {
  const key = !sprite ? null : sprite.host ? "hosts" : sprite.familyId === "pending" ? null : sprite.familyId;
  if (key === hovered) return;
  if (hovered === "hosts") scene.hideNames(hostSprites());
  else if (hovered) scene.hideTag(hovered);
  hovered = key;
  if (key === "hosts") scene.showNames(hostSprites());
  else if (key) scene.setTag(key, scene.families.get(key)?.name ?? "");
}

function onTap(sprite) {
  sound.wake();
  if (sprite.host) {
    sound.select();
    scene.pause(sprite, 3);
    scene.showNames(hostSprites(), 3);
    scene.say(sprite, hostLine(sprite), 4);
    return;
  }
  // A pet reacts to every tap. In your own family, the editor opens at the same time.
  const pet = react(sprite, { time: scene.time, sound });
  if (pet) markFound("pets");
  const saved = mineById(sprite.familyId);
  if (!saved) {
    const fam = scene.families.get(sprite.familyId);
    if (fam && fam.id !== "pending") scene.setTag(fam.id, fam.name, { seconds: 3 });
    if (sprite.bubble) scene.say(sprite, sprite.bubble, 4);
    return;
  }
  openEditor(sprite, saved, { quiet: !!pet });
}

// Some hints make sense only for some guests: the pets hint needs a pet at the party,
// and the silly looks hint needs a family of your own to dress up.
const HINT_FITS = {
  pets: () => scene.sprites.some(isPet),
  silly: () => state.mine.length > 0,
};

// A random line for a host: never the line this host said last, and no hint for a thing the guest found.
function hostLine(sprite) {
  const lines = HOST_LINES[sprite.id]
    .map((l) => (typeof l === "string" ? { text: l } : l))
    .filter((l) => !l.egg || (!found.has(l.egg) && (HINT_FITS[l.egg]?.() ?? true)))
    .filter((l) => l.text !== sprite.lastLine);
  const line = lines[Math.floor(Math.random() * lines.length)];
  sprite.lastLine = line.text;
  return line.text;
}

// A pet's own sound plays in place of the editor's chime.
function openEditor(sprite, saved, { quiet = false } = {}) {
  if (!quiet) sound.select();
  const input = h("input", { id: "f-bubble", autocomplete: "off", ...NO_PASSWORD_MANAGER, maxlength: 40, value: saved.bubbles[sprite.index] || "", placeholder: "Say something", "aria-label": "Say something" });
  const save = async () => {
    const text = input.value.trim().slice(0, 40);
    saved.bubbles[sprite.index] = text;
    sprite.bubble = text;
    saveMine();
    scene.closePop();
    scene.say(sprite, text, 6);
    api.sprite({ id: saved.id, token: saved.token, index: sprite.index, bubble: text }).catch(() => sound.oops());
  };
  const wear = async (look) => {
    sprite.img = await image(look.src);
    sprite.look = look.id;
    if (look.silly) markFound("silly");
    saved.members[sprite.index].look = look.id;
    saveMine();
    sound.pop();
    sprite.popAt = scene.time;
    scene.updateOverlay();
    api.sprite({ id: saved.id, token: saved.token, index: sprite.index, look: look.id }).catch(() => sound.oops());
  };
  const newLook = (e) => {
    sound.select();
    openPicker({ library: state.looks, type: sprite.type, current: sprite.look, onPick: wear, returnFocus: e.currentTarget });
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  scene.openPop(sprite, h("div", {}, input, h("div", { class: "row" }, btn("New look", newLook, "btn ghost"), btn("Save", save))));
  input.focus();
}

// ---------- start ----------
async function start() {
  const soundBtn = $("sound");
  const syncSound = () => {
    soundBtn.setAttribute("aria-pressed", String(sound.on));
    soundBtn.setAttribute("aria-label", sound.on ? "Sound on" : "Sound off");
  };
  syncSound();
  soundBtn.addEventListener("click", () => { sound.toggle(); syncSound(); });
  again.addEventListener("click", restart);
  document.addEventListener("pointerdown", () => sound.wake(), { capture: true });
  document.addEventListener("keydown", () => sound.wake(), { capture: true });

  api.config().then(({ turnstileSiteKey }) => renderTurnstile(turnstileSiteKey)).catch(() => {});
  // A new guest gets the first question at once. So the dialog has its real height before the room shows,
  // and the room does not jump when the question appears.
  if (!state.mine.length) go(1);
  const [looks] = await Promise.all([
    fetch("/assets/looks.json").then((r) => r.json()).catch(() => ({})),
    scene.load("/assets/room.png"),
  ]);
  state.looks = looks;

  for (const host of HOSTS) {
    const img = await image(`/assets/hosts/${host.id}.png`);
    scene.addHost(host, img);
  }

  for (const f of state.mine) await addFamily(f, { walkIn: false, mine: true });
  await loadParty(true);
  // A hidden tab does not ask for the party. The next check after the guest comes back does.
  setInterval(() => { if (!document.hidden) loadParty(false); }, POLL_MS);
  setInterval(cycleBubbles, 3500);

  if (state.mine.length) {
    const last = scene.familySprites(state.mine.at(-1).id);
    if (last.length) scene.focus(last[0].x, last[0].y - 12, 1);
    go("done");
  }
}

// "?test" loads the test API for the end-to-end tests (public/js/test-api.js). A guest never loads it.
if (new URLSearchParams(location.search).has("test")) {
  import("./js/test-api.js").then(({ testApi }) => { window.__hc = testApi({ scene, sound, eggs, dreidel, toast, plants, fire, presents, album, found, tracking }); });
}
start();
