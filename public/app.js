import { Scene, loadImage } from "./js/scene.js";
import { HOSTS, hostLine } from "./js/hosts.js";
import { ROOM_W, ROOM_H } from "./js/room.js";
import { h } from "./js/dom.js";
import { Sound } from "./js/sound.js";
import { api } from "./js/api.js";
import { openPicker } from "./js/picker.js";
import { setupExtras } from "./js/registry.js";
import { createFound } from "./js/found.js";
import { Night } from "./js/night.js";
import { Glint } from "./js/glint.js";
import { Idle } from "./js/idle.js";
import { Counter, DONE_LINE } from "./js/counter.js";
import { US_LINES, usAddressProblem } from "./js/us.js";
import { Marker } from "./js/marker.js";
import { DEMO, demoFamily } from "./js/demo.js";
import { report, reportFamily, reportUncaught } from "./js/report.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sound = new Sound();
// The page makes its random choices in this order (the snow, the extras in their list order, the night). Keep it.
const scene = new Scene({
  stage: $("stage"), world: $("world"), canvas: $("canvas"), overlay: $("overlay"), reducedMotion,
  onTap: (sprite) => onTap(sprite),
  onHover: (sprite) => onHover(sprite),
  onHotspot: (id) => extras.tap(id),
  onLayout: (view) => night.layout(view),
});
const app = $("app");
const dialog = $("dialog");
// The hidden extras (public/js/extras/). found records each interaction for the family this browser signed up last.
const found = createFound({ family: () => state.mine.at(-1) });
const extras = setupExtras({ scene, sound, reducedMotion, found: found.mark, mine: () => state.mine });
const night = new Night({ stage: $("stage"), reducedMotion, clock: scene });
// The help to find the hidden extras. The glint on an extra that the guest has not found, and the counter in the corner
// of the room, start as soon as the room shows (start), for every visitor, also while the form shows. A found extra stays
// in this browser (found.js), so they need no family. The hosts' own lines wait until the thank-you tucks away (tuck),
// so no host bubble talks over the form.
const unfound = () => extras.fitting().filter((e) => !found.has(e.name));
const hidden = (egg) => !found.has(egg) && extras.fits(egg);
const glint = new Glint({ scene, reducedMotion, targets: unfound });
// The guest is busy while a window covers the room (the album, the dreidel game, the look picker).
// "My family" shows in the dialog, and an open dialog stops the hosts' own lines (tuck).
const busy = () => extras.covered() || !!document.querySelector('[aria-modal="true"]:not([hidden])');
const idle = new Idle({ scene, shows: hidden, left: () => unfound().length, busy });
// The gold arrow over the person that "My family" picks.
const marker = new Marker({ scene, reducedMotion });
scene.addLayer(glint);
scene.addLayer(idle);
scene.addLayer(marker);
const counter = new Counter({
  scene, fitting: () => extras.fitting(), has: found.has, busy,
  onAsk: () => {
    sound.select();
    idle.hint();
  },
  onDone: (spots) => {
    glint.burst(spots);
    sound.fanfare();
    const jess = scene.sprites.find((s) => s.id === "jessica");
    if (jess) scene.say(jess, DONE_LINE, 4);
  },
});
const myFamily = $("my-family");
const TUCK_MS = 7000;
// The thank-you after a changed address is short, so the guest gets back to the party soon.
const SAVED_MS = 4000;
const SAVED = "hc.families";
const POLL_MS = 30000;

// "?new" shows the site as a first-time guest sees it. It forgets this browser's families
// (the sound setting stays), then takes "new" out of the address, so a reload works as usual.
if (!DEMO && new URLSearchParams(location.search).has("new")) {
  try { localStorage.removeItem(SAVED); } catch {}
  const rest = location.search.slice(1).split("&").filter((p) => p && decodeURIComponent(p.split("=")[0]) !== "new");
  history.replaceState(history.state, "", location.pathname + (rest.length ? `?${rest.join("&")}` : "") + location.hash);
}

