// The pixels of the dreidel game (public/js/dreidel.js). Everything is drawn in code at a low size,
// W x H pixels, and CSS scales the canvas up by a whole number with crisp pixels.
// The dreidel is a small 3D model: a square body with a letter on each side, a point, and a handle.
// Each frame finds the color of each pixel from the spin angle and the tilt, so any pose looks hand-drawn.

export const W = 88;
export const H = 72;
// The sill top, where the point of the dreidel stands.
export const FLOOR = 58;

// The sides in the order they go around the dreidel, with the traditional meaning of each letter.
export const FACES = [
  { id: "nun", name: "Nun", says: "Nothing happens" },
  { id: "gimel", name: "Gimel", says: "Take it all!" },
  { id: "hei", name: "Hei", says: "Take half" },
  { id: "shin", name: "Shin", says: "Put one in" },
];

// The four Hebrew letters, 12 rows tall, upright as they read on the side of a standing dreidel.
export const LETTERS = {
  nun: [
    "..#####.",
    "..######",
    "..##..##",
    "......##",
    "......##",
    "......##",
    "......##",
    "......##",
    "......##",
    "......##",
    "########",
    "########",
  ],
  gimel: [
    ".#####.",
    ".######",
    ".##..##",
    ".....##",
    ".....##",
    ".....##",
    ".....##",
    "....###",
    "...####",
    "..##.##",
    "###..##",
    "##...##",
  ],
  hei: [
    "##########",
    "##########",
    "........##",
    "........##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
    "##......##",
  ],
  shin: [
    "##...##...##",
    "##...##...##",
    "##...##...##",
    "##...##...##",
    "##...##...##",
    "##...##...##",
    "##...##...##",
    "##...##..###",
    "###.##..###.",
    ".##########.",
    "..########..",
    "...######...",
  ],
};

// Colors from the room (public/assets/room.png), as 0xAABBGGRR for a Uint32Array over ImageData.
const rgb = (hex) => 0xff000000 | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff);
const C = {
  outline: rgb(0x2a1813),
  wall: rgb(0xedd7b6),
  wallShade: rgb(0xd0b399),
  sky: rgb(0x273049),
  skyFar: rgb(0x2e3a57),
  hill: rgb(0x8a9299),
  hillLight: rgb(0x9da8b6),
  snow: rgb(0xb8c0c6),
  snowLight: rgb(0xedd7b6),
  flake: rgb(0xf8f5f1),
  frame: rgb(0xa07658),
  frameDark: rgb(0x8b664f),
  sill: rgb(0xc4936b),
  sillLight: rgb(0xd7a97c),
  sillGrain: rgb(0xb5825c),
  sillBack: rgb(0xa07658),
  sillEdge: rgb(0xe1a468),
  sillFront: rgb(0x895136),
  shadow: rgb(0x9a6a4a),
  coinEdge: rgb(0x9a5a22),
  coin: rgb(0xe0a83c),
  coinLight: rgb(0xf5cf6f),
  coinShine: rgb(0xfef09f),
};

// The painted wood of the dreidel, dark to light, close to the small dreidels on the sill.
const WOOD = [0x4e2418, 0x6a2f1f, 0x884a27, 0x9c5c2c, 0xb57437, 0xc8945d, 0xe1b077, 0xeacf94].map(rgb);
// The letters are painted in deep blue, dark to light, like the bunting.
const INK = [0x1b2140, 0x232c55, 0x2f3d70, 0x3d5190].map(rgb);

// The shape, in pixels. The point is at (0, 0), and v goes up the handle.
const A = 10.5; // half the width of a side
const HP = 12; // the point
const HB = 20; // the body with the letters
const HC = 2; // the bevel on top of the body
const AC = 8; // half the width at the top of the bevel
const RH = 2.4; // the handle radius
const HH = 8; // the handle length
const TOP = HP + HB + HC + HH;
export const LENGTH = TOP + RH;

