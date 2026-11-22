// Room-sized canvases that the extras draw with: a mask of some room pixels, and a sky cut to the window glass.

import { ROOM_W, ROOM_H, isGlass } from "./room.js";

export function roomCanvas() {
  const c = document.createElement("canvas");
  c.width = ROOM_W;
  c.height = ROOM_H;
  return c;
}

// A room-sized canvas: one color (white by default) where `keep` says yes, clear everywhere else.
export function maskLayer(keep, [r, gr, b] = [255, 255, 255]) {
  const c = roomCanvas();
  const g = c.getContext("2d");
  const img = g.createImageData(ROOM_W, ROOM_H);
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      const i = (y * ROOM_W + x) * 4;
      if (keep(x, y, i)) img.data.set([r, gr, b, 255], i);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// The window glass of a room image, white on clear. The extras that share one room image share one mask.
const glassMasks = new WeakMap();
export function glassMask(pixels) {
  if (!glassMasks.has(pixels)) glassMasks.set(pixels, maskLayer((x, y, i) => isGlass(pixels, x, y, i)));
  return glassMasks.get(pixels);
}

// A sky outside the window: what paint(s) draws on it shows only through the glass, behind the frame and the menorah.
export class Sky {
  constructor(pixels) {
    this.canvas = roomCanvas();
    this.glass = glassMask(pixels);
  }

  draw(g, paint) {
    const s = this.canvas.getContext("2d");
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, ROOM_W, ROOM_H);
    paint(s);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(this.glass, 0, 0);
    g.drawImage(this.canvas, 0, 0);
  }
}
