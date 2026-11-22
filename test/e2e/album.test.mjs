// The hidden photo album: tap the book on the sofa, turn a page, close it. On a phone and on a desktop.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, animationsDone } from "./harness.mjs";

const env = await e2e();
const SOUND_FILES = ["book-close", "book-flip-1", "book-flip-2", "book-flip-3", "book-open", "gelt-few", "gelt-pile"].map((n) => `/assets/sounds/${n}.m4a`);

// Counts the album sounds, still plays them, and notes what each one plays: a recording, the swish, or nothing.
const listen = (page) => page.evaluate(() => {
  const { sound } = window.__hc;
  window.__sounds = [];
  const sources = [];
  const make = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () { const s = make.call(this); sources.push(s); return s; };
  const heard = () => {
    const made = sources.splice(0);
    if (!made.length) return "silent";
    const names = made.map((s) => Object.keys(sound.samples ?? {}).find((n) => sound.samples[n] === s.buffer));
    if (names.every((n) => !n)) return "swish";
    const rate = made[0].playbackRate.value;
    if (made.length !== 1 || rate < 0.95 || rate > 1.05) return `odd: ${made.length} sources at rate ${rate}`;
    return names[0].replace(/-\d$/, "");
  };
  for (const name of ["coverOpen", "pageTurn", "coverClose"]) {
    const play = sound[name].bind(sound);
    sound[name] = () => { sources.length = 0; play(); window.__sounds.push(`${name}: ${heard()}`); };
  }
});

