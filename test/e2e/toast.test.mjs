// The toast: a tap on the wine on the dining table makes everyone at the party raise a cup, and a host says a toast.
// The grown-ups raise red wine, and the kids and babies raise cocoa.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { e2e, OUT, GARCIA, tuckNow, tapRoom, waitForFamilies, hearLine } from "./harness.mjs";

const env = await e2e();
// Two guest families. The Lees bring a dog, and a dog never holds a cup.
const PARTY = { families: [
  { id: "other1", name: "The Lees", members: [{ type: "adult", look: "t-dad" }, { type: "dog", look: "t-dog" }], bubbles: ["", ""] },
  { id: "other2", name: "The Parks", members: [{ type: "adult", look: "t-mom" }, { type: "adult", look: "t-dad" }, { type: "kid", look: "t-kid" }, { type: "baby", look: "t-baby" }], bubbles: ["", "", "", ""] },
] };
const FAMILIES = { other1: 2, other2: 4, fam12345: 2 };
// Everyone in the room except the Lees' dog: 4 hosts, the Lees' adult, 4 Parks, and 2 Garcias.
const PEOPLE = 11;
// The kids and the baby hold cocoa: Audrey, Eddie, the Parks' kid and baby, and the Garcias' kid. The rest hold wine.
const COCOA = ["Audrey", "Eddie", "other2/2", "other2/3", "fam12345/1"];
const HINTS = ["Somebody should make a toast.", "Those glasses won't raise themselves."];

const VARIANTS = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true, reduce: "no-preference" },
  { name: "phone-still", viewport: { width: 390, height: 844 }, touch: true, reduce: "reduce" },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false, reduce: "no-preference" },
];