// A custom link for a friend (pnpm invite): "/#invite=<token>". The token stays after "#", so no server log sees it.
// The page drops it from the address bar once the friend joins, or when the link does not work.
const INVITE = /^#invite=([\w-]{22,100})$/.exec(location.hash)?.[1] || "";
const dropInviteHash = () => history.replaceState(history.state, "", location.pathname + location.search);

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
  // "new" for a sign-up. "change" while a guest changes the address of a family in this browser (changing).
  // "invite" while a friend confirms the address on an invite link (invite holds its token).
  mode: INVITE ? "invite" : "new",
  changing: null,
  onFile: null,
  invite: INVITE,
  // The friend said "Yes, that's us" to the address on the invite, so the address steps are done.
  inviteOk: false,
  // The invite link did not work. The first question says so, kindly.
  inviteBad: false,
};

// ---------- saved families (this browser's own) ----------
// Demo mode (demo.js) holds its made-up family in memory, never in the saved families, so a reload starts fresh.
function loadMine() {
  if (DEMO) return [demoFamily()];
  try { return JSON.parse(localStorage.getItem(SAVED)) || []; } catch { return []; }
}
function saveMine() {
  if (DEMO) return;
  try { localStorage.setItem(SAVED, JSON.stringify(state.mine)); } catch {}
}
const mineById = (id) => state.mine.find((f) => f.id === id);

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

const HOST_NAMES = "Jesse, Jess, Eddie & Audrey Spevack";
const frame = (sayText, ...body) => frameAs(HOST_NAMES, sayText, ...body);

// The dialog: the speaker, the line that the speaker types out, and the body. The same line again shows at once,
// so a new pick in "My family" does not type its question again.
let saidLast = "";
function frameAs(speaker, sayText, ...body) {
  dialog.classList.toggle("small", state.step === "done" || state.step === "saved");
  dialog.innerHTML = "";
  const say = h("p", { class: "say", id: "say" });
  dialog.append(h("span", { class: "speaker" }, speaker), say, ...body.flat().filter(Boolean));
  if (sayText === saidLast && !typing) say.textContent = sayText;
  else typeOut(say, sayText);
  saidLast = sayText;
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
// A failed call that the guest sees: the host line for its code, and a report to the error log.
function fail(step, err) {
  report(step, err);
  showError(failLine(err));
}
// The host line for each error code of a failed call. A code that is not here gets the retry line with its code,
// so a guest's screenshot tells us what failed.
const FAIL_LINES = {
  ...US_LINES,
  slow_down: "That's a lot of tries! Wait a minute and try again?",
  sheet_failed: "We can't reach our address book right now. Try again in a minute?",
  household_failed: "We couldn't read who lives at your house. Tap the button again?",
  places_failed: "We can't look up addresses right now. Try again in a minute?",
  network: "We can't reach our server. Check your connection and try again?",
};
const failLine = (err) => FAIL_LINES[err?.message] || `Something went wrong. Try again? (${String(err?.message || "error").slice(0, 40)})`;

// ---------- steps ----------
function go(step) {
  clearTimeout(searchTimer);
  clearTimeout(tuckTimer);
  tuckTimer = null;
  state.step = step;
  if (step !== "family") marker.show(null);
  ({
    1: stepEnvelope, 2: stepHousehold, 3: stepAddress, unit: stepUnit, 4: stepConfirm, done: stepDone,
    onfile: stepOnFile, saved: stepSaved, opening: stepOpening, invite: stepInvite, family: stepFamily,
  }[step])();
}
const changing = () => state.mode === "change";
// The steps of the form: the sign-up, an invite, and the address steps. A tap on your own sprite waits until they end.
const inForm = () => [1, 2, 3, "unit", 4, "opening", "invite", "onfile", "saved"].includes(state.step) && !app.classList.contains("tucked");
const inviting = () => state.mode === "invite";

function stepEnvelope() {
  const next = () => {
    const v = $("f-envelope").value.trim();
    if (!v) return showError("We need something here.");
    state.envelope = v;
    state.inviteBad = false;
    sound.candle();
    go(changing() ? 3 : 2);
  };
  const ask = state.inviteBad
    ? "We couldn't open that invitation, but we'd still love to send you a card! Whose name goes on the envelope?"
    : changing() || inviting() ? "Whose name goes on the envelope?" : "We're sending holiday cards! Whose name goes on the envelope?";
  frame(ask,
    answer({ id: "f-envelope", label: "Name on the envelope", value: state.envelope, placeholder: "The Garcia Family", onEnter: next }),
    h("p", { class: "hint" }, "Write it how you'd like it on the envelope."),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" },
      changing() && btn("Back", () => go("onfile"), "btn ghost"),
      inviting() && btn("Back", () => go("invite"), "btn ghost"),
      h("span", { class: "end" }, btn("Next ▸", next))));
}

