// The presents: a tap on the presents by the window gives a message from each host kid.
// Eddie says his line in a bubble. When his bubble goes, Audrey says hers.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { e2e, OUT, GARCIA, tapRoom, waitForFamilies, animationsDone, tuckNow, interactions, hearLine } from "./harness.mjs";

const env = await e2e();
const EDDIE = "Happy Hanukkah! I hope your holiday season is filled with happiness.";
const AUDREY = "Happy Hanukkah! The lights will shine bright tonight.";
const HINT = "Psst. Tap the presents!";
// The Lees and their dog, with no bubbles of their own, so each bubble on screen is a kid's.
const PARTY = { families: [{ id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] }] };

const VARIANTS = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
];

describe("the presents", { concurrency: true }, () => {
  for (const { name, viewport, touch } of VARIANTS) {
    test(`a tap on the presents gives a message from Eddie, then Audrey, on ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, hasTouch: touch, isMobile: touch, party: PARTY, wait: "eggs" });
      // The Lees and their dog stand at the front of the room, away from the presents and the kids, so no tap lands on them.
      await waitForFamilies(page, { other1: 2 });
      await hc.stillGuests();
      await hc.place({ familyId: "other1", index: 0 }, 110, 152);
      await hc.place({ familyId: "other1", index: 1 }, 124, 154);
      await hc.stillHosts();
      const { HOTSPOTS, TAP_PX } = await hc.constants();
      const box = (id) => HOTSPOTS.find((h) => h.id === id);
      const center = (id) => ({ x: box(id).x + box(id).w / 2, y: box(id).y + box(id).h / 2 });
      const tap = ({ x, y }) => tapRoom(page, x, y, { touch });
      const kid = (who) => hc.sprite({ host: true, name: who });
      const hear = async (who, times) => {
        const out = [];
        for (let i = 0; i < times; i++) {
          const p = await hc.pointOn({ host: true, name: who });
          await (touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
          out.push((await kid(who)).bubble);
        }
        return out;
      };
      // A bubble shows all of its words, and it stays inside the room's stage.
      const stage = await page.locator("#stage").boundingBox();
      const fits = (s, what) => {
        const b = s.bubbleBox;
        assert.equal(s.bubbleClipped, false, `${what}: the bubble shows the whole line`);
        assert.ok(b.left >= stage.x && b.right <= stage.x + stage.width, `${what}: the bubble ${b.left}..${b.right} is inside the stage`);
        assert.ok(b.top >= stage.y && b.bottom <= stage.y + stage.height, `${what}: the bubble ${b.top}..${b.bottom} is inside the stage`);
      };

      // Eddie hints at the presents. The other hidden things are found, so the hint comes up soon.
      await hc.found("album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly", "toast");
      if (touch) {
        await hearLine(page, "Eddie", HINT);
        await page.waitForFunction(() => window.__hc.sprites({ host: true }).every((s) => !s.bubble));
      }
      // The corners of the last tap on a host go.
      await hc.advance(0.6);

      // The kids stand near the presents, but not in front of them, and Jess and Jesse stand in front of the rug.
      // A desktop test sees the kids at home, at the left edge.
      if (touch) {
        await hc.place({ host: true, name: "Jess" }, 150, 150);
        await hc.place({ host: true, name: "Jesse" }, 168, 152);
        await hc.place({ host: true, name: "Audrey" }, 138, 110);
        await hc.place({ host: true, name: "Eddie" }, 154, 112);
      }

      // the tap: Eddie says his line with his name under him, the kids stop, and three bells ring.
      // The scene clock stops for the checks right after the tap, so the corners of the tap still show.
      await hc.spySounds(["gift", "select"]);
      await hc.pause();
      await tap(center("presents"));
      await hc.advance(1 / 60);
      assert.equal(await hc.pressed(), "presents");
      const start = await hc.presents();
      assert.ok(start.on, "a tap on the presents starts the messages");
      assert.equal(start.speaker, "Eddie");
      assert.deepEqual(start.lines.map((l) => [l.name, l.text]), [["Eddie", EDDIE], ["Audrey", AUDREY]]);
      const eddie = await kid("Eddie");
      assert.equal(eddie.bubble, EDDIE);
      assert.ok(eddie.nameBox, "Eddie's name shows while he talks");
      assert.equal((await kid("Audrey")).bubble, null, "Audrey waits for her turn");
      fits(eddie, "Eddie");
      assert.deepEqual(await hc.sounds(), ["gift"]);
      await hc.play();
      const found = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.found")));
      assert.ok(found.includes("presents"), `the presents count as found: ${found}`);
      await animationsDone(page);
      await page.screenshot({ path: `${OUT}/presents-eddie-${name}.png` });

      // A second tap while the kids talk does nothing.
      await tap(center("presents"));
      assert.equal((await kid("Eddie")).bubble, EDDIE);
      assert.deepEqual(await hc.sounds(), []);

      // Eddie's bubble goes, and then Audrey says her line. The two bubbles never show at the same time.
      // The page checks each frame until Audrey talks. The bubbles go on the wall clock, so the scene clock runs too.
      const both = await page.evaluate(() => new Promise((done) => {
        let both = false;
        const look = () => {
          const [e, a] = ["Eddie", "Audrey"].map((name) => window.__hc.sprite({ host: true, name }).bubble);
          both ||= !!(e && a);
          if (a) done(both);
          else requestAnimationFrame(look);
        };
        look();
      }));
      assert.equal(both, false, "Eddie and Audrey talk one at a time");
      const turn = await hc.presents();
      assert.equal(turn.speaker, "Audrey");
      assert.ok(turn.age >= start.lines[0].seconds, `Eddie's bubble shows its full time: ${turn.age}`);
      const audrey = await kid("Audrey");
      assert.equal(audrey.bubble, AUDREY);
      assert.ok(audrey.nameBox, "Audrey's name shows while she talks");
      fits(audrey, "Audrey");
      // The kids stood still the whole time.
      for (const s of [audrey, await kid("Eddie")]) assert.equal(s.path, null, `${s.name} stands still to talk`);
      await animationsDone(page);
      await page.screenshot({ path: `${OUT}/presents-audrey-${name}.png` });

      // After Audrey's line, the messages end. After a short rest, a tap gives them again.
      await page.waitForFunction(() => !window.__hc.sprites({ host: true }).some((s) => s.bubble));
      await hc.advance((await hc.presents()).readyIn + 0.05);
      assert.equal((await hc.presents()).on, false);
      await tap(center("presents"));
      assert.equal((await kid("Eddie")).bubble, EDDIE);
      assert.deepEqual(await hc.sounds(), ["gift"]);

      if (touch) {
        // The presents take a finger-sized tap on a phone.
        const areas = await hc.hotspotAreas(TAP_PX.touch);
        assert.ok(areas.presents.w >= 44 && areas.presents.h >= 44, `presents: ${JSON.stringify(areas.presents)}`);
        // The things around the presents keep their own taps: the sill above, and the wine on the table.
        await hc.catchHotspots();
        await hc.stillHosts();
        const finds = async (p) => {
          await tap(p);
          return (await hc.hotspotHits()).join(",") || null;
        };
        for (const id of ["dreidel-left", "menorah", "wine", "presents"]) assert.equal(await finds(center(id)), id, `a tap on the center of ${id}`);
        // The sill ends at y 60 and the presents start at y 66. A tap in the gap finds the nearer thing.
        assert.equal(await finds({ x: 188, y: 62 }), "dreidel-left");
        assert.equal(await finds({ x: 188, y: 64.5 }), "presents");
        assert.equal(await finds({ x: 203, y: 61 }), "menorah");
        // The presents are wider than a finger, so they reach only 2 room pixels past their sides. A near miss there still finds them.
        assert.equal(await finds({ x: box("presents").x + box("presents").w + 1.5, y: center("presents").y }), "presents");

        // After the guest finds the presents, Eddie drops the hint.
        await hc.place({ host: true, name: "Eddie" }, 154, 112);
        const after = await hear("Eddie", 8);
        assert.ok(!after.includes(HINT), `no presents hint after the presents: ${after}`);
      }
    });
  }

  test("each tap on the presents tells the Worker, also a tap while the kids talk", async () => {
    const { page, hc, calls } = await env.open({ hasTouch: true, isMobile: true, mine: [GARCIA], wait: "eggs" });
    await tuckNow(page);
    await hc.stillHosts();
    await hc.trackGap(0);
    const c = await hc.spotCenter("presents");
    await tapRoom(page, c.x, c.y);
    await tapRoom(page, c.x, c.y);
    assert.equal((await hc.sprite({ host: true, name: "Eddie" })).bubble, EDDIE);
    const egg = { id: GARCIA.id, token: GARCIA.token, egg: "presents" };
    assert.deepEqual(await interactions(page, calls), [egg, egg]);
  });
});
