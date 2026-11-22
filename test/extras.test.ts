// The page and the Worker agree on the names of the hidden extras.
// The page reports each extra by its name (public/js/extras/index.js), and the Worker accepts only the names in EGGS.
import { describe, expect, it } from "vitest";
import { EGGS } from "../src/interactions";
// @ts-expect-error The page modules are plain JavaScript with no types.
import { EXTRAS } from "../public/js/extras/index.js";

const names: string[] = (EXTRAS as { name: string }[]).map((e) => e.name);

describe("the names of the hidden extras", () => {
  it("each extra on the page has its name in EGGS, so the Worker records it", () => {
    expect(names.filter((n) => !(EGGS as readonly string[]).includes(n))).toEqual([]);
  });

  it("each name in EGGS belongs to an extra on the page", () => {
    expect(EGGS.filter((n) => !names.includes(n))).toEqual([]);
  });

  it("no two extras share a name", () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