// A friend who said "Yes, that's us" to the invite has no address steps left, so this step sends the sign-up.
function stepHousehold() {
  const last = inviting() && state.inviteOk;
  const next = () => {
    const v = $("f-household").value.trim();
    if (!v) return showError("We need something here.");
    state.household = v;
    readHousehold();
    if (last) return send();
    sound.candle();
    go(3);
  };
  frame("Who lives at your house?",
    answer({ id: "f-household", label: "Who lives at your house", value: state.household, placeholder: "Sofia, Dan, Mia, and Biscuit the corgi", maxlength: 300, onEnter: next }),
    h("p", { class: "hint" }, "Pets count. I guess."),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Back", () => go(last ? "invite" : 1), "btn ghost"),
      h("span", { class: "end" }, last ? btn("Join the party ▸", next, "btn", { id: "send" }) : btn("Next ▸", next))));
}

// The LLM reads the household while the guest types the address.
// It returns the promise of the members. A failed read is not kept, so the next call asks again.
function readHousehold() {
  if (state.householdAsked === state.household && state.membersPromise) return state.membersPromise;
  state.householdAsked = state.household;
  state.members = null;
  scene.removeFamily("pending");
  const asked = state.household;
  const read = api.household(asked).then(async ({ members }) => {
    if (asked !== state.household) return readHousehold();
    state.members = assignLooks(members);
    await showPending(state.members);
    return state.members;
  });
  state.membersPromise = read;
  read.catch((err) => {
    report("household", err);
    if (state.membersPromise === read) state.membersPromise = null;
  });
  return read;
}

// The bot trap in index.html. A person leaves it empty, so the page sends it only when something filled it.
function honeypot() {
  const value = $("hc-extra")?.value.trim();
  return value ? { extra: value.slice(0, 100) } : {};
}

// The address is the point, so a household read that fails at the send never blocks the sign-up.
// The page guesses instead: one adult for each name in the text, split on commas, "and", "&", and "+".
const GUESS_MAX = 12;
async function guessHousehold() {
  const names = state.household.split(/,|&|\+|\band\b/i).map((n) => n.trim()).filter(Boolean);
  const count = Math.min(Math.max(names.length, 1), GUESS_MAX);
  state.members = assignLooks(Array.from({ length: count }, () => ({ type: "adult" })));
  await showPending(state.members);
  return state.members;
}

let searchTimer = null;
let searchSeq = 0;
function stepAddress() {
  const list = h("ul", { class: "choices", id: "choices" });
  const credit = h("p", { class: "credit", id: "credit", hidden: true }, "powered by Google");
  const manual = h("div", { id: "manual", hidden: true }, btn("Use what I typed", () => {
    // A search that still runs must not write over the line that this tap shows.
    clearTimeout(searchTimer);
    searchSeq++;
    const v = $("f-address").value.trim();
    if (!v) return showError("We need something here.");
    const problem = usAddressProblem({ street: v });
    if (problem) return showError(US_LINES[problem]);
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
      } catch (err) {
        report("places", err);
        suggestions = [];
      }
      // The guest can leave the step while Google answers, so a late answer has no list to fill.
      if (seq !== searchSeq || !list.isConnected) return;
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
      state.session = newSession();
      const problem = usAddressProblem(address);
      if (problem) return showError(US_LINES[problem]);
      state.address = address;
      go("unit");
    } catch (err) {
      fail("place", err);
    }
  };
  frame("Where should we mail your card?",
    answer({
      id: "f-address", label: "Street address", value: state.addressQuery, placeholder: "Start typing your street",
      onInput: search, onEnter: () => list.querySelector("button")?.click(),
    }),
    list, manual, errorLine(), h("div", { class: "spacer" }), credit,
    h("div", { class: "actions" }, btn("Back", () => go(changing() ? 1 : 2), "btn ghost"),
      // A guest who changes only the envelope name keeps the address that they have.
      (changing() || inviting()) && state.address && h("span", { class: "end" }, btn("Same address ▸", () => { sound.select(); go("unit"); }, "btn ghost"))));
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

// The envelope as the card printer sees it: the name, the street and unit, and the city, state, and ZIP.
// A typed address has the whole address in its street.
function addressLines(envelope = state.envelope, a = state.address, unit = state.unit) {
  const street = unit ? `${a.street}, ${unit}` : a.street;
  const place = a.manual ? "" : `${a.city}, ${a.state} ${a.zip}`.trim();
  return [envelope, street, place].filter(Boolean).join("\n");
}

function stepConfirm() {
  frame("We'll mail your card to:",
    h("p", { class: "address" }, addressLines()),
    h("p", { class: "say", style: "font-size:19px" }, "Look right?"),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Fix it", () => go(3), "btn ghost"),
      h("span", { class: "end" }, changing() ? btn("Yes, save it ▸", saveAddress, "btn", { id: "send" }) : btn("Yes, send it ▸", send, "btn", { id: "send" }))));
}