// Each variant opens its own page, so they run at the same time.
describe("the toast", { concurrency: true }, () => {
  for (const { name, viewport, touch, reduce } of VARIANTS) {
    test(`a tap on the wine starts a toast, on ${name}`, async () => {
      const { page, hc } = await env.open({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: reduce, party: PARTY, mine: [GARCIA], wait: "eggs" });
      await waitForFamilies(page, FAMILIES);
      await tuckNow(page);
      // Everyone stands in three loose rows, so the screenshots show each cup.
      const spots = [
        [{ familyId: "other1", index: 0 }, 100, 110], [{ familyId: "other1", index: 1 }, 122, 110],
        [{ familyId: "fam12345", index: 0 }, 146, 110], [{ familyId: "fam12345", index: 1 }, 170, 110],
        [{ host: true, name: "Jess" }, 108, 134], [{ host: true, name: "Jesse" }, 132, 134],
        [{ familyId: "other2", index: 0 }, 156, 134], [{ familyId: "other2", index: 1 }, 178, 134],
        [{ host: true, name: "Audrey" }, 104, 160], [{ host: true, name: "Eddie" }, 128, 160], [{ familyId: "other2", index: 2 }, 152, 160],
        [{ familyId: "other2", index: 3 }, 174, 160],
      ];
      await hc.stillGuests();
      await hc.stillHosts();
      for (const [want, x, y] of spots) await hc.place(want, x, y);
      const { HOTSPOTS, TAP_PX } = await hc.constants();
      const wine = HOTSPOTS.find((h) => h.id === "wine");
      const center = { x: wine.x + wine.w / 2, y: wine.y + wine.h / 2 };
      const tapWine = (at = center) => tapRoom(page, at.x, at.y, { touch });
      const lines = await hc.toastLines();

      // A host who has not seen the toast hints at it. The other hidden things are found, so the hint shows up soon.
      await hc.found("album", "lamp", "dreidel", "menorah", "star", "waymo", "pets", "silly", "fire");
      const hear = async (host, times) => {
        const out = [];
        for (let i = 0; i < times; i++) {
          const p = await hc.pointOn({ host: true, name: host });
          await (touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
          out.push((await hc.sprite({ host: true, name: host })).bubble);
        }
        return out;
      };
      if (name === "phone") {
        await hearLine(page, "Jesse", HINTS[0]);
        await hearLine(page, "Jess", HINTS[1]);
        await page.waitForFunction(() => window.__hc.sprites({ host: true }).every((s) => !s.bubble));
      }

      // the tap: everyone except the dog holds a cup, one of the big hosts says a toast line, and the glasses clink.
      // The scene clock stops, so the toast waits for each check, and the test moves the clock by hand.
      await hc.spySounds(["cheers", "select"]);
      await hc.pause();
      await tapWine();
      const start = await hc.toast();
      assert.ok(start.on, "a tap on the wine starts a toast");
      assert.equal(await hc.pressed(), "wine");
      assert.equal(start.people.length, PEOPLE);
      assert.ok(!start.people.some((p) => p.familyId === "other1" && p.index === 1), "the dog holds no cup");
      assert.ok(["Jess", "Jesse"].includes(start.speaker), `the speaker: ${start.speaker}`);
      assert.ok(lines.includes(start.line), `the line: ${start.line}`);
      assert.equal((await hc.sprite({ host: true, name: start.speaker })).bubble, start.line);
      assert.deepEqual(await hc.sounds(), [`cheers:${PEOPLE}`]);
      const found = await page.evaluate(() => JSON.parse(localStorage.getItem("hc.found")));
      assert.ok(found.includes("toast"), `the toast counts as found: ${found}`);

      // A second tap during the toast does nothing: no new toast, no sound, the same line.
      await hc.advance(0.1);
      await tapWine();
      const again = await hc.toast();
      assert.ok(again.on && again.age > start.age, `the toast goes on: ${JSON.stringify({ on: again.on, age: again.age })}`);
      assert.equal(again.line, start.line);
      assert.deepEqual(await hc.sounds(), []);

      // Everyone hops once, except with reduced motion. The hop ends 0.7 seconds into the toast.
      // The page notes the highest hop and the lift at each step of 1/60 second, up to 1.1 seconds into the toast.
      const steps = await page.evaluate(() => {
        const out = [];
        while (window.__hc.toast().age < 1.1) {
          window.__hc.advance(1 / 60);
          const t = window.__hc.toast();
          out.push({ age: t.age, lift: t.lift, hop: Math.max(...t.people.map((p) => p.hop)) });
        }
        return out;
      });
      assert.equal(steps.some((s) => s.hop > 0), reduce === "no-preference", "the hop");
      assert.ok(steps.every((s) => s.hop === 0 || s.age < 0.7), "the hop ends 0.7 seconds into the toast");
      assert.ok(steps.filter((s) => s.age >= 0.12).every((s) => s.lift === 1), "the cups go up");

      // The cups are up. Each cup sits in the hand at its sprite's side, below the shoulders and above the feet.
      const mid = await hc.toast();
      const sprites = await hc.sprites();
      for (const p of mid.people) {
        const s = sprites.find((q) => (p.name ? q.host && q.name === p.name : q.familyId === p.familyId && q.index === p.index));
        const who = p.name ?? `${p.familyId}/${p.index}`;
        const { cup } = p;
        assert.ok(cup, `${who} holds a cup`);
        assert.equal(cup.kind, COCOA.includes(who) ? "cocoa" : "wine", `${who} holds the right cup`);
        const left = Math.round(s.x - s.w / 2);
        const right = left + s.w;
        const top = Math.round(s.y - s.h) - p.hop;
        // The hand is the arm that reaches out the farthest at the waist, so it is at the sprite's side.
        assert.ok(cup.hand >= left - 1 && cup.hand <= right && Math.abs(cup.hand - (s.flip ? left : right)) <= s.w / 2, `${who}: the hand ${cup.hand} is at the side of ${left}..${right}`);
        // The stem of a wine glass goes through the hand. A mug stands right outside the hand.
        const held = cup.kind === "wine" ? cup.hand >= cup.x && cup.hand < cup.x + cup.w : (s.flip ? cup.x + cup.w === cup.hand : cup.x === cup.hand + 1);
        assert.ok(held, `${who}: the ${cup.kind} at ${cup.x}..${cup.x + cup.w} is in the hand at ${cup.hand}`);
        assert.ok(cup.y >= top + s.h * 0.35 && cup.y + cup.h <= top + s.h, `${who}: the cup ${cup.y} is at hand height in ${top}..${top + s.h}`);
        assert.equal(cup.lift, 1);
      }

      if (name !== "phone-still") await page.screenshot({ path: `${OUT}/toast-${name}.png` });
      if (name === "phone") {
        // The room canvas at 6 screen pixels for each room pixel, around grown-ups with wine and kids with cocoa.
        const png = await page.evaluate(({ x, y, w, h, k }) => {
          const out = document.createElement("canvas");
          out.width = w * k;
          out.height = h * k;
          const g = out.getContext("2d");
          g.imageSmoothingEnabled = false;
          g.drawImage(document.getElementById("canvas"), x, y, w, h, 0, 0, w * k, h * k);
          return out.toDataURL("image/png").split(",")[1];
        }, { x: 84, y: 94, w: 112, h: 74, k: 6 });
        await writeFile(`${OUT}/toast-zoom.png`, Buffer.from(png, "base64"));
      }

      // The cups go down and away 2.75 seconds into the toast.
      await hc.advance(2.75 - mid.age - 0.05);
      assert.ok((await hc.toast()).on, "the toast lasts 2.75 seconds");
      await hc.advance(0.1);
      const end = await hc.toast();
      assert.ok(!end.on, "the toast ends after 2.75 seconds");
      assert.ok(end.readyIn > 0, "a short rest after the toast");
      assert.deepEqual(end.people, []);
      // a tap in the rest after the toast does nothing
      await tapWine();
      assert.equal((await hc.toast()).on, false);
      assert.deepEqual(await hc.sounds(), []);
      // after the rest, a new toast starts, with a new line
      await hc.advance(end.readyIn + 0.05);
      await tapWine();
      const next = await hc.toast();
      assert.ok(next.on, "a new toast after the rest");
      assert.notEqual(next.line, start.line);
      assert.deepEqual(await hc.sounds(), [`cheers:${PEOPLE}`]);
      await hc.advance(3);
      assert.equal((await hc.toast()).on, false);
      await hc.play();

      if (touch) {
        // The wine takes a finger-sized tap on a phone.
        const areas = await hc.hotspotAreas(TAP_PX.touch);
        assert.ok(areas.wine.w >= 43 && areas.wine.h >= 43, `wine: ${JSON.stringify(areas.wine)}`);
        // A host by the table still wins a tap on the host.
        await hc.place({ host: true, name: "Jesse" }, 180, 128);
        await hc.advance((await hc.toast()).readyIn + 0.05);
        await hear("Jesse", 1);
        assert.equal((await hc.toast()).on, false, "a tap on a host by the table is not a toast");
      }

      if (name === "phone") {
        // After the toast, the hosts drop the toast hint.
        const after = [...(await hear("Jesse", 8)), ...(await hear("Jess", 8))];
        assert.ok(!after.some((l) => HINTS.includes(l)), `no toast hint after the toast: ${after}`);
      }
    });
  }
});
