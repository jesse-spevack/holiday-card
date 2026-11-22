import { Scene, HOSTS, HOST_LINES, loadImage } from "./js/scene.js";
import { Sound } from "./js/sound.js";
import { api } from "./js/api.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sound = new Sound();
const scene = new Scene({ stage: $("stage"), world: $("world"), canvas: $("canvas"), overlay: $("overlay"), reducedMotion });
const dialog = $("dialog");
const SAVED = "hc.families";
const POLL_MS = 30000;

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

// ---------- tiny DOM helper ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// ---------- candles ----------
function candles(lit) {
  const box = $("candles");
  box.setAttribute("aria-label", lit >= 4 ? "All 4 candles lit" : `${lit} of 4 candles lit`);
  box.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const on = i < lit;
    box.insertAdjacentHTML("beforeend", on
      ? '<svg aria-hidden="true" width="10" height="24" viewBox="0 0 10 24"><rect x="4" y="0" width="2" height="2" fill="#fff2c4"/><rect x="3" y="2" width="4" height="5" fill="#ffd27a"/><rect x="2" y="8" width="6" height="16" fill="#a9c4e6"/></svg>'
      : '<svg aria-hidden="true" width="10" height="24" viewBox="0 0 10 24"><rect x="4" y="5" width="2" height="3" fill="#5a5468"/><rect x="2" y="8" width="6" height="16" fill="#4a4e7a"/></svg>');
  }
}

