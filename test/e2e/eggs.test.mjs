// The hidden room extras: the window, the menorah, the floor lamp, and the passing Waymo.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, tapRoom, advanceUntil, waitForFamilies } from "./harness.mjs";

const env = await e2e();

// Each variant opens its own page, so they run at the same time.
describe("the hidden extras", { concurrency: true }, () => {
  for (const reduce of ["no-preference", "reduce"]) {
    test(`the hidden extras, with reduced motion ${reduce}`, async () => {
      const { page, hc } = await env.open({ hasTouch: true, reducedMotion: reduce, wait: "eggs" });
      // A day outside Hanukkah, when every candle burns. menorah.test.mjs checks the nights of Hanukkah.
      await hc.setNow("2026-11-22T18:00");
      await waitForFamilies(page, { other1: 2 });
      await hc.spySounds(["sparkle", "chime", "snuff", "click"]);
      const tap = async (id) => {
        const c = await hc.spotCenter(id);
        await tapRoom(page, c.x, c.y);
      };

      // a tap on the wall does nothing
      await tapRoom(page, 100, 20);
      assert.equal(await page.locator(".wish").count(), 0);
      assert.deepEqual(await hc.sounds(), []);

      // The box of the words on screen, in room pixels, and whether they fade.
      const words = () => page.evaluate(() => {
        const els = [...document.querySelectorAll(".wish")];
        const r = els[0]?.getBoundingClientRect();
        const tl = r && window.__hc.toScreen(0, 0);
        const k = window.__hc.scale();
        const room = (px, py) => [(px - tl.x) / k, (py - tl.y) / k];
        return {
          count: els.length,
          text: els[0]?.textContent,
          box: r && [...room(r.left, r.top), ...room(r.right, r.bottom)],
          screen: r && [r.left, r.right],
          fade: els[0] && getComputedStyle(els[0]).animationName !== "none",
        };
      });

      // the window: a shooting star and "Make a wish" for about 2 seconds, high on the glass and clear of the menorah
      await tap("window");
      await page.locator(".wish", { hasText: "Make a wish" }).waitFor();
      assert.ok((await hc.eggs()).star);
      assert.deepEqual(await hc.sounds(), ["sparkle"]);
      const wish = await words();
      const [left, top, right, bottom] = wish.box;
      assert.ok(left >= 163 && right <= 238 && top >= 8 && bottom <= 30, `the wish sits on the glass: ${wish.box}`);
      assert.equal(wish.fade, reduce === "no-preference");
      await page.locator(".wish").waitFor({ state: "detached" });

      // the menorah: the flames go out, then light one by one with a rising chime each.
      // The scene clock stops, and the test moves it by hand.
      const total = (await hc.eggs()).flames;
      assert.ok(total >= 7, `flames: ${total}`);
      await hc.pause();
      await tap("menorah");
      assert.ok((await hc.eggs()).menorahLit < 2);
      await advanceUntil(page, (hc, n) => { const lit = hc.eggs().menorahLit; return lit > 1 && lit < n; }, total);
      if (reduce === "no-preference") await page.screenshot({ path: `${OUT}/egg-menorah.png` });
      await advanceUntil(page, (hc) => !hc.eggs().lighting);
      assert.deepEqual(await hc.sounds(), ["snuff", ...Array.from({ length: total }, (_, i) => `chime:${i}`)]);
      assert.equal((await hc.eggs()).star, false, "the menorah never sends a star");

      // after the last candle, the menorah asks about miracles under the sill, inside the screen, for about 3.5 seconds
      await page.locator(".wish", { hasText: "What miracles are you grateful for?" }).waitFor();
      const miracles = await words();
      assert.equal(miracles.count, 1);
      assert.ok(miracles.box[1] >= 49, `the question sits under the menorah: ${miracles.box}`);
      assert.ok(miracles.screen[0] >= 12 && miracles.screen[1] <= 378, `the question keeps clear of the screen edges: ${miracles.screen}`);
      assert.equal(miracles.fade, reduce === "no-preference");
      if (reduce === "no-preference") {
        // For the screenshot, the fade holds at 1 second, where the words show in full.
        await page.evaluate(() => { const fade = document.querySelector(".wish").getAnimations()[0]; fade.pause(); fade.currentTime = 1000; });
        await page.screenshot({ path: `${OUT}/egg-miracles.png` });
        await page.evaluate(() => document.querySelector(".wish").getAnimations()[0].play());
      }

      // a tap on the window now replaces the question with the wish, so the two never overlap
      await tap("window");
      await page.locator(".wish", { hasText: "Make a wish" }).waitFor();
      assert.equal((await words()).count, 1);
      assert.deepEqual(await hc.sounds(), ["sparkle"]);
      await page.locator(".wish").waitFor({ state: "detached" });

      // The question goes away on its own. The page moves the clock to the end of the lighting and times the question on the wall clock.
      await tap("menorah");
      const shown = await page.evaluate(() => new Promise((done) => {
        while (window.__hc.eggs().lighting) window.__hc.advance(1 / 30);
        const t0 = performance.now();
        const el = document.querySelector(".wish");
        if (!el?.textContent.startsWith("What miracles")) return done(`no question: ${el?.textContent}`);
        new MutationObserver((_, watch) => {
          if (el.isConnected) return;
          watch.disconnect();
          done(performance.now() - t0);
        }).observe(el.parentNode, { childList: true });
      }));
      assert.ok(shown > 3400 && shown < 6000, `the question shows for about 3.5 seconds: ${shown} ms`);
      await hc.sounds();

      // the floor lamp: off, then on again, with a click each time
      await tap("lamp");
      assert.equal((await hc.eggs()).lampOn, false);
      if (reduce === "no-preference") await page.screenshot({ path: `${OUT}/egg-lamp.png` });
      await tap("lamp");
      assert.equal((await hc.eggs()).lampOn, true);
      assert.deepEqual(await hc.sounds(), ["click", "click"]);

      // the Waymo: it drives past the window, or with reduced motion it waits there, then goes
      assert.equal((await hc.eggs()).car, null);
      await hc.sendWaymo();
      const x0 = (await hc.eggs()).car;
      await hc.advance(0.5);
      const x1 = (await hc.eggs()).car;
      if (reduce === "reduce") assert.equal(x1, x0);
      else assert.ok(Math.abs(x1 - x0) > 3, `the car moves: ${x0} to ${x1}`);
      await advanceUntil(page, (hc) => hc.eggs().car === null);
      assert.ok((await hc.eggs()).nextCarIn >= 39);
      await hc.play();

      // a guest sprite still wins over the room behind it
      await hc.stillHosts();
      const lee = await hc.pointOn({ familyId: "other1", index: 0 });
      await page.touchscreen.tap(lee.x, lee.y);
      await page.locator(".tag", { hasText: "The Lees" }).waitFor();
    });
  }
});