// The family walks into the room while the Sheet saves.
async function send() {
  const button = $("send");
  button.disabled = true;
  $("error").textContent = "";
  try {
    const members = state.members || (await readHousehold().catch(guessHousehold));
    // The guest can tap "Fix it" while the page waits for the household. The send then stops, so an old address does not go.
    if (!button.isConnected) return;
    const family = scene.families.get("pending");
    if (!family.entered) {
      family.entered = true;
      sound.arrive();
      const center = scene.enter(scene.familySprites("pending"));
      scene.focus(center.x, center.y - 12, 1);
    }
    const address = { ...state.address, unit: state.unit };
    const invite = state.invite ? { invite: state.invite } : {};
    const { id, token } = await api.submit({ envelope: state.envelope, household: state.household, members, address, ...invite, ...honeypot() });
    const saved = { id, token, name: state.envelope, members, bubbles: [] };
    state.mine.push(saved);
    saveMine();
    // The extras that the guest found on the form go to the record now, for the new family.
    found.signedUp();
    if (state.invite) {
      dropInviteHash();
      Object.assign(state, { invite: "", mode: "new" });
    }
    scene.renameFamily("pending", { id, name: saved.name, mine: true });
    go("done");
  } catch (err) {
    // The friend confirmed in another browser a moment ago. The link now opens the party as that family.
    if (err?.message === "invite_used") return location.reload();
    button.disabled = false;
    if (err?.message === "bad_invite") {
      // The invite is gone. The guest can still sign up: the next tap sends the form with no invite.
      dropInviteHash();
      state.invite = "";
      report("submit", err);
      return showError("That invitation does not work anymore, but you can still sign up. Tap the button again.");
    }
    fail("submit", err);
  }
}

// The thank-you stays for a few seconds. Then the dialog slides away, and the camera
// moves back out so the guest sees the whole party.
let tuckTimer = null;
function stepDone() {
  frame("Thank you. You mean a lot to us.",
    h("p", { class: "hint" }, "Your family is at our party now. Tap them to change a look or say something."),
    h("p", { class: "hint surprise" }, "Tap around the room. We hid some surprises."));
  tuckTimer = setTimeout(tuckAway, TUCK_MS);
}

function tuckAway() {
  clearTimeout(tuckTimer);
  tuckTimer = null;
  tuck(true);
  scene.focus(ROOM_W / 2, ROOM_H / 2, 0);
}

// A tucked dialog gives its space to the room. The top bar then shows "My family".
function tuck(away) {
  if (app.classList.contains("tucked") === away) return;
  const hadFocus = dialog.contains(document.activeElement);
  myFamily.hidden = !away || !state.mine.length;
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
  // The hosts speak on their own only to a guest with a family in this browser, after the thank-you.
  idle[away && state.mine.length > 0 ? "start" : "stop"]();
  if (away && hadFocus && !myFamily.hidden) myFamily.focus();
}

function clearForm() {
  Object.assign(state, {
    envelope: "", household: "", householdAsked: "", members: null, membersPromise: null,
    addressQuery: "", address: null, unit: "", session: newSession(), mode: "new", changing: null, onFile: null,
    invite: "", inviteOk: false, inviteBad: false,
  });
}

