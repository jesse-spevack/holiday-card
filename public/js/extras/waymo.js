// The Waymo, a hidden extra. Now and then, a light blue Waymo van drives past outside the window,
// behind the frame and the menorah, and Audrey calls it out. It shares the road with the other cars (road.js).

import { joinRoad } from "./road.js";

// The Waymo Ojai, facing right. O outline, L roof light, B blue body, S body shade, G window,
// D lidar dome, R tail light, H headlight, K tire, h hub.
const ROWS = [
  "......OOO.....",
  ".....ODDDO....",
  ".OOOOOOOOOOO..",
  "OLLLLLLLLLLLO.",
  "OBGGGBGGGGGGO.",
  "OBGGGBGGGGGGBO",
  "OBBBBBBBBBBBBO",
  "RBBBBBBBBBBBBH",
  "OSSOOSSSSOOSSO",
  ".OOKhOOOOKhOO.",
  "...OO....OO...",
];
const COLORS = { O: "#1b1a2e", L: "#c6e7fa", B: "#86c5ea", S: "#5a93bf", G: "#273049", D: "#2a2f45", R: "#e0504a", H: "#fef09f", K: "#3c3e50", h: "#9da8b6" };

// The fields are in road.js (joinRoad). The lidar dome spins.
const WAYMO = {
  kind: "waymo", rows: ROWS, colors: COLORS, speed: 13, gap: [40, 90], light: { y: 7, color: "#fff4c2" }, park: [168, 168],
  shout: { host: "daughter", text: "Waymo!", seconds: 4 },
  dome: { x: 6, y: 1, w: 3 },
};

export default {
  name: "waymo",
  hints: [
    { host: "jesse", text: "Watch the street. Some cars drive themselves." },
    { host: "son", text: "I saw a van with nobody driving it!" },
  ],
  setup(ctx) {
    const road = joinRoad(ctx, WAYMO);
    return {
      test: () => ({
        ...road.test,
        // car: the x of the Waymo while it is on the road, else null.
        eggs: () => ({ car: road.x("waymo"), nextCarIn: road.next.waymo - ctx.scene.time }),
        sendWaymo: () => road.send("waymo"),
      }),
    };
  },
};
