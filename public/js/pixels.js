// Pixel art written as text: each string is one row, and each character is one pixel.
// The art modules (extras/road.js, extras/pets.js, extras/album-art.js, extras/dreidel-art.js) draw their small sprites with this.
// The plants and the glint (extras/plants.js, glint.js) share drawTwinkle.

// Calls put(x, y, value) for each character in `rows` that has a value in `colors`, row by row from the top.
// flipX and flipY mirror the sprite. A character with no value (such as ".") stays clear.
export function eachPixel(rows, colors, put, { flipX = false, flipY = false } = {}) {
  const h = rows.length;
  rows.forEach((row, j) => {
    const w = row.length;
    for (let i = 0; i < w; i++) {
      const value = colors[row[i]];
      if (value === undefined) continue;
      put(flipX ? w - 1 - i : i, flipY ? h - 1 - j : j, value);
    }
  });
}

// A twinkle with its heart at (x, y), in the look of the plant sparkles: a white heart in a gold cross.
// arm is the length of each gold arm in pixels: 0 shows the heart only. The first `core` pixels of each arm are white too.
// With an outline color, a soft dark edge goes along the arms and past their tips, so the twinkle shows on a light wall
// and on the lamp light too.
export function drawTwinkle(g, x, y, arm, { gold, white = "#ffffff", outline = null, core = 0 } = {}) {
  if (outline) {
    g.fillStyle = outline;
    // Each edge pixel once, so a see-through color stays even.
    for (let i = 1; i <= arm; i++) {
      // Beside the arms that go left and right, then beside the arms that go up and down. At i = 1 both are the same four pixels.
      const sides = [[i, -1], [i, 1], [-i, -1], [-i, 1], ...(i > 1 ? [[-1, i], [1, i], [-1, -i], [1, -i]] : [])];
      for (const [dx, dy] of sides) g.fillRect(x + dx, y + dy, 1, 1);
    }
    for (const [dx, dy] of [[arm + 1, 0], [-arm - 1, 0], [0, arm + 1], [0, -arm - 1]]) g.fillRect(x + dx, y + dy, 1, 1);
  }
  if (arm) {
    g.fillStyle = gold;
    g.fillRect(x - arm, y, arm * 2 + 1, 1);
    g.fillRect(x, y - arm, 1, arm * 2 + 1);
  }
  const c = Math.min(core, arm);
  g.fillStyle = white;
  g.fillRect(x - c, y, c * 2 + 1, 1);
  g.fillRect(x, y - c, 1, c * 2 + 1);
}