// ---------- an invite link ----------
// Jesse made the link with the friend's address (pnpm invite). A new link asks the friend to confirm the address.
// A used link opens the party as the family in any browser: the link token is the family's token.
// A link that does not work gives the normal form with a kind line.
async function openInviteLink() {
  let view = null;
  try {
    view = await api.invite(state.invite);
  } catch {}
  if (view?.invite) {
    const { envelope, household, address } = view.invite;
    Object.assign(state, { envelope, household: household || "", address: onFileAddress(address), unit: address.unit });
    return go("invite");
  }
  const token = state.invite;
  dropInviteHash();
  Object.assign(state, { invite: "", mode: "new" });
  if (view?.family) {
    const f = view.family;
    state.mine = [...state.mine.filter((m) => m.id !== f.id), { id: f.id, token, name: f.name, members: f.members, bubbles: f.bubbles }];
    saveMine();
    return;
  }
  state.inviteBad = true;
  if (!state.mine.length) go(1);
}

function stepOpening() {
  frame("Let me find your invitation...");
}

function stepInvite() {
  frame("Is this where we should send your card?",
    h("p", { class: "address" }, addressLines()),
    errorLine(),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" },
      btn("Fix it", () => { state.inviteOk = false; sound.select(); go(1); }, "btn ghost"),
      h("span", { class: "end" }, btn("Yes, that's us ▸", () => { state.inviteOk = true; sound.candle(); go(2); }))));
}

// ---------- my family ----------
// "My family" in the top bar, and a tap on one of your own sprites, open one panel in the dialog. It shows a card
// for each person. A pick marks the person in the room with a gold arrow, and edits their line and look.
// "Change address" runs the address steps below for this family. A browser with two or more families (from before
// one browser held one family) shows the family it signed up last, with a link to switch.
const panel = { saved: null, index: null, thanks: false };
const TYPE_NAMES = { adult: "Grown-up", kid: "Kid", baby: "Baby", dog: "Dog", cat: "Cat" };
const LINE_MAX = 40;

function openFamily(saved = state.mine.at(-1), index = null, { quiet = false } = {}) {
  if (!saved) return;
  if (!quiet) sound.select();
  clearForm();
  Object.assign(panel, { saved, index, thanks: false });
  go("family");
  tuck(false);
}

function closeFamily() {
  sound.candle();
  Object.assign(panel, { saved: null, index: null, thanks: false });
  tuckAway();
}

// "Grown-up 2" and the line, so a screen reader tells the cards apart. The guests gave no names.
function cardLabel(saved, index) {
  const type = saved.members[index].type;
  const same = saved.members.filter((m) => m.type === type);
  const nth = same.length > 1 ? ` ${saved.members.slice(0, index + 1).filter((m) => m.type === type).length}` : "";
  return `${TYPE_NAMES[type] || "Guest"}${nth}`;
}

function familyCards(saved) {
  const sprites = scene.familySprites(saved.id);
  return h("div", { class: "fam-grid", role: "group", "aria-label": saved.name },
    saved.members.map((m, index) => {
      const sprite = sprites.find((s) => s.index === index);
      const look = lookById(sprite?.look || m.look);
      const line = saved.bubbles[index] || "";
      const on = panel.index === index;
      return h("button", {
        type: "button", class: `fam-card${m.type === "dog" || m.type === "cat" ? " pet" : ""}`, "aria-pressed": String(on), "data-index": index,
        "aria-label": `${cardLabel(saved, index)}: ${line || "No line yet"}`,
        onClick: () => pickCard(on ? null : index),
      },
        h("span", { class: "fam-figure" },
          look && h("img", { src: `/${look.src.replace(/^\//, "")}`, alt: "", style: `--w: ${look.w}; --h: ${look.h}` })),
        h("span", { class: `fam-line${line ? "" : " empty"}` }, line || "No line yet"));
    }));
}

function pickCard(index) {
  sound.select();
  panel.index = index;
  panel.thanks = false;
  go("family");
}

