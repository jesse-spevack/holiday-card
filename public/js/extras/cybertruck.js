// The Cybertruck, a hidden extra. Now and then, a steel Cybertruck drives past outside the window on the same road
// as the Waymo (road.js), and Eddie calls it out.

import { joinRoad } from "./road.js";

// The Cybertruck, facing right: a steel wedge with one sharp peak, a long flat slope to the tail, and a steeper slope to the nose.
// L steel edge in the light, S steel, T lower steel in shade, G glass, g glint, C black arches, sill, and bumpers,
// K tire, h wheel cover, R tail light bar, W front light bar.
const ROWS = [
  "..............LL............",
  "..........LLLLGgLL..........",
  "......LLLLSGGGgGGGLLL.......",
  "..LLLLSSSSSGGgGGGGGGGLL.....",
  "RLSSSSSSSSSSSSSSSSSSSSSLLL..",
  "SSSCCCCCSSSSSSSSSSSSSCCCCCWW",
  "SSCCKKKCCSSSSSSSSSSSCCKKKCCC",
  "CTCKhhhKCTTTTTTTTTTTCKhhhKCC",
  "CCCKhKhKCCCCCCCCCCCCCKhKhKCC",
  "...KhhhK.............KhhhK..",
  "....KKK...............KKK...",
];
const COLORS = { L: "#eef0f3", S: "#c4c8cf", T: "#a2a7b0", G: "#334058", g: "#55657f", C: "#1b1a2e", K: "#3c3e50", h: "#8a94a3", R: "#e0504a", W: "#ffffff" };

// The fields are in road.js (joinRoad). The truck is too long for one pane, so with reduced motion
// it stops with its nose and its light bar in an outer pane. Its tail stays behind the window frame,
// so no part of it shows between the menorah candles in the middle pane.
const TRUCK = {
  kind: "cybertruck", rows: ROWS, colors: COLORS, speed: 16, gap: [60, 120], light: { y: 5, color: "#eef6ff" }, park: [217, 157],
  shout: { host: "son", text: "Cybertruck!", seconds: 4 },
};

export default {
  name: "cybertruck",
  setup(ctx) {
    const road = joinRoad(ctx, TRUCK);
    return {
      test: () => ({
        ...road.test,
        // truck: the x of the Cybertruck while it is on the road, else null.
        eggs: () => ({ truck: road.x("cybertruck"), nextTruckIn: road.next.cybertruck - ctx.scene.time }),
        // dir 1 drives right, -1 drives left. With no dir, the truck picks a way.
        sendCybertruck: (dir) => road.send("cybertruck", dir),
        constants: () => ({ TRUCK: { w: ROWS[0].length, h: ROWS.length, colors: Object.values(COLORS) } }),
      }),
    };
  },
};
