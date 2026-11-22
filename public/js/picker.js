// The look picker: a panel of every look a member can wear, oldest first, with the silly looks at the end.

import { h } from "./dom.js";

const PEOPLE = ["adult", "kid", "baby"];
const PETS = ["dog", "cat"];
const AGES = ["older", "adult", "teen", "kid", "baby"];
const AGE_TITLES = { older: "Grown-ups", adult: "Grown-ups", teen: "Teens", kid: "Kids", baby: "Babies" };
const PET_TITLES = { dog: "Dogs", cat: "Cats" };

const ageRank = (look, type) => AGES.indexOf(look.age || type);

// Sections in display order: [{ title, looks }]. People and pets never mix.
function lookSections(library, type) {
  const pets = PETS.includes(type);
  const entries = (pets ? PETS : PEOPLE).flatMap((t) => (library[t] || []).map((look) => ({ look, type: t })));
  if (!pets) entries.sort((a, b) => ageRank(a.look, a.type) - ageRank(b.look, b.type));
  const sections = [];
  const add = (title, look) => {
    const last = sections.at(-1);
    if (last?.title === title) last.looks.push(look);
    else sections.push({ title, looks: [look] });
  };
  for (const e of entries) if (!e.look.silly) add(pets ? PET_TITLES[e.type] : AGE_TITLES[e.look.age || e.type], e.look);
  for (const e of entries) if (e.look.silly) add("Silly", e.look);
  return sections;
}

// Opens the picker. Calls onPick(look) when the guest taps a look; closing it changes nothing.
export function openPicker({ library, type, current, onPick, returnFocus }) {
  const sections = lookSections(library, type);
  const all = sections.flatMap((s) => s.looks);
  const maxW = Math.max(...all.map((l) => l.w || 16));
  const maxH = Math.max(...all.map((l) => l.h || 24));

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    returnFocus?.focus();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      const stops = [...panel.querySelectorAll("button")];
      const at = stops.indexOf(document.activeElement);
      const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
      e.preventDefault();
      stops[next].focus();
    }
  };

  const tile = (look) => {
    const now = look.id === current;
    return h("button", {
      type: "button", class: "look-tile", "data-look": look.id, "aria-label": look.desc || look.id,
      "aria-current": now ? "true" : null,
      onClick: () => { close(); if (!now) onPick(look); },
    },
    h("img", { src: look.src.startsWith("/") ? look.src : `/${look.src}`, alt: "", draggable: "false", style: `--w:${look.w};--h:${look.h}` }),
    now ? h("span", { class: "look-now" }, "Now") : null);
  };

  const body = h("div", { class: "picker-body" },
    ...sections.map((s) => h("section", { class: "picker-section" },
      h("h3", {}, s.title),
      h("div", { class: "picker-grid" }, ...s.looks.map(tile)))));

  const closeBtn = h("button", { type: "button", class: "picker-close", "aria-label": "Close", onClick: close }, "✕");
  const panel = h("div", {
    class: "picker-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "picker-title",
    style: `--mw:${maxW};--mh:${maxH}`,
  },
  h("header", { class: "picker-head" }, h("h2", { id: "picker-title" }, "Pick a look"), closeBtn),
  body);
  const root = h("div", { class: `picker${PETS.includes(type) ? " pets" : ""}`, onClick: (e) => { if (e.target === root) close(); } }, panel);

  document.addEventListener("keydown", onKey, true);
  document.body.append(root);
  const mark = body.querySelector("[aria-current]");
  mark?.scrollIntoView({ block: "center" });
  (matchMedia("(pointer: coarse)").matches ? closeBtn : mark || closeBtn).focus({ preventScroll: true });
  return { close };
}
