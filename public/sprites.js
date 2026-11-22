// Each look is one front-facing image, trimmed to the figure. A sprite stands with its feet on the bottom row.
export const KIND_ORDER = ["adult", "kid", "baby", "dog", "cat"];
export const HOST_IDS = ["jessica", "jesse", "daughter", "son"];

const looks = {};
const hosts = {};

export async function loadSprites() {
  const manifest = await fetch("/art/looks.json").then((r) => r.json());
  await Promise.all([
    ...Object.entries(manifest).map(async ([kind, list]) => {
      looks[kind] = await Promise.all(list.map((look) => loadImage(`/art/looks/${look.id}.png`)));
    }),
    ...HOST_IDS.map(async (id) => (hosts[id] = await loadImage(`/art/hosts/${id}.png`))),
  ]);
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
  return (looks[kind] ?? looks.adult ?? []).length;
}

export function lookImage(kind, look) {
  const list = looks[kind] ?? looks.adult ?? [];
  if (!list.length) return null;
  return list[((look % list.length) + list.length) % list.length];
}

export function hostImage(id) {
  return hosts[id] ?? null;
}

export function drawFigure(ctx, image, x, y, { flip = false } = {}) {
  if (!image) return;
  const left = Math.round(x - image.width / 2);
  const top = Math.round(y - image.height);
  if (!flip) return ctx.drawImage(image, left, top);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(image, -left - image.width, top);
  ctx.restore();
}