const LIGHT = norm([-0.55, 0.6, 0.6]);
function norm(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

// The side under a point across the body, as seen from the front. u is in body pixels.
function sideAt(u, theta) {
  for (let k = 0; k < 4; k++) {
    const n = theta + (k * Math.PI) / 2;
    const c = Math.cos(n);
    if (c <= 1e-6) continue;
    const s = (u - A * Math.sin(n)) / (A * c);
    if (s >= -1 && s <= 1) return { k, s, n };
  }
  return null;
}

// The lowest point of the dreidel below its point, in screen pixels, for a spin angle and a tilt.
// The game sets the point higher by this much, so the dreidel always rests on the sill.
export function lowest(theta, tilt) {
  const e = A * (Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta)));
  const ec = e * (AC / A);
  const pts = [[0, 0], [e, HP], [-e, HP], [e, HP + HB], [-e, HP + HB], [ec, HP + HB + HC], [-ec, HP + HB + HC], [RH, TOP], [-RH, TOP], [0, LENGTH]];
  let low = -Infinity;
  for (const [u, v] of pts) low = Math.max(low, u * Math.sin(tilt) - v * Math.cos(tilt));
  return low;
}

const BOX = 96;
const ids = new Int16Array(BOX * BOX);
const tones = new Uint32Array(BOX * BOX);

// Draws the dreidel into px (a W x H Uint32Array). (x, y) is the point, theta the spin, tilt the lean to the right.
export function drawDreidel(px, { x, y, theta, tilt }) {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const ox = Math.floor(x) - BOX / 2;
  const oy = Math.floor(y) - BOX / 2;
  ids.fill(0);
  for (let j = 0; j < BOX; j++) {
    for (let i = 0; i < BOX; i++) {
      const dx = ox + i + 0.5 - x;
      const dy = oy + j + 0.5 - y;
      const u = dx * cos + dy * sin;
      const v = dx * sin - dy * cos;
      const hit = shade(u, v, theta, cos, sin);
      if (!hit) continue;
      ids[j * BOX + i] = hit.id;
      tones[j * BOX + i] = hit.color;
    }
  }
  for (let j = 0; j < BOX; j++) {
    for (let i = 0; i < BOX; i++) {
      const X = ox + i;
      const Y = oy + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const at = j * BOX + i;
      const id = ids[at];
      if (id) {
        // A dark line where two sides meet, so the faces read as a box.
        const left = i > 0 ? ids[at - 1] : 0;
        const up = j > 0 ? ids[at - BOX] : 0;
        const edge = (left && left !== id && (left & 3) !== (id & 3)) || (up && up !== id && ((up >> 2) !== (id >> 2)));
        px[Y * W + X] = edge ? darker(tones[at]) : tones[at];
      } else if (
        (i > 0 && ids[at - 1]) || (i < BOX - 1 && ids[at + 1]) || (j > 0 && ids[at - BOX]) || (j < BOX - 1 && ids[at + BOX])
      ) {
        px[Y * W + X] = C.outline;
      }
    }
  }
}

function darker(color) {
  const w = WOOD.indexOf(color);
  if (w > 0) return WOOD[Math.max(0, w - 2)];
  const k = INK.indexOf(color);
  if (k > 0) return INK[k - 1];
  return color;
}

