// Each sheet is 4 frames of 48x48: south, west, east, north. `feet` is the row where the sprite stands.
const SHEETS = {
  mom: { src: "/art/mom.png", feet: 40 },
  dad: { src: "/art/dad.png", feet: 40 },
  kid: { src: "/art/kid.png", feet: 40 },
  dog: { src: "/art/dog.png", feet: 35 },
};

const LOOKS = {
  adult: ["mom", "dad"],
  kid: ["kid"],
  baby: ["kid"],
  dog: ["dog"],
  cat: ["dog"],
};

export const FRAME = 48;
export const DIRECTION = { south: 0, west: 1, east: 2, north: 3 };

const images = {};

export function loadSprites() {
  return Promise.all(
    Object.entries(SHEETS).map(([name, { src }]) => loadImage(src).then((img) => (images[name] = img))),
  );
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

export function lookCount(kind) {
  return (LOOKS[kind] ?? LOOKS.adult).length;
}

export function spriteFor(kind, look) {
  const names = LOOKS[kind] ?? LOOKS.adult;
  const name = names[((look % names.length) + names.length) % names.length];
  return { image: images[name], feet: SHEETS[name].feet };
}

export function drawSprite(ctx, kind, look, direction, x, y) {
  const { image, feet } = spriteFor(kind, look);
  if (!image) return;
  ctx.drawImage(image, direction * FRAME, 0, FRAME, FRAME, Math.round(x - FRAME / 2), Math.round(y - feet), FRAME, FRAME);
}
