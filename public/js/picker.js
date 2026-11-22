// The look picker: a panel of every look a member can wear, oldest first, with the silly looks at the end.

const PEOPLE = ["adult", "kid", "baby"];
const PETS = ["dog", "cat"];
const AGES = ["older", "adult", "teen", "kid", "baby"];
const AGE_TITLES = { older: "Grown-ups", adult: "Grown-ups", teen: "Teens", kid: "Kids", baby: "Babies" };
const PET_TITLES = { dog: "Dogs", cat: "Cats" };

const ageRank = (look, type) => AGES.indexOf(look.age || type);

// Sections in display order: [{ title, looks }]. People and pets never mix.
export function lookSections(library, type) {
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

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
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
    return el("button", {
      type: "button", class: "look-tile", "data-look": look.id, "aria-label": look.desc || look.id,
      "aria-current": now ? "true" : null,
      onClick: () => { close(); if (!now) onPick(look); },
    },
    el("img", { src: look.src.startsWith("/") ? look.src : `/${look.src}`, alt: "", draggable: "false", style: `--w:${look.w};--h:${look.h}` }),
    now ? el("span", { class: "look-now" }, "Now") : null);
  };

  const body = el("div", { class: "picker-body" },
    ...sections.map((s) => el("section", { class: "picker-section" },
      el("h3", {}, s.title),
      el("div", { class: "picker-grid" }, ...s.looks.map(tile)))));

  const closeBtn = el("button", { type: "button", class: "picker-close", "aria-label": "Close", onClick: close }, "✕");
  const panel = el("div", {
    class: "picker-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "picker-title",
    style: `--mw:${maxW};--mh:${maxH}`,
  },
  el("header", { class: "picker-head" }, el("h2", { id: "picker-title" }, "Pick a look"), closeBtn),
  body);
  const root = el("div", { class: `picker${PETS.includes(type) ? " pets" : ""}`, onClick: (e) => { if (e.target === root) close(); } }, panel);

  document.addEventListener("keydown", onKey, true);
  document.body.append(root);
  const mark = body.querySelector("[aria-current]");
  mark?.scrollIntoView({ block: "center" });
  (matchMedia("(pointer: coarse)").matches ? closeBtn : mark || closeBtn).focus({ preventScroll: true });
  return { close };
}