// The region ids: the low 2 bits hold the side, the rest hold the part (point, body, bevel, handle).
function shade(u, v, theta, cos, sin) {
  if (v < 0) return null;
  let part;
  let side;
  let local;
  if (v < HP) {
    side = sideAt((u * HP) / Math.max(v, 1e-3), theta);
    if (!side) return null;
    part = 1;
    local = [Math.sin(side.n) * HP, -A, Math.cos(side.n) * HP];
  } else if (v < HP + HB) {
    side = sideAt(u, theta);
    if (!side) return null;
    part = 2;
    local = [Math.sin(side.n), 0, Math.cos(side.n)];
  } else if (v < HP + HB + HC) {
    const r = 1 - ((v - HP - HB) / HC) * (1 - AC / A);
    side = sideAt(u / r, theta);
    if (!side) return null;
    part = 3;
    local = [Math.sin(side.n) * HC, A - AC, Math.cos(side.n) * HC];
  } else if (Math.abs(u) < RH && (v < TOP || (v - TOP) ** 2 + u * u < RH * RH)) {
    part = 4;
    const k = u / RH;
    const top = v > TOP ? (v - TOP) / RH : 0;
    local = [k, top, Math.sqrt(Math.max(0, 1 - k * k - top * top))];
  } else {
    return null;
  }
  // Turn the normal from the dreidel's frame to the room: u goes right and down with the tilt, v goes up.
  const [nu, nv, nz] = norm(local);
  const wx = nu * cos + nv * sin;
  const wy = -nu * sin + nv * cos;
  const light = Math.max(0, wx * LIGHT[0] + wy * LIGHT[1] + nz * LIGHT[2]);
  const level = 0.18 + light * 0.82;
  let tone = Math.min(WOOD.length - 1, Math.floor(level * WOOD.length));
  if (part === 4) tone = Math.max(0, tone - 3);
  if (part === 1) tone = Math.max(0, tone - 1);
  let color = WOOD[tone];
  if (part === 2 && ink(side, v)) color = INK[Math.min(INK.length - 1, Math.max(0, Math.floor(level * INK.length * 1.1) - 1))];
  return { id: (part << 2) | (side ? side.k : 0), color };
}

// Is this point of a side inside the side's letter?
function ink(side, v) {
  const rows = LETTERS[FACES[side.k].id];
  const w = rows[0].length;
  const col = Math.floor((side.s + 1) * A) - Math.floor((2 * A - w) / 2);
  const row = Math.floor(HP + HB - v) - Math.floor((HB - rows.length) / 2);
  return row >= 0 && row < rows.length && col >= 0 && col < w && rows[row][col] === "#";
}

// ---- the room around the dreidel: the snowy window and the wooden sill ----
export const PANES = [[4, 27], [32, 55], [60, 83]];
export const PANE_Y = [0, 38];

export function drawRoom(px) {
  px.fill(C.wall);
  // the window frame and its glass, with snowy hills far away
  for (let y = 0; y < 44; y++) for (let x = 0; x < W; x++) px[y * W + x] = C.frame;
  for (const [x0, x1] of PANES) {
    for (let y = PANE_Y[0]; y <= PANE_Y[1]; y++) {
      for (let x = x0; x <= x1; x++) {
        const hill = 29 + Math.round(2 * Math.sin(x * 0.05 + 0.4) + Math.sin(x * 0.17));
        const drift = 36 - Math.round(0.8 * Math.sin(x * 0.21 + 2));
        let c = C.sky;
        if (y >= hill) c = y === hill ? C.hillLight : C.hill;
        if (y >= drift) c = y === drift ? C.snowLight : C.snow;
        px[y * W + x] = c;
      }
      px[y * W + x0 - 1] = C.outline;
      px[y * W + x1 + 1] = C.frameDark;
    }
  }
  for (let x = 0; x < W; x++) {
    px[39 * W + x] = C.outline;
    px[40 * W + x] = C.frame;
    px[41 * W + x] = C.frameDark;
    px[42 * W + x] = C.frameDark;
    px[43 * W + x] = C.outline;
  }
  for (let y = 0; y < 44; y++) px[y * W] = px[y * W + W - 1] = C.outline;
  // the sill: a deep wooden shelf with a little grain, a bright front edge, and its front face
  for (let y = 44; y < 63; y++) {
    for (let x = 0; x < W; x++) {
      let c = y < 46 ? C.sillBack : C.sill;
      if (y >= 46 && (x * 7 + y * 13) % 29 === 0 && y % 3 === 1) c = C.sillGrain;
      if (y >= 46 && y % 5 === 2 && (x + y * 3) % 23 < 6) c = C.sillGrain;
      if (y === 62) c = C.sillEdge;
      px[y * W + x] = c;
    }
  }
  for (let x = 0; x < W; x++) {
    px[63 * W + x] = C.outline;
    for (let y = 64; y < 68; y++) px[y * W + x] = y === 64 ? C.frame : C.sillFront;
    px[68 * W + x] = C.outline;
    for (let y = 69; y < H; y++) px[y * W + x] = y === 69 ? C.wallShade : C.wall;
  }
}

