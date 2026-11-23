// The link preview image, public/assets/og.png: the room as the page draws it, with the four hosts,
// every plant in bloom, and the Cybertruck parked in the window. No guests, no bubbles, and no page UI.
//
// Usage (from the repo root): pnpm og
//
// The script opens the page in Google Chrome against the fake API of the end-to-end tests (test/e2e/harness.mjs),
// sets up the scene through the test API (window.__hc), and reads the room canvas at its native 1x pixels.
// It crops CROP from the room and scales it 5x with nearest neighbor, so each room pixel is a crisp 5x5 block.
// Then it writes og.png and puts a hash of the image in the og:image address in public/index.html.
// Link previews keep an image by its address, so a new image needs a new address.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { serve, launch, openPage, tapRoom } from "../../test/e2e/harness.mjs";

const PNG = new URL("../../public/assets/og.png", import.meta.url).pathname;
const HTML = new URL("../../public/index.html", import.meta.url).pathname;
// 240 x 126 room pixels at 5x is exactly 1200 x 630. The crop starts high enough to show the window and the shelf plants.
const CROP = { x: 8, y: 4, w: 240, h: 126 };
const SCALE = 5;
// A local time on the eighth night of Hanukkah 2026 (public/js/extras/hanukkah.js).
const NIGHT_EIGHT = "2026-12-11T18:00";
// The hosts in a group on the rug, in the middle of the crop: Jess and Jesse behind, Audrey and Eddie in front.
// Each spot is the feet of the sprite, in room pixels.
const HOSTS = { Jess: [121, 115], Jesse: [139, 115], Audrey: [105, 125], Eddie: [156, 125] };

const { server, base } = await serve();
const browser = await launch();
const errors = [];
try {
  // With reduced motion, nobody bobs, the flowers open at once, and the Cybertruck parks in the window.
  const { page, hc } = await openPage(browser, base, errors, {
    party: { families: [] }, reducedMotion: "reduce", viewport: { width: 1440, height: 900 }, wait: "eggs",
  });

  // A tap on each plant makes it bloom.
  const { PLANTS } = await hc.constants();
  await hc.stillHosts();
  for (const id of Object.keys(PLANTS)) {
    const c = await hc.spotCenter(id);
    await tapRoom(page, c.x, c.y, { touch: false });
  }
  const { bloomed } = await hc.plants();
  if (bloomed.length !== Object.keys(PLANTS).length) throw new Error(`not every plant blooms: ${bloomed}`);

  for (const [name, [x, y]] of Object.entries(HOSTS)) await hc.place({ host: true, name }, x, y);
  // The eighth night of Hanukkah, so the image does not depend on the day of the run: all eight candles and the shamash burn.
  await hc.setNow(NIGHT_EIGHT);

  // The room blooms when the last plant opens. Wait until its petals and sparkles are gone, and the tap corners too.
  await page.waitForFunction(() => {
    const s = window.__hc.plants();
    return s.momentDone && !s.moment && !s.twinkles && window.__hc.pressed() === null;
  }, null, { timeout: 15000 });

  // The Cybertruck faces left and parks with its nose in the right pane, clear of the menorah candles.
  await hc.sendCybertruck(-1);
  await page.waitForFunction(() => window.__hc.eggs().truck !== null);
  const t0 = await hc.time();
  await page.waitForFunction((t) => window.__hc.time() > t + 0.2, t0);
  const { candles, truck } = await hc.eggs();
  const out = candles.filter((c) => c.state !== "lit");
  if (out.length) throw new Error(`not every candle burns: ${JSON.stringify(out)}`);
  // No part of the truck may show between the candles or next to their glow.
  const { TRUCK } = await hc.constants();
  const xs = candles.map((c) => c.x);
  const [x0, x1] = [truck, truck + TRUCK.w - 1];
  if (!(x1 < Math.min(...xs) - 1 || x0 > Math.max(...xs) + 1)) throw new Error(`the Cybertruck (x ${x0} to ${x1}) runs behind the candles (${xs})`);

  // The crop of the room canvas, scaled up in the page. The page checks that each room pixel became one solid 5x5 block.
  const url = await page.evaluate(({ crop, k }) => {
    const room = document.getElementById("canvas");
    const src = room.getContext("2d").getImageData(crop.x, crop.y, crop.w, crop.h).data;
    const out = document.createElement("canvas");
    out.width = crop.w * k;
    out.height = crop.h * k;
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(room, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    const big = g.getImageData(0, 0, out.width, out.height).data;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const i = (y * out.width + x) * 4;
        const j = (Math.floor(y / k) * crop.w + Math.floor(x / k)) * 4;
        for (let c = 0; c < 4; c++) {
          if (big[i + c] !== src[j + c]) throw new Error(`the pixel at ${x}, ${y} is not its room pixel`);
        }
        if (big[i + 3] !== 255) throw new Error(`the pixel at ${x}, ${y} is not opaque`);
      }
    }
    return out.toDataURL("image/png");
  }, { crop: CROP, k: SCALE });
  if (errors.length) throw new Error(`the page threw an error: ${errors}`);

  const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  await writeFile(PNG, png);
  const hash = createHash("sha256").update(png).digest("hex").slice(0, 10);
  const html = await readFile(HTML, "utf8");
  const tag = /(<meta property="og:image" content="https:\/\/hi\.verynormal\.dev\/assets\/og\.png)(\?v=[0-9a-f]+)?(">)/;
  if (!tag.test(html)) throw new Error("public/index.html has no og:image tag for /assets/og.png");
  await writeFile(HTML, html.replace(tag, `$1?v=${hash}$3`));
  console.log(`wrote public/assets/og.png (${png.length} bytes) and og:image ?v=${hash}`);
} finally {
  await browser.close();
  server.close();
}
