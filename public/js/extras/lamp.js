// The floor lamp, a hidden extra. A tap on the lamp turns it off: the room goes dark blue, and the fire and the candles glow.
// A second tap turns it on. Other extras ask the lamp if the room is dark: extra("lamp").dark.

import { FIRE, LAMP, LAMP_TAP, LAMP_YELLOW, WALL, SHADE_OFF, FIRE_COLORS, ROOM_W, rgb, isGlass } from "../room.js";
import { roomCanvas, maskLayer } from "../masks.js";

// With the lamp off, the room goes this dark blue. plants.js darkens its falling petals with it too.
export const NIGHT_TINT = [0x7c, 0x84, 0xb8];

class Lamp {
  constructor({ scene, sound }) {
    this.scene = scene;
    this.sound = sound;
    this.on = true;
  }

  prepare(pixels) {
    this.offLayer = lampOff(pixels);
    const fire = (x, y, i) => x >= FIRE.x && x < FIRE.x + FIRE.w && y >= FIRE.y && y < FIRE.y + FIRE.h && FIRE_COLORS.has(rgb(pixels, i));
    this.tintLayer = maskLayer((x, y, i) => !isGlass(pixels, x, y, i) && !fire(x, y, i), NIGHT_TINT);
  }

  toggle() {
    this.on = !this.on;
    this.sound.click();
  }

  // Over the room image, under the snow: the lamp light goes.
  drawBack(g) {
    if (!this.on && this.offLayer) g.drawImage(this.offLayer, 0, 0);
  }

  // Over everything: with the lamp off, the room goes dark blue, and the fire and the candles glow.
  drawFront(g) {
    if (this.on || !this.tintLayer) return;
    const scene = this.scene;
    g.globalCompositeOperation = "multiply";
    g.drawImage(this.tintLayer, 0, 0);
    g.globalCompositeOperation = "source-over";
    this.drawFirelight(g);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "#ffb050";
    scene.flames.forEach(({ x, y }, i) => {
      if (scene.flameState(i) === "out") return;
      g.globalAlpha = 0.16;
      g.fillRect(x - 1, y - 2, 3, 4);
    });
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    scene.drawFlames(g);
  }

  // A soft warm pool of light that spreads from the fireplace onto the floor.
  drawFirelight(g) {
    const flicker = this.scene.flicker();
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(FIRE.x + FIRE.w / 2, FIRE.y + FIRE.h);
    g.scale(1, 0.55);
    const pool = g.createRadialGradient(0, 0, 4, 0, 0, 64);
    pool.addColorStop(0, `rgba(255, 170, 80, ${0.3 + 0.08 * flicker})`);
    pool.addColorStop(1, "rgba(255, 170, 80, 0)");
    g.fillStyle = pool;
    g.fillRect(-64, -64, 128, 128);
    g.restore();
  }
}

// The pixels that change when the lamp goes off: its yellow light becomes the wall, and the shade goes dull.
function lampOff(data) {
  const c = roomCanvas();
  const g = c.getContext("2d");
  const img = g.createImageData(c.width, c.height);
  const { shade } = LAMP;
  for (let y = LAMP.y0; y < LAMP.y1; y++) {
    // The shade is every yellow pixel between the first and the last outline pixel on its row.
    let left = Infinity;
    let right = -Infinity;
    if (y >= shade.y0 && y <= shade.y1) {
      for (let x = shade.x0; x <= shade.x1; x++) {
        if (rgb(data, (y * ROOM_W + x) * 4) !== LAMP_YELLOW) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    for (let x = LAMP.x0; x < LAMP.x1; x++) {
      const i = (y * ROOM_W + x) * 4;
      if (rgb(data, i) !== LAMP_YELLOW) continue;
      const [r, gr, b] = x > left && x < right ? SHADE_OFF : WALL;
      img.data.set([r, gr, b, 255], i);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default {
  name: "lamp",
  spots: [{ id: "lamp", ...LAMP_TAP }],
  hints: [
    { host: "jesse", text: "This room is cozier with the lights low." },
    { host: "son", text: "The fire looks so cool in the dark." },
  ],
  setup(ctx) {
    const lamp = new Lamp(ctx);
    return {
      layer: lamp,
      tap: () => lamp.toggle(),
      get dark() { return !lamp.on; },
      test: () => ({ eggs: () => ({ lampOn: lamp.on }) }),
    };
  },
};
