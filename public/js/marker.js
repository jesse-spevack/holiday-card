// The gold arrow over the guest that "My family" picks, so the guest finds that person in a crowd.
// It is a scene layer: it draws over the sprites, in room pixels, and follows the sprite as it walks.
// When the camera zooms in, it also keeps the person in the middle of the view.
import { eachPixel } from "./pixels.js";
import { PALETTE } from "./palette.js";

// 11 by 7 room pixels, with a dark edge, so it shows on the light wall, the floor, and the dark room.
const ARROW = [
  "ooooooooooo",
  "oGGGGGGGGGo",
  ".oGGGGGGGo.",
  "..oGGGGGo..",
  "...oGGGo...",
  "....oGo....",
  ".....o.....",
];
const COLORS = { o: "#2a1813", G: PALETTE.gold };
// The gap between the tip and the top of the sprite, and how far the arrow bobs (scene seconds for one bob).
const GAP = 2;
const BOB_SECONDS = 0.8;

export const MARKER = { w: ARROW[0].length, h: ARROW.length, gap: GAP };

// The first row of an image with a pixel that shows. A sprite image can have clear rows over the head.
const heads = new WeakMap();
function headRow(img) {
  if (heads.has(img)) return heads.get(img);
  let row = 0;
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, img.width, img.height);
    const shows = (y) => { for (let x = 0; x < img.width; x++) if (data[(y * img.width + x) * 4 + 3] > 0) return true; return false; };
    while (row < img.height - 1 && !shows(row)) row++;
  } catch {}
  heads.set(img, row);
  return row;
}

export class Marker {
  constructor({ scene, reducedMotion }) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.sprite = null;
    this.at = null;
  }

  // The sprite to mark, or null for none.
  show(sprite) {
    this.sprite = sprite;
    this.follow();
  }

  // A zoomed camera keeps the person in view. The whole room shows at zoom 0, so then nothing moves.
  follow() {
    const target = this.scene.camera.target;
    const s = this.sprite;
    if (!s || !target?.zoom) return;
    this.scene.focus(s.x, s.y - 12, target.zoom);
  }

  update() {
    if (this.sprite && !this.scene.sprites.includes(this.sprite)) this.sprite = null;
    this.follow();
  }

  drawFront(g) {
    const s = this.sprite;
    this.at = null;
    if (!s?.img) return;
    const bob = this.reducedMotion ? 0 : Math.floor((this.scene.time / BOB_SECONDS) * 2) % 2;
    const x = Math.round(s.x) - Math.floor(MARKER.w / 2);
    const y = Math.round(s.y - s.img.height + headRow(s.img) - s.bob - (s.rise || 0)) - GAP - MARKER.h - bob;
    eachPixel(ARROW, COLORS, (i, j, color) => {
      g.fillStyle = color;
      g.fillRect(x + i, y + j, 1, 1);
    });
    // The tip, in room pixels, for the test API.
    this.at = { x: x + Math.floor(MARKER.w / 2), y: y + MARKER.h - 1 };
  }

  state() {
    return { on: !!this.sprite, familyId: this.sprite?.familyId ?? null, index: this.sprite?.index ?? null, tip: this.at };
  }
}
