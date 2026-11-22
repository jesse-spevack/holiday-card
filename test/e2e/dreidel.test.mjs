// The hidden dreidel game: a dreidel on the sill grows into a game, spins, falls on a side, and closes.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, animationsDone, waitForFamilies } from "./harness.mjs";

const env = await e2e();

// Each variant opens its own page, so they run at the same time.
describe("the dreidel game", { concurrency: true }, () => {
  for (const [name, viewport, reduce] of [
    ["phone", { width: 390, height: 844 }, "no-preference"],
    ["desktop", { width: 1440, height: 900 }, "no-preference"],
    ["phone-reduced", { width: 390, height: 844 }, "reduce"],
  ]) {
    test(`the dreidel game on a ${name}`, async () => {
      const touch = name.startsWith("phone");
      const { page, hc } = await env.open({ viewport, hasTouch: touch, reducedMotion: reduce, album: true, wait: "eggs" });
      await waitForFamilies(page, { other1: 2 });
      await hc.spyDreidelSounds(["whirr", "tick", "clack", "lift", "result"]);
      const at = (p) => (touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
      const { DREIDELS, HOTSPOTS } = await hc.constants();
      const game = page.getByRole("dialog", { name: "Dreidel game" });
      const state = () => game.getAttribute("data-state");

      // the main page never loads the game's styles until a guest opens it
      assert.equal(await page.locator('link[href="/dreidel.css"]').count(), 0);
      await at(await hc.roomCenter(DREIDELS["dreidel-left"]));
      await game.waitFor();
      assert.equal(await state(), "idle");
      await page.locator(".dreidel-name", { hasText: "Tap to spin" }).waitFor();
      assert.equal(await page.locator(".pop").count(), 0, "a dreidel never opens the sprite editor");
      assert.equal(await page.locator(".wish").count(), 0, "a dreidel never sends a star");
      assert.equal((await hc.eggs()).lighting, false, "a dreidel never lights the menorah");
      assert.equal(await page.evaluate(() => document.getElementById("app").hasAttribute("inert")), true);
      await animationsDone(page);
      await page.waitForFunction(() => window.__hc.dreidelReady());
      if (name !== "phone-reduced") await page.screenshot({ path: `${OUT}/dreidel-${name}-open.png` });

      // each side: the letter's name, its meaning, and the gelt
      const spinTo = async (face) => {
        await hc.rigDreidel({ face, speed: 6 });
        const spins = await hc.dreidelSpins();
        if (touch) await page.locator(".dreidel-card").tap();
        else await page.keyboard.press("Space");
        await page.waitForFunction((n) => window.__hc.dreidelSpins() === n + 1 && document.querySelector(".dreidel").dataset.state === "result", spins);
        return game.getAttribute("data-face");
      };
      // [side, name, meaning, pot, you, the change shown next to the pot and the guest, the refill line]
      const expected = [
        ["gimel", "Gimel", "Take it all!", 0, 12, ["-4", "+4"], ""],
        ["shin", "Shin", "Put one in", 3, 11, ["+1", "-1"], "The pot refills with two gelt."],
        ["hei", "Hei", "Take half", 1, 13, ["-2", "+2"], ""],
        // Nun changes nothing, so both counts stay the same and show no change
        ["nun", "Nun", "Nothing happens", 1, 13, ["", ""], ""],
        ["nun", "Nun", "Nothing happens", 1, 13, ["", ""], ""],
      ];
      for (const [face, title, says, pot, you, change, note] of expected) {
        assert.equal(await spinTo(face), face);
        assert.equal(await page.locator(".dreidel-name").textContent(), title);
        assert.equal(await page.locator(".dreidel-says").textContent(), says);
        assert.equal(await page.locator(".dreidel-pot").textContent(), `Pot: ${pot}`);
        assert.equal(await page.locator(".dreidel-you").textContent(), `You: ${you}`);
        assert.deepEqual(await page.locator(".dreidel-change").allTextContents(), change, `${face} change`);
        assert.equal(await page.locator(".dreidel-note").textContent(), note);
        const heard = await hc.sounds();
        assert.ok(heard.includes("clack") && heard.at(-1) === `result:${face}`, `${face}: ${heard}`);
        if (reduce === "reduce") assert.ok(!heard.includes("whirr") && !heard.includes("tick"), `reduced: ${heard}`);
        else assert.ok(heard.includes("whirr") && heard.includes("tick"), `${face}: ${heard}`);
      }
      if (name !== "phone-reduced") await page.screenshot({ path: `${OUT}/dreidel-${name}-result.png` });
      // with no rig, the dreidel lands on one of the four sides
      await hc.rigDreidel({ speed: 6 });
      const spins = await hc.dreidelSpins();
      if (touch) await page.locator(".dreidel-card").tap();
      else await page.keyboard.press("Space");
      await page.waitForFunction((n) => window.__hc.dreidelSpins() === n + 1 && document.querySelector(".dreidel").dataset.state === "result", spins);
      assert.ok(["nun", "gimel", "hei", "shin"].includes(await game.getAttribute("data-face")));

      // close: a tap outside the play area, Escape, or the close button
      if (name === "phone") await at({ x: 20, y: viewport.height - 20 });
      else if (name === "desktop") await page.keyboard.press("Escape");
      else await page.getByRole("button", { name: "Close the dreidel game" }).click();
      await game.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.getElementById("app").hasAttribute("inert")), false);

      // the other dreidel opens the game too, and it shows the last result
      await at(await hc.roomCenter(DREIDELS["dreidel-right"]));
      await game.waitFor();
      assert.equal(await state(), "result");
      await page.keyboard.press("Escape");
      await game.waitFor({ state: "hidden" });

      // the menorah, the album book, and a guest sprite still work
      await at(await hc.roomCenter(HOTSPOTS.find((h) => h.id === "menorah")));
      assert.equal((await hc.eggs()).lighting, true);
      assert.equal(await game.isVisible(), false, "the menorah never opens the dreidel game");
      await at(await hc.bookCenter());
      const album = page.getByRole("dialog", { name: "Photo album" });
      await album.waitFor();
      await page.keyboard.press("Escape");
      await album.waitFor({ state: "hidden" });
      await hc.stillHosts();
      await at(await hc.pointOn({ familyId: "other1", index: 0 }));
      await page.locator(".tag", { hasText: "The Lees" }).waitFor();
    });
  }
});