// ---------- host speech, typed out ----------
let typing = null;
function typeOut(el, text) {
  if (typing) typing.finish();
  if (reducedMotion) {
    el.textContent = text;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
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
  dialog.append(h("span", { class: "speaker" }, "Jesse & Jessica"), say, ...body.flat().filter(Boolean));
  typeOut(say, sayText);
  const input = dialog.querySelector("input");
  if (input && !matchMedia("(pointer: coarse)").matches) input.focus();
}

function answer({ id, label, value, placeholder, maxlength = 120, autocomplete, onEnter, onInput }) {
  const input = h("input", {
    id, value, placeholder, maxlength, autocomplete: autocomplete || "off",
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
  state.step = step;
  scene.closePop();
  const lit = { 1: 1, 2: 2, 3: 3, unit: 3, 4: 4, done: 4 }[step] ?? 0;
  candles(lit);
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
    answer({ id: "f-envelope", label: "Name on the envelope", value: state.envelope, placeholder: "The Garcia Family", autocomplete: "family-name", onEnter: next }),
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
    h("p", { class: "hint" }, "Pets count. Everyone gets a little sprite at our party."),
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
      autocomplete: "street-address", onInput: search, onEnter: () => list.querySelector("button")?.click(),
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
    answer({ id: "f-unit", label: "Apartment or unit", value: state.unit, placeholder: "Apt 2B", maxlength: 40, autocomplete: "address-line2", onEnter: () => next(false) }),
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

// The door opens and the family walks in while the Sheet saves.
async function send() {
  const button = $("send");
  button.disabled = true;
  $("error").textContent = "";
  try {
    const members = state.members || (await state.membersPromise);
    const family = scene.families.get("pending");
    const sprites = scene.sprites.filter((s) => s.familyId === "pending");
    if (!family.entered) {
      family.entered = true;
      sound.door();
      const center = scene.enter(sprites);
      scene.focus(center.x, center.y - 12, 1);
    }
    const address = { ...state.address, unit: state.unit };
    const { id, token } = await api.submit({ envelope: state.envelope, household: state.household, members, address, turnstileToken: turnstileToken() });
    const saved = { id, token, name: state.envelope, members, bubbles: [] };
    state.mine.push(saved);
    saveMine();
    scene.families.delete("pending");
    scene.families.set(id, { id, name: saved.name, mine: true });
    sprites.forEach((s) => { s.familyId = id; s.mine = true; });
    scene.setTag(id, saved.name, { mine: true });
    resetTurnstile();
    go("done");
  } catch {
    resetTurnstile();
    button.disabled = false;
    showError("Something went wrong. Try again?");
  }
}

function stepDone() {
  frame("Thank you. You mean a lot to us.",
    h("p", { class: "hint" }, "Your family is at our party now. Tap anyone in your family to change their look or give them something to say."),
    btn("Add another address", restart, "link"));
}

function restart() {
  Object.assign(state, {
    envelope: "", household: "", householdAsked: "", members: null, membersPromise: null,
    addressQuery: "", address: null, unit: "", session: newSession(),
  });
  scene.focus(128, 120, 0);
  go(1);
}

// ---------- looks ----------
const imageCache = new Map();
const image = (src) => {
  if (!imageCache.has(src)) imageCache.set(src, loadImage(src));
  return imageCache.get(src);
};
const lookById = (id) => Object.values(state.looks).flat().find((l) => l.id === id);

function assignLooks(members) {
  const used = new Set();
  return members.map(({ type }) => {
    const options = state.looks[type]?.length ? state.looks[type] : state.looks.adult || [];
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
  scene.placeAtDoor(sprites);
  sound.pop();
}

// ---------- the party ----------
async function addFamily(f, { fromDoor, mine = false }) {
  scene.families.set(f.id, { id: f.id, name: f.name, mine });
  const sprites = await spritesFor(f.id, f.members, { mine });
  sprites.forEach((s) => { s.bubble = f.bubbles?.[s.index] || ""; });
  scene.enter(sprites, { fromDoor });
  if (mine) scene.setTag(f.id, f.name, { mine: true });
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
      if (!mine) scene.sprites.filter((s) => s.familyId === f.id).forEach((s) => { s.bubble = f.bubbles?.[s.index] || ""; });
      continue;
    }
    if (mine) continue;
    await addFamily(f, { fromDoor: !first });
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

function onTap(sprite) {
  sound.wake();
  if (sprite.host) {
    sound.select();
    scene.say(sprite, HOST_LINES[Math.floor(Math.random() * HOST_LINES.length)], 3);
    return;
  }
  const saved = mineById(sprite.familyId);
  if (!saved) {
    const fam = scene.families.get(sprite.familyId);
    if (fam && fam.id !== "pending") scene.setTag(fam.id, fam.name, { seconds: 3 });
    if (sprite.bubble) scene.say(sprite, sprite.bubble, 4);
    return;
  }
  openEditor(sprite, saved);
}

function openEditor(sprite, saved) {
  sound.select();
  const input = h("input", { id: "f-bubble", maxlength: 40, value: saved.bubbles[sprite.index] || "", placeholder: "Say something", "aria-label": "Say something" });
  const save = async () => {
    const text = input.value.trim().slice(0, 40);
    saved.bubbles[sprite.index] = text;
    sprite.bubble = text;
    saveMine();
    scene.closePop();
    scene.say(sprite, text, 6);
    api.sprite({ id: saved.id, token: saved.token, index: sprite.index, bubble: text }).catch(() => sound.oops());
  };
  const newLook = async () => {
    const options = state.looks[sprite.type] || [];
    if (options.length < 2) return;
    const at = options.findIndex((l) => l.id === sprite.look);
    const look = options[(at + 1) % options.length];
    sprite.img = await image(look.src);
    sprite.look = look.id;
    saved.members[sprite.index].look = look.id;
    saveMine();
    sound.pop();
    sprite.popAt = scene.time;
    api.sprite({ id: saved.id, token: saved.token, index: sprite.index, look: look.id }).catch(() => sound.oops());
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
  document.addEventListener("pointerdown", () => sound.wake(), { capture: true });
  document.addEventListener("keydown", () => sound.wake(), { capture: true });

  scene.onTap = onTap;
  api.config().then(({ turnstileSiteKey }) => renderTurnstile(turnstileSiteKey)).catch(() => {});
  const [looks] = await Promise.all([
    fetch("/assets/looks.json").then((r) => r.json()).catch(() => ({})),
    scene.load("/assets/room.png"),
  ]);
  state.looks = looks;

  for (const host of HOSTS) {
    const img = await image(`/assets/hosts/${host.id}.png`);
    scene.addSprite({ img, x: host.x, y: host.y, host: true, familyId: "hosts" });
  }

  for (const f of state.mine) await addFamily(f, { fromDoor: false, mine: true });
  await loadParty(true);
  setInterval(() => loadParty(false), POLL_MS);
  setInterval(cycleBubbles, 3500);

  if (state.mine.length) {
    const last = scene.sprites.filter((s) => s.familyId === state.mine.at(-1).id);
    if (last.length) scene.focus(last[0].x, last[0].y - 12, 1);
    go("done");
  } else {
    go(1);
  }
}

if (new URLSearchParams(location.search).has("test")) window.__hc = { scene, state };
start();