// State 1 lists the family. State 2 (panel.index) edits one person.
function stepFamily() {
  const saved = panel.saved;
  const sprite = panel.index === null ? null : scene.familySprites(saved.id).find((s) => s.index === panel.index);
  marker.show(sprite || null);
  const others = state.mine.filter((f) => f !== saved);
  const next = others.at(-1);
  const switchTo = next && btn(`Switch to ${next.name}`, () => openFamily(next), "link fam-switch");
  if (panel.index === null || !sprite) {
    frameAs(saved.name, panel.thanks ? "Thank you! Who else do you want to change?" : "Who do you want to change?",
      familyCards(saved), switchTo,
      h("div", { class: "spacer" }),
      h("div", { class: "actions" }, btn("Change address", () => openAddress(saved), "btn ghost"),
        h("span", { class: "end" }, btn("Done", closeFamily))));
    return;
  }
  const save = () => saveLine(saved, sprite, $("f-line").value);
  frameAs(saved.name, "What should they say?",
    familyCards(saved),
    answer({ id: "f-line", label: "What should they say", value: saved.bubbles[sprite.index] || "", placeholder: "Say something", maxlength: LINE_MAX, onEnter: save }),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("New look", (e) => newLook(saved, sprite, e.currentTarget), "btn ghost", { id: "f-new-look" }),
      h("span", { class: "end" }, btn("Save", save))));
  // Two rows of cards can make the dialog scroll on a short phone. The line to edit then scrolls into view.
  $("f-line").scrollIntoView({ block: "nearest" });
}

// The person says the new line in the room, and the panel goes back to the whole family with a thank-you.
function saveLine(saved, sprite, value) {
  const text = value.trim().slice(0, LINE_MAX);
  saved.bubbles[sprite.index] = text;
  sprite.bubble = text;
  saveMine();
  scene.say(sprite, text, 6);
  lineShown(sprite);
  api.sprite({ id: saved.id, token: saved.token, index: sprite.index, bubble: text }).catch((err) => { report("sprite", err); sound.oops(); });
  sound.candle();
  Object.assign(panel, { index: null, thanks: true });
  go("family");
}

function newLook(saved, sprite, returnFocus) {
  sound.select();
  const wear = async (look) => {
    sprite.img = await image(look.src);
    sprite.look = look.id;
    extras.look(sprite, look);
    saved.members[sprite.index].look = look.id;
    saveMine();
    sound.pop();
    sprite.popAt = scene.time;
    scene.updateOverlay();
    api.sprite({ id: saved.id, token: saved.token, index: sprite.index, look: look.id }).catch((err) => { report("sprite", err); sound.oops(); });
    // The card shows the new look. The line that the guest typed stays, and the focus goes back to "New look".
    if (state.step === "family" && panel.saved === saved && panel.index === sprite.index) {
      const value = $("f-line")?.value;
      go("family");
      if (value !== undefined) $("f-line").value = value;
      $("f-new-look")?.focus();
    }
  };
  openPicker({ library: state.looks, type: sprite.type, current: sprite.look, onPick: wear, returnFocus });
}

// Escape in "My family" goes back one state: from a person to the family, and from the family to the party.
// A window over the page (the look picker, the album, the dreidel game) takes its own Escape.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || state.step !== "family" || app.classList.contains("tucked")) return;
  if (document.querySelector('[aria-modal="true"]:not([hidden])')) return;
  e.preventDefault();
  if (panel.index !== null) pickCard(null);
  else closeFamily();
});

// ---------- change my address ----------
// "Change address" in "My family" shows the address on file and lets the guest change it. The address stays in the Sheet.
// The steps 1, 3, unit, and 4 of the sign-up serve here too, with no household step and no new family.
function openAddress(saved) {
  sound.select();
  clearForm();
  Object.assign(state, { mode: "change", changing: saved });
  go("onfile");
}

// The address steps end back in "My family".
function closeChange() {
  readSeq++;
  const saved = state.changing;
  clearForm();
  if (saved) openFamily(saved, null, { quiet: true });
  else tuckAway();
}

