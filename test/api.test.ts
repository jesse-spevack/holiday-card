import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER, PLACES, SHEET, TURNSTILE, llmReply, stubOutbound } from "./outbound";

const GUEST = {
  name: "Ana Garcia",
  household: "The Garcias",
  street: "1600 Pennsylvania St",
  unit: "2B",
  city: "Denver",
  state: "co",
  zip: "02139",
  familyText: "Me, Dana, our kids Mia and Leo, and Biscuit the corgi",
  turnstileToken: "token",
};

const MEMBERS = [
  { name: "Ana", kind: "adult" },
  { name: "Dana", kind: "adult" },
  { name: "Mia", kind: "kid" },
  { name: "Leo", kind: "kid" },
  { name: "Biscuit", kind: "dog" },
];

function happyServices() {
  return stubOutbound({
    [TURNSTILE]: () => Response.json({ success: true }),
    [OPENROUTER]: () => llmReply(MEMBERS),
    [SHEET]: () => Response.json({ ok: true }),
  });
}

let ipCounter = 0;

function post(path: string, body: unknown) {
  return SELF.fetch(`https://hi.verynormal.dev${path}`, {
    method: "POST",
    // A fresh IP per call keeps the per-IP rate limits out of these tests.
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  });
}

async function getParty(since?: number) {
  const response = await SELF.fetch(`https://hi.verynormal.dev/api/party${since === undefined ? "" : `?since=${since}`}`);
  return (await response.json()) as any;
}

async function joinFamily() {
  happyServices();
  const response = await post("/api/join", GUEST);
  return (await response.json()) as { familyId: string; token: string; members: { id: string; kind: string }[] };
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM members"), env.DB.prepare("DELETE FROM families")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("join", () => {
  it("saves the contact to the Sheet and the family to the party", async () => {
    const services = happyServices();

    const response = await post("/api/join", GUEST);

    expect(response.status).toBe(201);
    const joined = (await response.json()) as any;
    expect(joined.token).toMatch(/^[\w-]{40,}$/);
    expect(joined.members.map((m: any) => m.kind)).toEqual(["adult", "adult", "kid", "kid", "dog"]);

    const [sheetCall] = services.to(SHEET);
    expect(JSON.parse(sheetCall.body)).toEqual({
      secret: "test-secret",
      name: "Ana Garcia",
      household: "The Garcias",
      street: "1600 Pennsylvania St",
      unit: "2B",
      city: "Denver",
      state: "CO",
      zip: "02139",
    });

    const party = await getParty();
    expect(party.families).toHaveLength(1);
    expect(party.families[0].household).toBe("The Garcias");
    expect(party.families[0].members).toHaveLength(5);
  });

  it("never shows member names or addresses at the party", async () => {
    await joinFamily();

    const text = JSON.stringify(await getParty());

    for (const secret of ["Ana", "Dana", "Mia", "Leo", "Biscuit", "Pennsylvania", "02139", "corgi"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("saves nothing when the family parse fails twice", async () => {
    const services = stubOutbound({
      [TURNSTILE]: () => Response.json({ success: true }),
      [OPENROUTER]: () => new Response("upstream down", { status: 503 }),
      [SHEET]: () => Response.json({ ok: true }),
    });

    const response = await post("/api/join", GUEST);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "family_parse_failed" });
    expect(services.to(OPENROUTER)).toHaveLength(2);
    expect(services.to(SHEET)).toHaveLength(0);
    expect((await getParty()).families).toHaveLength(0);
  });

  it("retries the family parse once", async () => {
    let attempt = 0;
    stubOutbound({
      [TURNSTILE]: () => Response.json({ success: true }),
      [OPENROUTER]: () => (attempt++ === 0 ? new Response("busy", { status: 429 }) : llmReply(MEMBERS)),
      [SHEET]: () => Response.json({ ok: true }),
    });

    const response = await post("/api/join", GUEST);

    expect(response.status).toBe(201);
  });

  it("does not add the family when the Sheet write fails", async () => {
    stubOutbound({
      [TURNSTILE]: () => Response.json({ success: true }),
      [OPENROUTER]: () => llmReply(MEMBERS),
      [SHEET]: () => Response.json({ error: "forbidden" }),
    });

    const response = await post("/api/join", GUEST);

    expect(response.status).toBe(502);
    expect((await getParty()).families).toHaveLength(0);
  });

  it("rejects a failed Turnstile check before it calls the LLM", async () => {
    const services = stubOutbound({ [TURNSTILE]: () => Response.json({ success: false }) });

    const response = await post("/api/join", GUEST);

    expect(response.status).toBe(403);
    expect(services.to(OPENROUTER)).toHaveLength(0);
  });

  it.each([
    [{ zip: "8020" }, "bad_zip"],
    [{ state: "Colorado" }, "too_long_state"],
    [{ household: "  " }, "missing_household"],
    [{ familyText: "x".repeat(501) }, "too_long_familyText"],
  ])("rejects %o with %s and calls no service", async (change, code) => {
    const services = stubOutbound({});

    const response = await post("/api/join", { ...GUEST, ...change });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: code });
    expect(services.calls).toHaveLength(0);
  });
});