// Speed arcs beside a fast dreidel, like ( and ). They flicker with the spin. strength is 0 to 1.
const ARCS = [
  [[1, -2], [0, -1], [0, 0], [0, 1], [1, 2]],
  [[2, -4], [1, -3], [1, -2], [0, -1], [0, 0], [0, 1], [1, 2], [1, 3], [2, 4]],
];
export function drawSpeed(px, x, y, turn, strength) {
  const colors = [rgb(0xfef09f), rgb(0xf8f5f1)];
  const mid = Math.round(y - HP - HB / 2);
  const flick = Math.floor(turn / (Math.PI / 4)) % 2;
  const arcs = strength > 0.45 ? 2 : 1;
  for (const side of [-1, 1]) {
    for (let n = 0; n < arcs; n++) {
      const col = Math.round(x + side * (19 + n * 3 + flick));
      for (const [dx, dy] of ARCS[n]) {
        const X = col - side * dx;
        const Y = mid + dy;
        if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = colors[n];
      }
    }
  }
}

export function drawFlake(px, x, y) {
  const X = Math.round(x);
  const Y = Math.round(y);
  if (Y < PANE_Y[0] || Y > PANE_Y[1] || X < 0 || X >= W) return;
  if (!PANES.some(([a, b]) => X >= a && X <= b)) return;
  if (px[Y * W + X] === C.snow || px[Y * W + X] === C.snowLight) return;
  px[Y * W + X] = C.flake;
}

// A soft shadow on the sill under the dreidel: w pixels wide, centered at x.
export function drawShadow(px, x, y, w) {
  const half = w / 2;
  for (let j = -1; j <= 1; j++) {
    const span = half * Math.sqrt(1 - (j / 2) ** 2) - (j ? 1 : 0);
    for (let i = Math.round(x - span); i <= Math.round(x + span); i++) {
      const at = (y + j) * W + i;
      if (i >= 0 && i < W && y + j >= 44 && y + j < 62 && px[at] !== C.outline) px[at] = C.shadow;
    }
  }
}

// A pile of gold coins (gelt): stacks of up to five, side by side, the front row lower.
// side is 1 for a pile that grows to the right, -1 for one that grows to the left.
export function drawGelt(px, x, y, n, side = 1) {
  const place = [[0, 0], [6, -1], [3, 2], [9, 2], [12, -1], [15, 1]];
  const stacks = [];
  for (let left = n, i = 0; left > 0; i++) {
    const count = Math.min(5, left);
    const [dx, dy] = place[i % place.length];
    stacks.push({ count, dx: dx * side, dy });
    left -= count;
  }
  stacks.sort((a, b) => a.dy - b.dy);
  for (const s of stacks) {
    for (let c = 0; c < s.count; c++) drawCoin(px, x + s.dx, y + s.dy - c * 2, c === s.count - 1);
  }
}

const COIN = [
  ".oooooo.",
  "oLSSLLLo",
  "ocLLLLco",
  ".oooooo.",
];
function drawCoin(px, x, y, top) {
  COIN.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === ".") continue;
      const X = x - 4 + i;
      const Y = y - 3 + j;
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      let c = ch === "o" ? C.coinEdge : ch === "S" ? C.coinShine : ch === "L" ? C.coinLight : C.coin;
      if (!top && j === 1) c = C.coin;
      px[Y * W + X] = c;
    }
  });
}

// The letter alone, for the result: ink on a clear background, at 1 pixel per cell.
export function drawLetter(ctx, id, color = "#ffd27a") {
  const rows = LETTERS[id];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = color;
  const ox = Math.floor((ctx.canvas.width - rows[0].length) / 2);
  const oy = Math.floor((ctx.canvas.height - rows.length) / 2);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "#") ctx.fillRect(ox + i, oy + j, 1, 1);
  });
}
