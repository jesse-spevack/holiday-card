// Pixel art written as text: each string is one row, and each character is one pixel.
// The art modules (extras/road.js, extras/pets.js, extras/album-art.js, extras/dreidel-art.js) draw their small sprites with this.
// The plants (extras/plants.js) use drawTwinkle.

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
// arm is the length of each gold arm in pixels: 0 shows the heart only.
export function drawTwinkle(g, x, y, arm, { gold, white = "#ffffff" } = {}) {
  if (arm) {
    g.fillStyle = gold;
    g.fillRect(x - arm, y, arm * 2 + 1, 1);
    g.fillRect(x, y - arm, 1, arm * 2 + 1);
  }
  g.fillStyle = white;
  g.fillRect(x, y, 1, 1);
}