let readSeq = 0;
async function stepOnFile() {
  const family = state.changing || (state.changing = state.mine.at(-1));
  const close = btn("Back", closeChange, "btn ghost");
  if (!state.onFile) {
    const seq = ++readSeq;
    const left = () => seq !== readSeq || state.step !== "onfile";
    frame("Let me find your address...", errorLine(), h("div", { class: "spacer" }), h("div", { class: "actions" }, close));
    let found;
    try {
      found = await api.addressRead({ id: family.id, token: family.token });
    } catch (err) {
      report("address_read", err);
      if (left()) return;
      frame("We can't reach our address book right now.",
        h("p", { class: "hint" }, "Your card is safe. Try again in a minute?"),
        h("div", { class: "spacer" }),
        h("div", { class: "actions" }, close, h("span", { class: "end" }, btn("Try again", () => go("onfile")))));
      return sound.oops();
    }
    if (left()) return;
    state.onFile = found;
  }
  const { envelope, address } = state.onFile;
  const change = () => {
    sound.select();
    state.envelope = envelope || family.name;
    if (address) {
      state.address = onFileAddress(address);
      state.unit = address.unit;
    }
    go(1);
  };
  if (!address) {
    frame("Hmm, we can't find your address. Can you tell us again?", h("div", { class: "spacer" }),
      h("div", { class: "actions" }, close, h("span", { class: "end" }, btn("Next ▸", change))));
    return;
  }
  frame("We'll mail your card to:",
    h("p", { class: "address" }, addressLines(envelope, onFileAddress(address), address.unit)),
    h("p", { class: "say", style: "font-size:19px" }, "Still right?"),
    h("div", { class: "spacer" }),
    h("div", { class: "actions" }, btn("Change it", change, "btn ghost"),
      h("span", { class: "end" }, btn("Yes, all good ▸", () => { sound.candle(); closeChange(); }))));
}

// An address from the Sheet. With no city, state, or ZIP, the guest typed it by hand.
const onFileAddress = (a) => ({ ...a, formatted: a.street, manual: !a.city && !a.state && !a.zip });

async function saveAddress() {
  const button = $("send");
  button.disabled = true;
  $("error").textContent = "";
  const family = state.changing;
  try {
    const address = { ...state.address, unit: state.unit };
    const { name } = await api.addressChange({ id: family.id, token: family.token, envelope: state.envelope, address });
    family.name = name;
    saveMine();
    const fam = scene.families.get(family.id);
    if (fam) fam.name = name;
    sound.candle();
    go("saved");
  } catch (err) {
    button.disabled = false;
    fail("address_change", err);
  }
}

function stepSaved() {
  frame("Got it. Thank you for telling us!",
    h("p", { class: "hint" }, "We'll mail your card to your new address."));
  tuckTimer = setTimeout(closeChange, SAVED_MS);
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

// The guests' own lines. After the thank-you tucks away, each line shows once in this visit, one line at a time.
// A line that is new or changed (from the party poll, another tab, or the editor) shows once more.
// A tap on a guest shows the line again at any time. The record of shown lines stays in memory, so a reload shows each line once.
const shownLines = new Map();
const lineKey = (s) => `${s.familyId}:${s.index}`;
let lineTalker = null;
function lineShown(s) {
  shownLines.set(lineKey(s), s.bubble);
}

// One turn: the next guest whose line has not shown says it, unless a guest's line shows now.
// A line waits for a later turn while its bubble would cover another bubble, such as a host's line.
function cycleBubbles() {
  if (!app.classList.contains("tucked") || lineTalker?.bubbleEl) return;
  lineTalker = null;
  for (const s of scene.sprites) {
    if (s.host || !s.bubble || s.bubbleEl || shownLines.get(lineKey(s)) === s.bubble) continue;
    if (scene.sayClear(s, s.bubble, 4)) {
      lineShown(s);
      lineTalker = s;
      return;
    }
  }
}

// Another tab of this browser changed a line of this browser's own family. The new line shows once.
addEventListener("storage", (e) => {
  if (e.key !== SAVED || DEMO) return;
  let fresh = [];
  try { fresh = JSON.parse(e.newValue) || []; } catch {}
  for (const f of fresh) {
    const saved = mineById(f.id);
    if (!saved) continue;
    saved.bubbles = f.bubbles || [];
    scene.familySprites(f.id).forEach((s) => { s.bubble = saved.bubbles[s.index] || ""; });
  }
});

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
    scene.say(sprite, hostLine(sprite, hidden), 4);
    return;
  }
  // An extra can react to a tap on a guest (a pet does). In your own family, "My family" opens on that person
  // at the same time, unless the guest is in the middle of the form. The pet's own sound plays in place of the chime.
  const pet = extras.tapSprite(sprite);
  const saved = mineById(sprite.familyId);
  if (saved && !inForm()) return openFamily(saved, sprite.index, { quiet: !!pet });
  const fam = scene.families.get(sprite.familyId);
  if (fam && fam.id !== "pending") scene.setTag(fam.id, fam.name, { seconds: 3 });
  if (sprite.bubble) {
    scene.say(sprite, sprite.bubble, 4);
    lineShown(sprite);
  }
}

