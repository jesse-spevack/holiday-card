import { api } from "./api.js";
import { attachAddressSuggestions } from "./address.js";
import { myHouseholds, rememberHousehold, tokenFor } from "./households.js";
import { Scene } from "./scene.js";
import { playBlip, playDoorChime, setSoundEnabled, soundEnabled, unlockAudio } from "./sound.js";
import { drawFigure, lookCount, lookImage } from "./sprites.js";

const POLL_MS = 5000;

const ERRORS = {
  family_parse_failed: "We could not read your family list. Try again, or write it a little differently.",
  turnstile_failed: "We could not confirm that you are a person. Try again.",
  slow_down: "Too many tries. Wait a minute, then try again.",
  bad_zip: "Check the ZIP code.",
  bad_state: "Use the 2-letter state code, for example CO.",
  offline: "You seem to be offline. Check your connection and try again.",
  forbidden: "You can change only your own family.",
};
const FALLBACK_ERROR = "Something went wrong on our side. Try again in a minute.";

const $ = (id) => document.getElementById(id);

const scene = new Scene({
  canvas: $("scene"),
  frame: $("scene-frame"),
  overlay: $("scene-overlay"),
  isMine: (memberId) => tokenFor(memberId) !== null,
  onTapMine: (actor) => openEditor(actor),
});

let partyVersion;
let config = { turnstileSiteKey: "", bubbleMax: 40 };

start();

async function start() {
  setupSoundToggle();
  setupForm();
  setupEditor();
  showJoinedState();
  [config] = await Promise.all([api.config().catch(() => config), scene.start()]);
  renderTurnstile();
  await poll(false);
  setInterval(() => document.visibilityState === "visible" && poll(true), POLL_MS);
}

async function poll(arrive) {
  try {
    const party = await api.party(partyVersion);
    partyVersion = party.version;
    if (!party.unchanged) scene.setParty(party.families, { arrive });
  } catch {
    // The next poll tries again.
  }
  updateCaption();
}

function updateCaption() {
  const count = scene.familyCount();
  $("scene-caption").textContent =
    count === 0 ? "The living room is ready. Be the first family at the party." : `${count} ${count === 1 ? "family is" : "families are"} at the party.`;
}

// Sound

function setupSoundToggle() {
  const button = $("sound-toggle");
  const render = () => {
    button.setAttribute("aria-pressed", String(soundEnabled()));
    button.setAttribute("aria-label", soundEnabled() ? "Sound on" : "Sound off");
  };
  button.addEventListener("click", () => {
    setSoundEnabled(!soundEnabled());
    render();
    if (soundEnabled()) playBlip();
  });
  render();
}

// Join form

function showJoinedState() {
  const joined = myHouseholds().length > 0;
  $("joined").hidden = !joined;
  $("join-form").hidden = joined;
}

let turnstileWidget = null;

function renderTurnstile() {
  const render = () => {
    if (!config.turnstileSiteKey) return;
    turnstileWidget = window.turnstile.render("#turnstile", { sitekey: config.turnstileSiteKey, appearance: "interaction-only" });
  };
  if (window.turnstile) render();
  else window.addEventListener("load", () => window.turnstile && render(), { once: true });
}

function turnstileToken() {
  if (turnstileWidget === null || !window.turnstile) return "";
  return window.turnstile.getResponse(turnstileWidget) ?? "";
}

