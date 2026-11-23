import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyFamily } from "../src/party";
import { OPENROUTER, PLACES, SHEET, TURNSTILE, fakeSheet, llmReply, stubOutbound } from "./outbound";

const SUBMISSION = {
  envelope: "The Garcia Family",
  household: "Sofia, Dan, Mia, and Biscuit the corgi",
  members: [
    { type: "adult", look: "adult-03" },
    { type: "adult", look: "adult-12" },
    { type: "kid", look: "kid-04" },
    { type: "dog", look: "dog-06" },
  ],
  address: { street: "1428 Maple Ave", unit: "Apt 2B", city: "Evanston", state: "IL", zip: "02139", formatted: "1428 Maple Ave, Evanston, IL 60201, USA" },
  turnstileToken: "token",
};

let ipCounter = 0;

// A fresh IP per call keeps the per-IP rate limits out of these tests.
function freshIp() {
  ++ipCounter;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function request(path: string, init: RequestInit = {}, ip = freshIp()) {
  return SELF.fetch(`https://hi.verynormal.dev${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
  });
}

const post = (path: string, body: unknown, ip?: string) => request(path, { method: "POST", body: JSON.stringify(body) }, ip);

async function getParty() {
  return (await (await request("/api/party")).json()) as { families: PartyFamily[] };
}

function savingServices() {
  return stubOutbound({
    [TURNSTILE]: () => Response.json({ success: true }),
    [SHEET]: () => Response.json({ ok: true }),
  });
}

async function submitFamily() {
  savingServices();
  const response = await post("/api/submit", SUBMISSION);
  return (await response.json()) as { id: string; token: string };
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM interactions"), env.DB.prepare("DELETE FROM members"), env.DB.prepare("DELETE FROM families")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routes", () => {
  it("gives the page the Turnstile site key", async () => {
    const response = await request("/api/config");

    expect(await response.json()).toEqual({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
  });

  it.each([
    ["GET", "/api/nope"],
    ["GET", "/api/submit"],
    ["POST", "/api/party"],
    ["POST", "/album/list"],
  ])("returns a JSON 404 for %s %s", async (method, path) => {
    const response = await request(path, { method });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("rejects a body that is not a JSON object", async () => {
    const response = await request("/api/household", { method: "POST", body: "[1, 2]" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_json" });
  });

  it("slows down one IP that sends too many writes", async () => {
    savingServices();

    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await post("/api/submit", SUBMISSION, "10.9.9.9")).status);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  });
});

describe("household", () => {
  it("turns the note into member types", async () => {
    const services = stubOutbound({ [OPENROUTER]: () => llmReply([{ type: "adult" }, { type: "adult" }, { type: "kid" }, { type: "dog" }]) });

    const response = await post("/api/household", { text: "Sofia, Dan, Mia, and Biscuit the corgi" });

    expect(await response.json()).toEqual({ members: [{ type: "adult" }, { type: "adult" }, { type: "kid" }, { type: "dog" }] });
    const sent = JSON.parse(services.to(OPENROUTER)[0].body);
    expect(sent.messages[1].content).toBe("Sofia, Dan, Mia, and Biscuit the corgi");
  });

  it("returns one adult when the model finds no one", async () => {
    stubOutbound({ [OPENROUTER]: () => llmReply([]) });

    const response = await post("/api/household", { text: "hello" });

    expect(await response.json()).toEqual({ members: [{ type: "adult" }] });
  });

  it("keeps at most 12 members", async () => {
    stubOutbound({ [OPENROUTER]: () => llmReply(Array.from({ length: 30 }, () => ({ type: "dog" }))) });

    const { members } = (await (await post("/api/household", { text: "so many dogs" })).json()) as { members: unknown[] };

    expect(members).toHaveLength(12);
  });

  it("retries once, then fails with 502", async () => {
    const services = stubOutbound({ [OPENROUTER]: () => new Response("down", { status: 503 }) });

    const response = await post("/api/household", { text: "me and my cat" });

    expect(response.status).toBe(502);
    expect(services.to(OPENROUTER)).toHaveLength(2);
  });
});

describe("submit", () => {
  it("saves only the contact to the Sheet and the family to the party", async () => {
    const services = savingServices();

    const response = await post("/api/submit", SUBMISSION);

    expect(response.status).toBe(201);
    const { id, token } = (await response.json()) as { id: string; token: string };
    expect(id).toBeTruthy();
    expect(token).toMatch(/^[\w-]{40,}$/);
    expect(JSON.parse(services.to(SHEET)[0].body)).toEqual({
      secret: "test-secret",
      action: "add",
      family_id: id,
      name: "Sofia, Dan, Mia, and Biscuit the corgi",
      household: "The Garcia Family",
      street: "1428 Maple Ave",
      unit: "Apt 2B",
      city: "Evanston",
      state: "IL",
      zip: "02139",
    });

    expect((await getParty()).families).toEqual([
      {
        id,
        name: "The Garcia Family",
        members: SUBMISSION.members,
        bubbles: ["", "", "", ""],
      },
    ]);
  });

  it("accepts an address typed by hand, with no city, state, or ZIP", async () => {
    const services = savingServices();

    const response = await post("/api/submit", {
      ...SUBMISSION,
      address: { street: "Box 12, Rural Route 3, Ely MN", unit: "", city: "", state: "", zip: "", formatted: "Box 12, Rural Route 3, Ely MN" },
    });

    expect(response.status).toBe(201);
    expect(JSON.parse(services.to(SHEET)[0].body)).toMatchObject({ street: "Box 12, Rural Route 3, Ely MN", city: "", state: "", zip: "" });
  });

  it.each([
    [{ street: "55 King St W", unit: "", city: "Toronto", state: "ON", zip: "M5K 1A1" }, "not_us"],
    [{ street: "1428 Maple Ave", unit: "", city: "Evanston", state: "IL", zip: "SW1A 1AA" }, "not_us"],
    [{ street: "10 Downing Street, London SW1A 2AA", unit: "", city: "", state: "", zip: "" }, "no_state"],
    [{ street: "12 Rue de Rivoli, Paris, France", unit: "", city: "", state: "", zip: "" }, "not_us"],
    [{ street: "1428 Maple Ave", unit: "", city: "", state: "", zip: "" }, "no_state"],
  ])("refuses an address outside the US: %o", async (address, code) => {
    const services = stubOutbound({});

    const response = await post("/api/submit", { ...SUBMISSION, address });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: code });
    expect(services.calls).toHaveLength(0);
  });

  it("accepts a typed address with a state code, a state name, or a territory", async () => {
    for (const street of ["1428 Maple Ave, Evanston IL", "1428 maple ave, evanston, il 60201", "9 Main St, Burlington, Vermont", "Calle 5, San Juan, PR 00901"]) {
      savingServices();
      const response = await post("/api/submit", { ...SUBMISSION, address: { street, unit: "", city: "", state: "", zip: "" } });
      expect(response.status, street).toBe(201);
      vi.restoreAllMocks();
    }
  });

  it("never shows addresses or the household note at the party", async () => {
    await submitFamily();

    const text = JSON.stringify(await getParty());

    for (const secret of ["Maple", "Evanston", "02139", "Sofia", "Biscuit", "token"]) expect(text).not.toContain(secret);
  });

  it("does not add the family when the Sheet write fails", async () => {
    stubOutbound({
      [TURNSTILE]: () => Response.json({ success: true }),
      [SHEET]: () => Response.json({ error: "forbidden" }),
    });

    const response = await post("/api/submit", SUBMISSION);

    expect(response.status).toBe(502);
    expect((await getParty()).families).toHaveLength(0);
  });

  it.each([
    ["is unreachable", () => Promise.reject(new TypeError("network down"))],
    ["replies with an HTML error page", () => new Response("<html>Script error</html>", { status: 200 })],
  ])("does not add the family when the Sheet %s", async (_, sheet) => {
    stubOutbound({ [TURNSTILE]: () => Response.json({ success: true }), [SHEET]: sheet });

    const response = await post("/api/submit", SUBMISSION);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "sheet_failed" });
    expect((await getParty()).families).toHaveLength(0);
  });

  it("keeps the Sheet row when the party write fails after it", async () => {
    const services = savingServices();
    await env.DB.exec("CREATE TRIGGER fail_family BEFORE INSERT ON families BEGIN SELECT RAISE(ABORT, 'down'); END;");

    try {
      const response = await post("/api/submit", SUBMISSION);

      expect(response.status).toBe(500);
      expect(services.to(SHEET)).toHaveLength(1);
    } finally {
      await env.DB.exec("DROP TRIGGER fail_family;");
    }
    expect((await getParty()).families).toHaveLength(0);
  });

  it("fails with 502 and writes nothing when Turnstile cannot answer", async () => {
    const services = stubOutbound({ [TURNSTILE]: () => new Response("bad gateway", { status: 502 }) });

    const response = await post("/api/submit", SUBMISSION);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "turnstile_unavailable" });
    expect(services.to(SHEET)).toHaveLength(0);
  });

  it("rejects a failed Turnstile check before it writes anything", async () => {
    const services = stubOutbound({ [TURNSTILE]: () => Response.json({ success: false }) });

    const response = await post("/api/submit", SUBMISSION);

    expect(response.status).toBe(403);
    expect(services.to(SHEET)).toHaveLength(0);
  });

  it("drops a look id that is not a plain id", async () => {
    await submitFamilyWith({ members: [{ type: "adult", look: "../../etc" }, { type: "parrot", look: "cat-01" }] });

    expect((await getParty()).families[0].members).toEqual([
      { type: "adult", look: "" },
      { type: "adult", look: "cat-01" },
    ]);
  });

  it.each([
    [{ envelope: " " }, "missing_envelope"],
    [{ household: "" }, "missing_household"],
    [{ address: { street: "" } }, "missing_street"],
    [{ members: [] }, "missing_members"],
    [{ turnstileToken: "" }, "missing_turnstileToken"],
  ])("rejects %o with %s and calls no service", async (change, code) => {
    const services = stubOutbound({});

    const response = await post("/api/submit", { ...SUBMISSION, ...change });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: code });
    expect(services.calls).toHaveLength(0);
  });
});

async function submitFamilyWith(change: Record<string, unknown>) {
  savingServices();
  return (await (await post("/api/submit", { ...SUBMISSION, ...change })).json()) as { id: string; token: string };
}

describe("sprite", () => {
  it("lets the family change a look and a bubble by index", async () => {
    const { id, token } = await submitFamily();

    expect((await post("/api/sprite", { id, token, index: 2, look: "kid-07" })).status).toBe(200);
    expect((await post("/api/sprite", { id, token, index: 2, bubble: "Happy Hanukkah!" })).status).toBe(200);

    const family = (await getParty()).families[0];
    expect(family.members[2]).toEqual({ type: "kid", look: "kid-07" });
    expect(family.bubbles[2]).toBe("Happy Hanukkah!");
  });

  it("rejects a wrong token", async () => {
    const { id } = await submitFamily();

    const response = await post("/api/sprite", { id, token: "not-the-token", index: 0, bubble: "hacked" });

    expect(response.status).toBe(403);
    expect((await getParty()).families[0].bubbles[0]).toBe("");
  });

  it("rejects the token of another family", async () => {
    const first = await submitFamily();
    const second = await submitFamily();

    const response = await post("/api/sprite", { id: first.id, token: second.token, index: 0, bubble: "hacked" });

    expect(response.status).toBe(403);
    expect((await getParty()).families.map((f) => f.bubbles[0])).toEqual(["", ""]);
  });

  it("returns 404 for a family that is not there", async () => {
    const { token } = await submitFamily();

    const response = await post("/api/sprite", { id: crypto.randomUUID(), token, index: 0, bubble: "hi" });

    expect(response.status).toBe(404);
  });

  it.each([
    [{ index: -1 }, "bad_index"],
    [{ index: 1.5 }, "bad_index"],
    [{ index: "0" }, "bad_index"],
    [{ look: "../adult-01" }, "bad_look"],
    [{ look: 3 }, "bad_look"],
  ])("rejects %o with %s", async (change, code) => {
    const { id, token } = await submitFamily();

    const response = await post("/api/sprite", { id, token, index: 0, ...change });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: code });
  });

  it("rejects an index past the family", async () => {
    const { id, token } = await submitFamily();

    const response = await post("/api/sprite", { id, token, index: 9, bubble: "hi" });

    expect(response.status).toBe(404);
  });

  it("rejects a bubble over 40 characters", async () => {
    const { id, token } = await submitFamily();

    const response = await post("/api/sprite", { id, token, index: 0, bubble: "x".repeat(41) });

    expect(response.status).toBe(400);
  });

  it("hides a bubble that Jesse hid, and shows the next new bubble", async () => {
    const { id, token } = await submitFamily();
    await post("/api/sprite", { id, token, index: 0, bubble: "rude words" });

    await env.DB.prepare("UPDATE members SET bubble_hidden = 1 WHERE family_id = ? AND position = 0").bind(id).run();
    expect((await getParty()).families[0].bubbles[0]).toBe("");

    await post("/api/sprite", { id, token, index: 0, bubble: "sorry!" });
    expect((await getParty()).families[0].bubbles[0]).toBe("sorry!");
  });
});

describe("interaction", () => {
  type Row = { egg: string; count: number; first_at: string; last_at: string };
  const rows = async (id: string) =>
    (await env.DB.prepare("SELECT egg, count, first_at, last_at FROM interactions WHERE family_id = ? ORDER BY egg").bind(id).all<Row>()).results;

  it("counts each interaction for each egg, and replies with no body", async () => {
    const { id, token } = await submitFamily();

    const first = await post("/api/interaction", { id, token, egg: "lamp" });
    await post("/api/interaction", { id, token, egg: "lamp" });
    await post("/api/interaction", { id, token, egg: "toast" });

    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");
    expect((await rows(id)).map(({ egg, count }) => ({ egg, count }))).toEqual([{ egg: "lamp", count: 2 }, { egg: "toast", count: 1 }]);
  });

  it("keeps first_at and moves last_at", async () => {
    const { id, token } = await submitFamily();
    await post("/api/interaction", { id, token, egg: "star" });
    await env.DB.prepare("UPDATE interactions SET first_at = '2026-01-01 00:00:00', last_at = '2026-01-01 00:00:00'").run();

    await post("/api/interaction", { id, token, egg: "star" });

    const [row] = await rows(id);
    expect(row.first_at).toBe("2026-01-01 00:00:00");
    expect(row.last_at > row.first_at).toBe(true);
  });

  it("counts a Cybertruck drive-by", async () => {
    const { id, token } = await submitFamily();

    const response = await post("/api/interaction", { id, token, egg: "cybertruck" });

    expect(response.status).toBe(204);
    expect((await rows(id)).map(({ egg, count }) => ({ egg, count }))).toEqual([{ egg: "cybertruck", count: 1 }]);
  });

  it("does not change the party version, so pages do not fetch the party again", async () => {
    const { id, token } = await submitFamily();
    const version = () => env.DB.prepare("SELECT version FROM party_version").first<number>("version");
    const before = await version();

    await post("/api/interaction", { id, token, egg: "album" });

    expect(await version()).toBe(before);
  });

  it.each([
    [{}, 400, "missing_id"],
    [{ id: "x" }, 400, "missing_token"],
  ])("needs the family id and token: %o", async (body, status, code) => {
    const response = await post("/api/interaction", { ...body, egg: "lamp" });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it("rejects a wrong token and writes nothing", async () => {
    const { id } = await submitFamily();

    const response = await post("/api/interaction", { id, token: "not-the-token", egg: "lamp" });

    expect(response.status).toBe(403);
    expect(await rows(id)).toEqual([]);
  });

  it("rejects the token of another family", async () => {
    const first = await submitFamily();
    const second = await submitFamily();

    const response = await post("/api/interaction", { id: first.id, token: second.token, egg: "lamp" });

    expect(response.status).toBe(403);
    expect(await rows(first.id)).toEqual([]);
  });

  it("returns 404 for a family that is not there", async () => {
    const { token } = await submitFamily();

    const response = await post("/api/interaction", { id: crypto.randomUUID(), token, egg: "lamp" });

    expect(response.status).toBe(404);
  });

  it("counts a tap on the fire", async () => {
    const { id, token } = await submitFamily();

    const response = await post("/api/interaction", { id, token, egg: "fire" });

    expect(response.status).toBe(204);
    expect((await rows(id)).map(({ egg, count }) => ({ egg, count }))).toEqual([{ egg: "fire", count: 1 }]);
  });

  it.each([["nope"], ["LAMP"], [""], [3], [null]])("rejects the egg %o", async (egg) => {
    const { id, token } = await submitFamily();

    const response = await post("/api/interaction", { id, token, egg });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_egg" });
    expect(await rows(id)).toEqual([]);
  });

  it("deletes the interactions with the family", async () => {
    const { id, token } = await submitFamily();
    await post("/api/interaction", { id, token, egg: "dreidel" });

    await env.DB.prepare("DELETE FROM families WHERE id = ?").bind(id).run();

    expect(await rows(id)).toEqual([]);
  });

  it("slows down one IP that sends too many", async () => {
    const { id, token } = await submitFamily();
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await post("/api/interaction", { id, token, egg: "lamp" }, "10.9.9.8")).status);

    expect(statuses.slice(0, 60).every((s) => s === 204)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe("party", () => {
  it("leaves out a family that Jesse hid", async () => {
    const { id } = await submitFamily();

    await env.DB.prepare("UPDATE families SET hidden = 1 WHERE id = ?").bind(id).run();

    expect((await getParty()).families).toHaveLength(0);
  });

  it("shows a change at once, even after the edge cached the party", async () => {
    const { id, token } = await submitFamily();
    expect((await getParty()).families[0].bubbles[0]).toBe("");

    await post("/api/sprite", { id, token, index: 0, bubble: "Happy holidays!" });

    expect((await getParty()).families[0].bubbles[0]).toBe("Happy holidays!");
  });

  it("tells the browser not to cache the party", async () => {
    const response = await request("/api/party");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("address", () => {
  const NEW = { street: "77 Fifth Ave", unit: "", city: "New York", state: "NY", zip: "10003" };

  // A family signs up with the fake Sheet, so its row holds the family id.
  async function signUp(sheet = fakeSheet()) {
    stubOutbound({ [TURNSTILE]: () => Response.json({ success: true }), [SHEET]: sheet.handler });
    const family = (await (await post("/api/submit", SUBMISSION)).json()) as { id: string; token: string };
    vi.restoreAllMocks();
    return { ...family, sheet };
  }

  function sheetOnly(sheet: ReturnType<typeof fakeSheet>) {
    return stubOutbound({ [SHEET]: sheet.handler });
  }

  it("reads the address on file with the family token, and never the household note", async () => {
    const { id, token, sheet } = await signUp();
    sheetOnly(sheet);

    const response = await post("/api/address/read", { id, token });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      envelope: "The Garcia Family",
      address: { street: "1428 Maple Ave", unit: "Apt 2B", city: "Evanston", state: "IL", zip: "02139" },
    });
  });

  it("gives a null address when the Sheet has no row for the family", async () => {
    const { id, token } = await signUp();
    sheetOnly(fakeSheet());

    expect(await (await post("/api/address/read", { id, token })).json()).toEqual({ envelope: "The Garcia Family", address: null });
  });

  it.each([
    ["/api/address/read", {}],
    ["/api/address/change", { envelope: "The Garcia Family", address: NEW }],
  ])("%s rejects a wrong token, the token of another family, and an unknown family, and calls no service", async (path, extra) => {
    const first = await signUp();
    const second = await signUp(first.sheet);
    const services = stubOutbound({});

    expect((await post(path, { id: first.id, token: "not-the-token", ...extra })).status).toBe(403);
    expect((await post(path, { id: first.id, token: second.token, ...extra })).status).toBe(403);
    expect((await post(path, { id: crypto.randomUUID(), token: first.token, ...extra })).status).toBe(404);
    expect((await post(path, { token: first.token, ...extra })).status).toBe(400);
    expect(services.calls).toHaveLength(0);
  });

  it("changes the row in place, keeps who lives there, and renames the family at the party", async () => {
    const { id, token, sheet } = await signUp();
    sheetOnly(sheet);

    const response = await post("/api/address/change", { id, token, envelope: "The Garcia-Lee Family", address: NEW });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, name: "The Garcia-Lee Family" });
    expect(sheet.rows).toEqual([
      { ...NEW, name: SUBMISSION.household, household: "The Garcia-Lee Family", family_id: id, updated_at: "now" },
    ]);
    expect((await getParty()).families.map((f) => f.name)).toEqual(["The Garcia-Lee Family"]);
    const text = JSON.stringify(await getParty());
    for (const secret of ["Fifth", "10003", "Maple", "Sofia"]) expect(text).not.toContain(secret);
  });

  it("adds a row with the family id when the Sheet has none", async () => {
    const { id, token } = await signUp();
    const sheet = fakeSheet();
    sheetOnly(sheet);

    await post("/api/address/change", { id, token, envelope: "The Garcia Family", address: NEW });

    expect(sheet.rows).toEqual([{ ...NEW, name: SUBMISSION.household, household: "The Garcia Family", family_id: id, updated_at: "" }]);
  });

  it("refuses an address outside the US and calls no service", async () => {
    const { id, token } = await signUp();
    const services = stubOutbound({});

    const response = await post("/api/address/change", { id, token, envelope: "The Garcia Family", address: { street: "55 King St W, Toronto ON, Canada" } });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "not_us" });
    expect(services.calls).toHaveLength(0);
  });

  it("keeps the old name at the party when the Sheet fails", async () => {
    const { id, token } = await signUp();
    stubOutbound({ [SHEET]: () => Response.json({ error: "down" }) });

    const response = await post("/api/address/change", { id, token, envelope: "Someone Else", address: NEW });

    expect(response.status).toBe(502);
    expect((await getParty()).families[0].name).toBe("The Garcia Family");
  });

  it("slows down one IP that reads too often", async () => {
    const { id, token, sheet } = await signUp();
    sheetOnly(sheet);

    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await post("/api/address/read", { id, token }, "10.9.9.7")).status);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});

describe("places", () => {
  it("turns a picked suggestion into address fields", async () => {
    stubOutbound({
      [PLACES]: () =>
        Response.json({
          formattedAddress: "1428 Maple Ave, Evanston, IL 60201, USA",
          addressComponents: [
            { longText: "1428", shortText: "1428", types: ["street_number"] },
            { longText: "Maple Avenue", shortText: "Maple Ave", types: ["route"] },
            { longText: "Evanston", shortText: "Evanston", types: ["locality", "political"] },
            { longText: "Illinois", shortText: "IL", types: ["administrative_area_level_1", "political"] },
            { longText: "60201", shortText: "60201", types: ["postal_code"] },
          ],
        }),
    });

    const response = await request("/api/place?id=ChIJabc&session=s1");

    expect(await response.json()).toEqual({
      address: { street: "1428 Maple Ave", city: "Evanston", state: "IL", zip: "60201", formatted: "1428 Maple Ave, Evanston, IL 60201, USA" },
    });
  });

  it("sends the session token and the US limit, and returns at most 5 suggestions", async () => {
    const prediction = (i: number) => ({
      placePrediction: { placeId: `p${i}`, structuredFormat: { mainText: { text: `${i} Maple Ave` }, secondaryText: { text: "Evanston, IL, USA" } } },
    });
    const services = stubOutbound({ [PLACES]: () => Response.json({ suggestions: [1, 2, 3, 4, 5, 6].map(prediction) }) });

    const { suggestions } = (await (await request("/api/places?q=1428%20Maple&session=s1")).json()) as { suggestions: unknown[] };

    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]).toEqual({ id: "p1", main: "1 Maple Ave", secondary: "Evanston, IL, USA" });
    expect(JSON.parse(services.to(PLACES)[0].body)).toMatchObject({ input: "1428 Maple", sessionToken: "s1", includedRegionCodes: ["us"] });
  });

  it("does not call Google for fewer than 3 characters", async () => {
    const services = stubOutbound({});

    const response = await request("/api/places?q=14&session=s1");

    expect(await response.json()).toEqual({ suggestions: [] });
    expect(services.calls).toHaveLength(0);
  });

  it.each([
    ["is over its quota", () => new Response("quota", { status: 429 }), 429],
    ["fails", () => new Response("boom", { status: 500 }), 502],
    ["is unreachable", () => Promise.reject(new TypeError("network down")), 502],
  ])("tells the page when Google %s", async (_, places, status) => {
    stubOutbound({ [PLACES]: places });

    const response = await request("/api/places?q=1428%20Maple&session=s1");

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "places_failed" });
  });

  it("refuses a place outside the US", async () => {
    stubOutbound({
      [PLACES]: () =>
        Response.json({
          formattedAddress: "10 Downing St, London SW1A 2AA, UK",
          addressComponents: [
            { longText: "10", shortText: "10", types: ["street_number"] },
            { longText: "Downing Street", shortText: "Downing St", types: ["route"] },
            { longText: "United Kingdom", shortText: "GB", types: ["country", "political"] },
          ],
        }),
    });

    const response = await request("/api/place?id=ChIJuk&session=s1");

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "not_us" });
  });

  it("rejects a place id that could change the Google URL", async () => {
    const services = stubOutbound({});

    const response = await request("/api/place?id=..%2F..%2Fv1%2Fother&session=s1");

    expect(response.status).toBe(400);
    expect(services.calls).toHaveLength(0);
  });
});

describe("album", () => {
  const PHOTO = "0123456789abcdef.jpg";
  const LIST = { photos: [{ src: `/album/${PHOTO}`, caption: "A long walk", w: 1400, h: 1050 }] };
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);

  beforeEach(async () => {
    await env.ALBUM.put("list", JSON.stringify(LIST));
    await env.ALBUM.put(`photo:${PHOTO}`, JPEG);
  });

  it("serves the page list", async () => {
    const response = await request("/album/list");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await response.json()).toEqual(LIST);
  });

  it("serves a photo with a long cache", async () => {
    const response = await request(`/album/${PHOTO}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it("answers a HEAD request for a photo", async () => {
    const response = await request(`/album/${PHOTO}`, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns 404 for a photo that is not there", async () => {
    const response = await request("/album/ffffffffffffffff.jpg");

    expect(response.status).toBe(404);
  });

  it("reads only photo keys, never other keys", async () => {
    const response = await request("/album/list.jpg");

    expect(response.status).toBe(404);
  });

  it("returns 404 when no album is uploaded", async () => {
    await env.ALBUM.delete("list");

    const response = await request("/album/list");

    expect(response.status).toBe(404);
  });
});