// ---------- demo mode ----------
// "/#demo" (demo.js) plays the moment after a sign-up with a made-up family: it waits at the door, walks in with the
// door sound, and the hosts thank it. Then the party goes on as for any guest. A "Demo" label shows in the top bar.
async function demoArrives() {
  const f = state.mine[0];
  scene.families.set(f.id, { id: f.id, name: f.name, mine: true });
  const sprites = await spritesFor(f.id, f.members, { mine: true });
  sprites.forEach((s) => { s.bubble = f.bubbles[s.index] || ""; });
  scene.placeAtEntrance(sprites);
  sound.arrive();
  const center = scene.enter(sprites);
  scene.focus(center.x, center.y - 12, 1);
  go("done");
}

// ---------- start ----------
async function start() {
  reportUncaught();
  reportFamily(() => state.mine.at(-1)?.id);
  const soundBtn = $("sound");
  const syncSound = () => {
    soundBtn.setAttribute("aria-pressed", String(sound.on));
    soundBtn.setAttribute("aria-label", sound.on ? "Sound on" : "Sound off");
  };
  syncSound();
  soundBtn.addEventListener("click", () => { sound.toggle(); syncSound(); });
  myFamily.addEventListener("click", () => openFamily());
  $("demo-tag").hidden = !DEMO;
  document.addEventListener("pointerdown", () => sound.wake(), { capture: true });
  document.addEventListener("keydown", () => sound.wake(), { capture: true });

  // A new guest gets the first question at once. So the dialog has its real height before the room shows,
  // and the room does not jump when the question appears.
  const invited = state.invite ? openInviteLink() : null;
  if (invited) go("opening");
  else if (!state.mine.length) go(1);
  const [looks] = await Promise.all([
    fetch("/assets/looks.json").then((r) => r.json()).catch(() => ({})),
    scene.load("/assets/room.png"),
  ]);
  state.looks = looks;
  // The room shows now. The glint and the counter help every visitor find the hidden extras.
  glint.start();
  counter.show(true);

  for (const host of HOSTS) {
    const img = await image(`/assets/hosts/${host.id}.png`);
    scene.addHost(host, img);
  }

  // A used invite link adds its family to this browser before the party shows.
  await invited;
  if (DEMO) await demoArrives();
  else for (const f of state.mine) await addFamily(f, { walkIn: false, mine: true });
  await loadParty(true);
  // A hidden tab does not ask for the party. The next check after the guest comes back does.
  setInterval(() => { if (!document.hidden) loadParty(false); }, POLL_MS);
  setInterval(cycleBubbles, 3500);

  // A friend on a new invite link confirms first, also in a browser with a family.
  if (state.mine.length && !inviting() && !DEMO) {
    const last = scene.familySprites(state.mine.at(-1).id);
    if (last.length) scene.focus(last[0].x, last[0].y - 12, 1);
    go("done");
  }
}

// "?test" loads the test API for the end-to-end tests (public/js/test-api.js). A guest never loads it.
if (new URLSearchParams(location.search).has("test")) {
  // tuckNow tucks the thank-you at once, as the timer does after TUCK_MS. It is true when the dialog is tucked.
  const tuckNow = () => {
    if (tuckTimer) tuckAway();
    return app.classList.contains("tucked");
  };
  // lineTurn runs one turn of the guests' lines now, as the 3.5-second timer does. pollParty asks for the party now.
  const lines = { lineTurn: cycleBubbles, pollParty: () => loadParty(false) };
  import("./js/test-api.js").then(({ testApi }) => { window.__hc = testApi({ scene, sound, extras, found, tuckNow, glint, idle, counter, lines, marker }); });
}
start();