describe("party", () => {
  it("answers unchanged when the version did not move", async () => {
    await joinFamily();
    const { version } = await getParty();

    expect(await getParty(version)).toEqual({ version, unchanged: true });
  });

  it("moves the version when a member changes", async () => {
    const joined = await joinFamily();
    const { version } = await getParty();

    await post(`/api/members/${joined.members[0].id}`, { token: joined.token, bubble: "hi" });

    const after = await getParty(version);
    expect(after.version).toBeGreaterThan(version);
    expect(after.families[0].members[0].bubble).toBe("hi");
  });
});

describe("member changes", () => {
  it("lets the family change its own look and bubble", async () => {
    const joined = await joinFamily();
    const memberId = joined.members[2].id;

    const response = await post(`/api/members/${memberId}`, { token: joined.token, look: 7, bubble: "Happy Hanukkah!" });

    expect(response.status).toBe(200);
    const member = (await getParty()).families[0].members[2];
    expect(member).toMatchObject({ id: memberId, look: 7, bubble: "Happy Hanukkah!" });
  });

  it("rejects a wrong token", async () => {
    const joined = await joinFamily();

    const response = await post(`/api/members/${joined.members[0].id}`, { token: "not-the-token", bubble: "hacked" });

    expect(response.status).toBe(403);
    expect((await getParty()).families[0].members[0].bubble).toBe("");
  });

  it("rejects a bubble over 40 characters", async () => {
    const joined = await joinFamily();

    const response = await post(`/api/members/${joined.members[0].id}`, { token: joined.token, bubble: "x".repeat(41) });

    expect(response.status).toBe(400);
  });

  it("hides a bubble that Jesse hid, and shows the next new bubble", async () => {
    const joined = await joinFamily();
    const memberId = joined.members[0].id;
    await post(`/api/members/${memberId}`, { token: joined.token, bubble: "rude words" });

    await env.DB.prepare("UPDATE members SET bubble_hidden = 1 WHERE id = ?").bind(memberId).run();
    expect((await getParty()).families[0].members[0].bubble).toBe("");

    await post(`/api/members/${memberId}`, { token: joined.token, bubble: "sorry!" });
    expect((await getParty()).families[0].members[0].bubble).toBe("sorry!");
  });
});

describe("places", () => {
  it("turns a picked suggestion into address fields", async () => {
    stubOutbound({
      [PLACES]: () =>
        Response.json({
          addressComponents: [
            { longText: "1600", shortText: "1600", types: ["street_number"] },
            { longText: "Pennsylvania Street", shortText: "Pennsylvania St", types: ["route"] },
            { longText: "Unit 4", shortText: "4", types: ["subpremise"] },
            { longText: "Denver", shortText: "Denver", types: ["locality", "political"] },
            { longText: "Colorado", shortText: "CO", types: ["administrative_area_level_1", "political"] },
            { longText: "80203", shortText: "80203", types: ["postal_code"] },
          ],
        }),
    });

    const response = await post("/api/places/address", { placeId: "ChIJabc", sessionToken: "s1" });

    expect(await response.json()).toEqual({
      address: { street: "1600 Pennsylvania Street", unit: "Unit 4", city: "Denver", state: "CO", zip: "80203" },
    });
  });

  it("sends the session token and the US limit to Google", async () => {
    const services = stubOutbound({
      [PLACES]: () =>
        Response.json({
          suggestions: [
            { placePrediction: { placeId: "p1", structuredFormat: { mainText: { text: "1600 Pennsylvania St" }, secondaryText: { text: "Denver, CO, USA" } } } },
          ],
        }),
    });

    const response = await post("/api/places/suggest", { input: "1600 Penn", sessionToken: "s1" });

    expect(await response.json()).toEqual({ suggestions: [{ placeId: "p1", main: "1600 Pennsylvania St", secondary: "Denver, CO, USA" }] });
    const sent = JSON.parse(services.to(PLACES)[0].body);
    expect(sent).toMatchObject({ input: "1600 Penn", sessionToken: "s1", includedRegionCodes: ["us"] });
  });

  it("does not call Google for fewer than 3 characters", async () => {
    const services = stubOutbound({});

    const response = await post("/api/places/suggest", { input: "16", sessionToken: "s1" });

    expect(await response.json()).toEqual({ suggestions: [] });
    expect(services.calls).toHaveLength(0);
  });

  it("rejects a place id that could change the Google URL", async () => {
    const services = stubOutbound({});

    const response = await post("/api/places/address", { placeId: "../../v1/other", sessionToken: "s1" });

    expect(response.status).toBe(400);
    expect(services.calls).toHaveLength(0);
  });
});
