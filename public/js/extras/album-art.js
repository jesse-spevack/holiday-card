// Pixel art for the open photo album: one canvas pixel is one book pixel, and CSS scales it up crisp.
// The colors come from the small red book on the sofa (art/scripts/book.py) and the room.

import { eachPixel } from "../pixels.js";

const C = {
  outline: "#1b0804",
  spine: "#6e2a2a",
  cover: "#a8403a",
  light: "#c45a4c",
  shade: "#8a3330",
  grain: "#9b3a35",
  gold: "#f5cf6f",
  goldLight: "#fef09f",
  goldShade: "#be8150",
  paper: "#f8efdc",
  paper2: "#eddcbd",
  paper3: "#d0b399",
  fold: "#a07658",
  edge: "#f8f5f1",
  ink: "#41261b",
  inkLight: "#66463c",
};

// Sizes in book pixels.
const RIM = 4;
const STACK = 4;
const GUTTER = 9;

// A fixed pseudo-random number in [0, 1), so the grain is the same on every draw.
function hash(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const px = (color, x, y, ww = 1, hh = 1) => {
    g.fillStyle = color;
    g.fillRect(x, y, ww, hh);
  };
  return { c, g, px };
}

function notch(g, w, h) {
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) g.clearRect(x, y, 1, 1);
}

function dither(px, a, b, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px((i + j + x + y) % 2 ? a : b, x + i, y + j);
}

// A sheet is a turning page: paper only. Returns the picture and the paper insets in book pixels.
export function sideArt(w, h, side, spread, sheet = false) {
  const { c, g, px } = canvas(w, h);
  // Draw the right side, then mirror it for the left side.
  const x0 = spread ? 0 : 1;
  if (!sheet) drawBoard(px, w, h, x0);

  // Each page edge in the stack steps out one pixel.
  const top = RIM;
  const pw = w - x0 - RIM - STACK;
  const ph = h - RIM * 2 - STACK;
  const edges = sheet ? [C.fold] : [C.paper3, C.edge, C.paper3, C.fold];
  edges.forEach((color, i) => {
    px(color, x0, top + ph + i, pw + i + 1, 1);
    px(color, x0 + pw + i, top + i, 1, ph + 1);
  });
  px(C.paper, x0, top, pw, ph);
  px(C.paper2, x0, top, pw, 1);

  px(C.fold, x0, top, 1, ph);
  px(C.paper3, x0 + 1, top, 2, ph);
  dither(px, C.paper3, C.paper2, x0 + 3, top, 2, ph);
  px(C.paper2, x0 + 5, top, 2, ph);
  dither(px, C.paper2, C.paper, x0 + 7, top, 2, ph);
  // The pages curve down into the spine, in two steps.
  const board = spread ? C.spine : C.cover;
  const hole = (x, y, ww, hh) => (sheet ? g.clearRect(x, y, ww, hh) : px(board, x, y, ww, hh));
  hole(x0, top, 3, 2);
  hole(x0 + 3, top, 3, 1);
  px(C.fold, x0 + 3, top + 1, 3, 1);
  px(C.fold, x0, top + 2, 3, 1);
  hole(x0, top + ph, 2, edges.length);

  if (!sheet) notch(g, w, h);
  const out = side === "l" ? mirror(c) : c;
  // The two sides of a spread join at the spine, so those corners stay square.
  if (spread && !sheet) {
    const og = out.getContext("2d");
    const sx = side === "l" ? w - 1 : 0;
    og.fillStyle = C.outline;
    og.fillRect(sx, 0, 1, 1);
    og.fillRect(sx, h - 1, 1, 1);
  }
  return {
    url: out.toDataURL(),
    paper: { top, bottom: h - top - ph, outer: w - x0 - pw, inner: x0 + GUTTER },
  };
}

function drawBoard(px, w, h, x0) {
  px(C.outline, 0, 0, w, h);
  px(C.cover, x0, 1, w - x0 - 1, h - 2);
  px(C.light, x0, 1, w - x0 - 1, 1);
  px(C.shade, x0, h - 3, w - x0 - 1, 2);
  px(C.shade, w - 2, 2, 1, h - 3);
  // The spine peeks out between the pages at the top and the bottom.
  px(C.spine, x0, 1, 2, RIM - 1);
  px(C.spine, x0, h - RIM, 2, RIM - 1);
}

