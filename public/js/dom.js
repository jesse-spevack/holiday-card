// Small DOM helpers that the page modules share.

// Makes an element. attrs is an object, or a string for the class name.
// In attrs, "onClick" adds a click listener, "class" sets the class, "style" sets the inline style,
// true sets an empty attribute, and null or false leaves the attribute out. Null and false children are left out too.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  const all = typeof attrs === "string" ? { class: attrs || null } : attrs || {};
  for (const [k, v] of Object.entries(all)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Loads a stylesheet one time. The promise resolves when it loads, or when it fails, so a missing file never blocks.
const sheets = new Map();
export function loadCss(href) {
  if (!sheets.has(href)) {
    sheets.set(href, new Promise((resolve) => {
      const link = h("link", { rel: "stylesheet", href });
      link.onload = link.onerror = () => resolve();
      document.head.append(link);
    }));
  }
  return sheets.get(href);
}

// The root of a full-screen dialog, hidden until it opens.
export function dialogRoot(cls, label, ...children) {
  const el = h("div", { class: cls, role: "dialog", "aria-modal": "true", "aria-label": label, tabindex: "-1" }, ...children);
  el.hidden = true;
  return el;
}

// The page behind a dialog. While the dialog shows, the page is inert, and key presses and window resizes go to
// the dialog. When the dialog hides, focus goes back to the element that remember() saw.
export class PageBehind {
  constructor({ onKey, onResize }) {
    this.onKey = onKey;
    this.onResize = onResize;
    this.returnFocus = null;
  }

  // Call this as the dialog starts to open, before any wait.
  remember() {
    this.returnFocus = document.activeElement;
  }

  hold() {
    document.getElementById("app")?.setAttribute("inert", "");
    document.addEventListener("keydown", this.onKey);
    addEventListener("resize", this.onResize);
  }

  release() {
    document.getElementById("app")?.removeAttribute("inert");
    document.removeEventListener("keydown", this.onKey);
    removeEventListener("resize", this.onResize);
    this.returnFocus?.focus?.({ preventScroll: true });
    this.returnFocus = null;
  }
}
