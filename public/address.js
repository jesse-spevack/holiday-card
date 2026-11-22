import { api } from "./api.js";

const DEBOUNCE_MS = 250;

// Street suggestions from Google Places, with a session token per address so Google bills one session.
export function attachAddressSuggestions({ street, list, onPick }) {
  let sessionToken = crypto.randomUUID();
  let suggestions = [];
  let active = -1;
  let timer = null;
  let inflight = null;

  const close = () => {
    list.hidden = true;
    street.setAttribute("aria-expanded", "false");
    street.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const render = () => {
    list.replaceChildren(
      ...suggestions.map((s, i) => {
        const li = document.createElement("li");
        li.id = `street-option-${i}`;
        li.role = "option";
        li.setAttribute("aria-selected", String(i === active));
        const main = document.createElement("span");
        main.className = "main";
        main.textContent = s.main;
        const secondary = document.createElement("span");
        secondary.className = "secondary";
        secondary.textContent = s.secondary;
        li.append(main, secondary);
        li.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          pick(i);
        });
        return li;
      }),
      attribution(),
    );
    list.hidden = suggestions.length === 0;
    street.setAttribute("aria-expanded", String(suggestions.length > 0));
    if (active >= 0) street.setAttribute("aria-activedescendant", `street-option-${active}`);
  };

  const pick = async (index) => {
    const choice = suggestions[index];
    close();
    if (!choice) return;
    street.value = choice.main;
    try {
      const { address } = await api.address(choice.placeId, sessionToken);
      onPick(address);
    } catch {
      // The guest can still type the rest of the address by hand.
    } finally {
      sessionToken = crypto.randomUUID();
    }
  };

  const search = async () => {
    const input = street.value.trim();
    inflight?.abort();
    if (input.length < 3) {
      suggestions = [];
      return close();
    }
    inflight = new AbortController();
    try {
      ({ suggestions } = await api.suggest(input, sessionToken, inflight.signal));
      active = -1;
      if (document.activeElement === street) render();
    } catch {
      suggestions = [];
      close();
    }
  };

  street.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(search, DEBOUNCE_MS);
  });

  street.addEventListener("keydown", (event) => {
    if (list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      active = (active + delta + suggestions.length) % suggestions.length;
      render();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      close();
    }
  });

  street.addEventListener("blur", () => setTimeout(close, 120));
}

function attribution() {
  const li = document.createElement("li");
  li.className = "attribution";
  li.setAttribute("aria-hidden", "true");
  li.textContent = "Powered by Google";
  return li;
}
