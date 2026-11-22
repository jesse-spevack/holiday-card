// Every place in public/assets/room.png that the code uses, in room pixels (x right, y down from the top-left corner).
// The art scripts use some of the same numbers: art/scripts/book.py (BOOK) and art/scripts/og.py (the host spots).
// When the room art changes, check these numbers first.

export const ROOM_W = 256;
export const ROOM_H = 192;

// The open floor where people can stand.
export const FLOOR = { x0: 98, x1: 180, y0: 100, y1: 168 };
// Places on the open floor where the hosts like to stand.
export const PLACES = {
  table: { x: 175, y: 126 },
  rug: { x: 130, y: 136 },
  fire: { x: 124, y: 103 },
  presents: { x: 166, y: 105 },
};
// The room has no door. A new family waits below the bottom edge of the room, then walks in from there.
export const ENTRANCE = { x: 127, y: 200 };
export const ENTRANCE_WAIT = { x: 128, y: 182 };

// The window. Snow falls in `snow`, on the glass only. The Waymo and the shooting star show through `glass`,
// which reaches 1 pixel further out and down to the snowy ground outside.
export const WINDOW = {
  snow: { panes: [[167, 184], [190, 212], [217, 236]], y0: 9, y1: 44 },
  glass: { panes: [[166, 184], [189, 212], [217, 235]], y0: 8, y1: 48 },
};
// The ground outside the window, where the Waymo drives. The car's wheels touch this row.
export const ROAD_Y = 47;

// The fireplace opening with its dark frame.
export const FIRE = { x: 112, y: 44, w: 32, h: 24 };
// The candle flames are the bright yellow pixels in this box.
export const CANDLES = { x0: 188, y0: 34, x1: 212, y1: 46 };
// The menorah's white candles stand in front of the glass, so the car and the star pass behind them.
export const MENORAH = { x0: 190, y0: 36, x1: 213, y1: 49 };

// The floor lamp's light is one yellow on the wall around it. The shade inside its outline is the same yellow.
export const LAMP = { x0: 0, y0: 0, x1: 60, y1: 72, shade: { x0: 24, y0: 29, x1: 42, y1: 46 } };
export const LAMP_YELLOW = 0xfef09f;
export const WALL = [0xed, 0xd7, 0xb6];
export const SHADE_OFF = [0xd0, 0xb3, 0x99];
// The fire's own colors. They keep glowing when the lamp goes off.
export const FIRE_COLORS = new Set([0xaa5317, 0xfbe55d, 0xfef09f, 0xf5cf6f, 0xe1a468, 0xf8f5f1]);

// The photo album on the sofa (art/scripts/book.py draws public/assets/book.png). Its cover is the top 12x8 pixels.
export const BOOK = { x: 43, y: 99, w: 12, h: 8 };

// The two dreidels on the window sill, as drawn in room.png. The dreidel game grows from them.
export const DREIDELS = {
  "dreidel-left": { x: 183, y: 45, w: 10, h: 14 },
  "dreidel-right": { x: 214, y: 45, w: 10, h: 14 },
};

// The wine on the dining table (art/scripts/table_wine.py): two glasses and the bottle, with their shadow. A tap starts the toast (toast.js).
export const WINE = { x: 228, y: 109, w: 16, h: 13 };

// The six potted plants. A tap makes a plant bloom (plants.js). Each box is the plant as drawn, with its pot.
// The plant by the armchair starts 5 pixels below its top leaf tips, so the floor lamp keeps a finger-sized tap area.
// Each bloom is the center of one flower on the leaves, in room pixels. A "big" flower is 5 to 7 pixels across, a "small" one 5.
export const PLANTS = {
  "plant-shelf-left": { x: 53, y: 17, w: 14, h: 14, blooms: [[57, 19, "big"], [64, 22, "big"], [55, 25, "small"]] },
  "plant-shelf-right": { x: 73, y: 18, w: 14, h: 16, blooms: [[80, 20, "big"], [75, 25, "small"], [85, 25, "small"]] },
  "plant-wall": { x: 7, y: 68, w: 12, h: 16, blooms: [[10, 70, "small"], [16, 72, "small"]] },
  "plant-armchair": { x: 39, y: 58, w: 17, h: 23, blooms: [[46, 57, "big"], [53, 61, "small"], [41, 61, "small"]] },
  "plant-floor-big": { x: 6, y: 145, w: 34, h: 40, blooms: [[21, 148, "big"], [30, 146, "big"], [11, 157, "big"], [37, 157, "big"]] },
  "plant-floor-small": { x: 34, y: 162, w: 13, h: 23, blooms: [[40, 165, "big"], [45, 170, "small"]] },
};

// The presents on the floor by the window. A tap gives a message from Eddie and Audrey (presents.js).
export const PRESENTS = { x: 170, y: 66, w: 30, h: 26 };

// Hidden things a tap finds. Each box is the thing as drawn, in room pixels.
// The window is "back": it takes only the taps that no small thing in front of it takes.
export const HOTSPOTS = [
  { id: "book", x: 43, y: 99, w: 12, h: 12 },
  { id: "lamp", x: 24, y: 28, w: 19, h: 50 },
  { id: "dreidel-left", x: 183, y: 45, w: 11, h: 15 },
  { id: "menorah", x: 194, y: 39, w: 17, h: 19 },
  { id: "dreidel-right", x: 214, y: 45, w: 11, h: 15 },
  { id: "wine", ...WINE },
  ...Object.entries(PLANTS).map(([id, { x, y, w, h }]) => ({ id, x, y, w, h })),
  // The fireplace opening with its frame. A tap makes the fire crackle and throw sparks (fire.js).
  { id: "fire", ...FIRE },
  { id: "presents", ...PRESENTS },
  { id: "window", x: 162, y: 6, w: 80, h: 38, back: true },
];

// The RGB pixel value at index i of RGBA room pixels.
export const rgb = (data, i) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];

// A pixel of the night outside: the dark blue sky (bluer than red), or white snow.
export function isNight(data, i) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  return b > r + 10 || (r > 200 && g > 200 && b > 200);
}

// The RGBA pixels of a room image.
export function roomPixels(room) {
  const canvas = document.createElement("canvas");
  canvas.width = ROOM_W;
  canvas.height = ROOM_H;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(room, 0, 0);
  return ctx.getImageData(0, 0, ROOM_W, ROOM_H).data;
}