function mirror(src) {
  const { c, g } = canvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

// Returns the picture and the name plate's place, in book pixels.
export function coverArt(w, h) {
  const { c, g, px } = canvas(w, h);
  const spine = Math.max(6, Math.round(w * 0.1));
  px(C.outline, 0, 0, w, h);
  px(C.spine, 1, 1, spine - 1, h - 2);
  px(C.shade, 1, 1, 1, h - 2);
  px(C.outline, spine, 1, 1, h - 2);
  for (const y of [Math.round(h * 0.12), Math.round(h * 0.88) - 2]) {
    px(C.cover, 1, y, spine - 1, 1);
    px(C.outline, 1, y + 1, spine - 1, 1);
  }
  const x0 = spine + 1;
  px(C.cover, x0, 1, w - x0 - 1, h - 2);
  for (let y = 3; y < h - 4; y++) {
    for (let x = x0 + 2; x < w - 3; x++) {
      const n = hash(x, y);
      if (n < 0.035) px(C.grain, x, y);
      else if (n > 0.985) px(C.light, x, y);
    }
  }
  px(C.light, x0, 1, w - x0 - 1, 1);
  px(C.light, x0, 1, 1, h - 3);
  px(C.shade, w - 2, 2, 1, h - 3);
  px(C.shade, x0 + 1, h - 3, w - x0 - 2, 2);

  const cap = Math.max(6, Math.round(w * 0.08));
  for (const flip of [false, true]) {
    for (let j = 0; j <= cap + 1; j++) {
      for (let i = 0; i <= cap + 1 - j; i++) {
        const d = i + j;
        const color = d === cap + 1 ? C.outline : d === cap ? C.goldShade : j === 0 || i === 0 ? (flip ? C.goldShade : C.goldLight) : C.gold;
        px(color, w - 2 - i, flip ? h - 2 - j : 1 + j);
      }
    }
  }

  const bodyW = w - x0 - 1;
  const plate = { x: x0 + Math.round(bodyW * 0.14), y: Math.round(h * 0.2), w: 0, h: Math.max(14, Math.round(h * 0.15)) };
  plate.w = w - 1 - Math.round(bodyW * 0.14) - plate.x;
  px(C.outline, plate.x, plate.y, plate.w, plate.h);
  px(C.gold, plate.x + 1, plate.y + 1, plate.w - 2, plate.h - 2);
  px(C.goldLight, plate.x + 1, plate.y + 1, plate.w - 2, 1);
  px(C.goldShade, plate.x + 1, plate.y + plate.h - 2, plate.w - 2, 1);
  px(C.goldShade, plate.x + plate.w - 2, plate.y + 1, 1, plate.h - 2);
  px(C.goldShade, plate.x + 3, plate.y + 3, plate.w - 6, 1);
  px(C.goldShade, plate.x + 3, plate.y + plate.h - 4, plate.w - 6, 1);
  for (const [x, y] of [[0, 0], [plate.w - 1, 0], [0, plate.h - 1], [plate.w - 1, plate.h - 1]]) px(C.cover, plate.x + x, plate.y + y);

  notch(g, w, h);
  return { url: c.toDataURL(), plate };
}

// A black paper photo corner, drawn for the top left.
const CORNER = [
  "OOOOOOO",
  "OHHHHO.",
  "OHDDO..",
  "OHDO...",
  "OHO....",
  "OO.....",
  "O......",
];
const FLAKE = [
  "....G....",
  "..G.G.G..",
  "...GGG...",
  "G.G.G.G.G",
  ".GGGgGGG.",
  "G.G.G.G.G",
  "...GGG...",
  "..G.G.G..",
  "....G....",
];

function sprite(rows, colors, flipX = false, flipY = false) {
  const { c, px } = canvas(rows[0].length, rows.length);
  eachPixel(rows, colors, (x, y, color) => px(color, x, y), { flipX, flipY });
  return c.toDataURL();
}

export const CORNER_SIZE = CORNER.length;
export const FLAKE_SIZE = FLAKE.length;

let sprites;
export function spriteArt() {
  if (sprites) return sprites;
  const corner = { O: C.outline, H: C.inkLight, D: C.ink };
  sprites = {
    cornerTL: sprite(CORNER, corner),
    cornerTR: sprite(CORNER, corner, true),
    cornerBL: sprite(CORNER, corner, false, true),
    cornerBR: sprite(CORNER, corner, true, true),
    flake: sprite(FLAKE, { G: C.fold, g: C.cover }),
  };
  return sprites;
}