// Each variant opens its own page, so they run at the same time.
describe("the photo album", { concurrency: true }, () => {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]]) {
    test(`the album on a ${name}`, async () => {
      const soundCalls = [];
      // The phone cannot load the recorded book sounds, so it plays the swish. The desktop plays the recordings.
      const routes = [["**/assets/sounds/**", (r) => {
        soundCalls.push(new URL(r.request().url()).pathname);
        return name === "phone" ? r.abort() : r.continue();
      }]];
      const { page, albumCalls, hc } = await env.open({ viewport, hasTouch: name === "phone", album: true, routes, wait: "eggs" });
      // the main page never loads the album until a guest opens it
      assert.deepEqual(albumCalls, []);
      // the main page loads no sound files until the first tap
      assert.deepEqual(soundCalls, []);
      await listen(page);
      const sounds = () => page.evaluate(() => window.__sounds);
      if (name === "desktop") {
        // a first key press wakes the sound, and the recordings load before the book opens
        await page.keyboard.press("Shift");
        await page.waitForFunction((n) => window.__hc.samplesLoaded() === n, SOUND_FILES.length);
      }
      const book = await hc.bookCenter();
      if (name === "phone") await page.touchscreen.tap(book.x, book.y);
      else await page.mouse.click(book.x, book.y);
      const dialog = page.getByRole("dialog", { name: "Photo album" });
      await dialog.waitFor();
      const count = page.locator(".album-count");
      await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
      await page.locator("figcaption", { hasText: "A day at the lake" }).waitFor();
      const opened = name === "phone" ? "coverOpen: swish" : "coverOpen: book-open";
      assert.deepEqual(await sounds(), [opened]);
      assert.equal(await page.locator(".pop").count(), 0, "the book never opens the sprite editor");
      assert.equal(await hc.bookHidden(), true);
      // the book is pixel art scaled by a whole number, and the photos stay smooth
      const art = await page.evaluate(() => {
        const side = document.querySelector(".album-side.r");
        const u = parseFloat(getComputedStyle(document.querySelector(".album")).getPropertyValue("--u"));
        const img = document.querySelector(".album-print img");
        return {
          u, w: side.getBoundingClientRect().width, h: side.getBoundingClientRect().height,
          bg: getComputedStyle(side).backgroundImage.slice(0, 26),
          book: getComputedStyle(document.querySelector(".album-book")).imageRendering,
          img: getComputedStyle(img).imageRendering,
        };
      });
      assert.ok(Number.isInteger(art.u) && art.u >= 2, `book pixel ${art.u}`);
      assert.ok(Number.isInteger(art.w / art.u) && Number.isInteger(art.h / art.u), `side ${art.w}x${art.h} at ${art.u}`);
      assert.equal(art.bg, 'url("data:image/png;base64');
      assert.ok(["pixelated", "crisp-edges"].includes(art.book), art.book);
      assert.equal(art.img, "auto");
      if (name === "phone") {
        // only the current page and the next one load
        assert.deepEqual(albumCalls.filter((c) => c.endsWith(".jpg")).sort(), ["/album/0000000000000001.jpg", "/album/0000000000000002.jpg"]);
        await page.touchscreen.tap(viewport.width - 30, viewport.height / 2);
        await count.filter({ hasText: /^2 \/ 3$/ }).waitFor();
        await page.locator(".album-side.r figcaption", { hasText: "Snow in the yard" }).waitFor();
        await page.touchscreen.tap(30, viewport.height / 2);
        await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
        // a tap forward and a tap back each turn a page. The sound files did not load, so each turn plays the swish.
        assert.deepEqual(await sounds(), [opened, "pageTurn: swish", "pageTurn: swish"]);
        await animationsDone(page);
        await page.screenshot({ path: `${OUT}/album-phone.png` });
        await page.getByRole("button", { name: "Close the album" }).click();
      } else {
        await page.locator(".album-title", { hasText: "Our 2026" }).waitFor();
        await page.keyboard.press("ArrowRight");
        await count.filter({ hasText: /^2-3 \/ 3$/ }).waitFor();
        await animationsDone(page);
        await page.screenshot({ path: `${OUT}/album-desktop.png` });
        await page.mouse.click(100, viewport.height / 2);
        await count.filter({ hasText: /^1 \/ 3$/ }).waitFor();
        // an arrow key and a click each turn a page with a recorded page flip
        assert.deepEqual(await sounds(), [opened, "pageTurn: book-flip", "pageTurn: book-flip"]);
        // the swish is a short, gentle sound, and with the sound off it makes no sound at all
        const heard = await page.evaluate(async () => {
          const { swish } = await import("/js/sound.js");
          const ctx = new OfflineAudioContext(1, 48000, 48000);
          swish(ctx, ctx.destination);
          const data = (await ctx.startRendering()).getChannelData(0);
          let peak = 0, last = 0;
          data.forEach((v, i) => { if (Math.abs(v) > peak) peak = Math.abs(v); if (Math.abs(v) > 0.001) last = i; });
          const { sound } = window.__hc;
          let made = 0;
          const real = sound.ctx;
          sound.ctx = { state: "running", currentTime: 0, createBufferSource: () => { made++; throw new Error("no sound when off"); } };
          sound.on = false;
          sound.pageTurn();
          sound.coverOpen();
          sound.coverClose();
          sound.on = true;
          sound.ctx = real;
          return { peak, ms: (last / 48000) * 1000, made };
        });
        assert.ok(heard.peak > 0.02 && heard.peak < 0.15, `swish peak ${heard.peak}`);
        assert.ok(heard.ms > 200 && heard.ms < 500, `swish length ${heard.ms} ms`);
        assert.equal(heard.made, 0);
        await page.keyboard.press("Escape");
      }
      await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => !window.__hc.bookHidden());
      // the book closes with a sound, and with the sound off nothing plays
      const closed = name === "phone" ? "coverClose: swish" : "coverClose: book-close";
      const off = name === "phone" ? [] : ["pageTurn: silent", "coverOpen: silent", "coverClose: silent"];
      const turned = name === "phone" ? "pageTurn: swish" : "pageTurn: book-flip";
      assert.deepEqual(await sounds(), [opened, turned, turned, ...off, closed]);
      // each sound file loads one time
      assert.deepEqual(soundCalls.sort(), SOUND_FILES);
      // the form still works after the album closes
      await page.getByLabel("Name on the envelope").fill("The Garcia Family");
      await page.getByRole("button", { name: "Next" }).click();
      await page.locator("#say").filter({ hasText: "Who lives at your house?" }).waitFor();
    });
  }
});
