// The roof holds still while the page settles. On the first screen the host types the question and the
// Turnstile check mounts under the dialog, so the stage gets shorter. On a return visit the thank-you slides away.
// The roof must not come and go through any of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { e2e, GARCIA } from "./harness.mjs";

const env = await e2e();

// A fake Turnstile mounts after 1.5 s. It shows its check box (65 px), as the real one does in a test browser,
// or it stays out of sight (0 px), as it does for most guests.
const fakeTurnstile = (px) => `window.turnstile = {
  render(sel) { setTimeout(() => { const d = document.createElement("div"); d.style.height = "${px}px"; d.className = "fake-turnstile"; document.querySelector(sel).append(d); }, 1500); return 1; },
  getResponse() { return ""; }, reset() {},
};`;

// Each frame notes whether the gable wall right above the room (room pixel 128, -6) shows on the stage.
function watchRoof() {
  window.__roof = [];
  const tick = () => {
    const n = document.querySelector(".night");
    const st = document.getElementById("stage")?.getBoundingClientRect();
    const wr = document.getElementById("world")?.getBoundingClientRect();
    let on = false;
    if (n && !n.hidden && n.width && wr?.width) {
      const scale = wr.width / 256;
      const y = wr.top - 6 * scale;
      if (y >= st.top && y < st.bottom) {
        const nr = n.getBoundingClientRect();
        const c = n.getContext("2d").getImageData(Math.round((wr.left + 128 * scale - nr.left) / scale), Math.round((y - nr.top) / scale), 1, 1).data;
        on = [[0x34, 0x40, 0x5f], [0x27, 0x30, 0x49], [0x14, 0x1b, 0x32]].some((k) => k.every((v, i) => v === c[i]));
      }
    }
    window.__roof.push(on);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const flips = (log) => log.reduce((n, on, i) => n + (i > 0 && on !== log[i - 1] ? 1 : 0), 0);

// The roof log from the first frame until the page settles, plus time for the camera to ease back out.
// A first visit settles when the Turnstile check has mounted and the host has typed the question.
// A return visit settles when the thank-you has slid away.
async function roofLog({ width, height, returning, box = false }) {
  const phone = width < 900;
  const routes = [
    ["**/api/config", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ turnstileSiteKey: "test-key" }) })],
    ["https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: fakeTurnstile(box ? 65 : 0) })],
  ];
  const { page, ctx } = await env.open({
    viewport: { width, height }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone,
    routes, mine: returning ? [GARCIA] : undefined, init: [watchRoof],
  });
  if (returning) {
    await page.waitForFunction(() => document.getElementById("app").classList.contains("tucked") && getComputedStyle(document.getElementById("dialog")).visibility === "hidden", null, { timeout: 10000 });
  } else {
    await page.waitForFunction(() => document.querySelector(".fake-turnstile") && !document.querySelector("#say span"), null, { timeout: 10000 });
  }
  await page.waitForTimeout(returning ? 2500 : 1000);
  const log = await page.evaluate(() => window.__roof);
  await ctx.close();
  return log;
}

test("the roof holds still while the page settles", async () => {
  // The four visits run at the same time, so the test takes as long as the longest one.
  const [fresh, back, deskFresh, deskBack] = await Promise.all([
    roofLog({ width: 390, height: 844, returning: false, box: true }),
    roofLog({ width: 390, height: 844, returning: true }),
    roofLog({ width: 1440, height: 900, returning: false }),
    roofLog({ width: 1440, height: 900, returning: true }),
  ]);
  // a fresh visit on a tall phone: the roof shows on the first screen and stays
  assert.ok(fresh.includes(true), "the roof shows on the first screen of a tall phone");
  assert.equal(flips(fresh.slice(fresh.indexOf(true))), 0, "the roof stays on the first screen");
  // a return visit on a tall phone: the roof stays through the thank-you, the zoom out, and after.
  // (With the check box showing, the zoom on the family fills the stage and hides the roof, as it should.)
  assert.ok(back.at(-1), "the roof shows after the thank-you hides");
  assert.equal(flips(back.slice(back.indexOf(true))), 0, "the roof stays from the moment it shows");
  // a wide desktop never flashes the roof in and out
  for (const log of [deskFresh, deskBack]) assert.ok(flips(log) <= 1, `the desktop roof flips ${flips(log)} times`);
});