function setupForm() {
  const form = $("join-form");

  attachAddressSuggestions({
    street: $("street"),
    list: $("street-suggestions"),
    onPick: (address) => {
      $("street").value = address.street || $("street").value;
      if (address.unit) $("unit").value = address.unit;
      $("city").value = address.city;
      $("state").value = address.state;
      $("zip").value = address.zip;
      for (const id of ["street", "city", "state", "zip"]) $(id).removeAttribute("aria-invalid");
      if (!address.unit) $("unit").focus();
    },
  });

  $("state").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase()));
  form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));

  $("add-another").addEventListener("click", () => {
    $("joined").hidden = true;
    form.reset();
    form.hidden = false;
    $("name").focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockAudio();
    const fields = Object.fromEntries(new FormData(form));
    const problem = validate(fields);
    if (problem) return showError(problem);

    const button = $("submit");
    button.disabled = true;
    button.textContent = "Knocking on the door…";
    hideError();

    try {
      const joined = await api.join({ ...fields, turnstileToken: turnstileToken() });
      rememberHousehold(joined);
      form.reset();
      showJoinedState();
      $("scene-frame").scrollIntoView({ behavior: "smooth", block: "center" });
      scene.welcome({ id: joined.familyId, household: joined.household, members: joined.members }, () => {
        playDoorChime();
        updateCaption();
      });
    } catch (err) {
      showError(ERRORS[err.code] ?? FALLBACK_ERROR);
    } finally {
      if (turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
      button.disabled = false;
      button.textContent = "Join the party";
    }
  });
}

function validate(fields) {
  const required = { name: "your name", household: "the name on the envelope", street: "your street address", city: "your city", state: "your state", zip: "your ZIP code", familyText: "who is in your family" };
  const missing = Object.keys(required).filter((key) => !fields[key]?.trim());
  for (const key of Object.keys(required)) $(idFor(key)).toggleAttribute("aria-invalid", missing.includes(key));
  if (missing.length) {
    $(idFor(missing[0])).focus();
    return `Add ${required[missing[0]]}.`;
  }
  if (!/^[A-Za-z]{2}$/.test(fields.state.trim())) return markInvalid("state", ERRORS.bad_state);
  if (!/^\d{5}(-\d{4})?$/.test(fields.zip.trim())) return markInvalid("zip", ERRORS.bad_zip);
  return null;
}

function idFor(key) {
  return key === "familyText" ? "family-text" : key;
}

function markInvalid(key, message) {
  $(idFor(key)).setAttribute("aria-invalid", "true");
  $(idFor(key)).focus();
  return message;
}

function showError(message) {
  const el = $("form-error");
  el.textContent = message;
  el.hidden = false;
}

function hideError() {
  $("form-error").hidden = true;
}

// Sprite editor

let editing = null;

function setupEditor() {
  const dialog = $("editor");
  const bubble = $("bubble");

  const step = (delta) => {
    editing.look = (editing.look + delta + 1000) % 1000;
    drawPreview();
    playBlip();
  };
  $("look-prev").addEventListener("click", () => step(-1));
  $("look-next").addEventListener("click", () => step(1));
  bubble.addEventListener("input", () => ($("bubble-count").textContent = String(bubble.value.length)));
  $("editor-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());

  $("editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const save = $("editor-save");
    save.disabled = true;
    $("editor-error").hidden = true;
    const change = { look: editing.look, bubble: bubble.value.trim() };
    try {
      await api.changeMember(editing.id, { token: tokenFor(editing.id), ...change });
      scene.updateMember(editing.id, change);
      playBlip();
      dialog.close();
    } catch (err) {
      $("editor-error").textContent = ERRORS[err.code] ?? FALLBACK_ERROR;
      $("editor-error").hidden = false;
    } finally {
      save.disabled = false;
    }
  });
}

function openEditor(actor) {
  editing = { id: actor.id, kind: actor.kind, look: actor.look };
  const household = scene.households.get(actor.familyId) ?? "";
  $("editor-title").textContent = household ? `A guest from ${household}` : "Your guest";
  $("bubble").value = actor.bubble ?? "";
  $("bubble-count").textContent = String($("bubble").value.length);
  const several = lookCount(actor.kind) > 1;
  $("look-prev").hidden = !several;
  $("look-next").hidden = !several;
  $("editor-error").hidden = true;
  drawPreview();
  playBlip();
  $("editor").showModal();
}

function drawPreview() {
  const canvas = $("editor-preview");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFigure(ctx, lookImage(editing.kind, editing.look), canvas.width / 2, canvas.height - 3);
}
