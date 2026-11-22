// Pixel art written as text: each string is one row, and each character is one pixel.
// The art modules (extras/road.js, extras/pets.js, extras/album-art.js, extras/dreidel-art.js) draw their small sprites with this.

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
