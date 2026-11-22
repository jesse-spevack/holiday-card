import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER, PLACES, SHEET, TURNSTILE, llmReply, stubOutbound } from "./outbound";

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

function request(path: string, init: RequestInit = {}) {
  // A fresh IP per call keeps the per-IP rate limits out of these tests.
  return SELF.fetch(`https://hi.verynormal.dev${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` },
  });
}

const post = (path: string, body: unknown) => request(path, { method: "POST", body: JSON.stringify(body) });

async function getParty() {
  return (await (await request("/api/party")).json()) as any;
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
  await env.DB.batch([env.DB.prepare("DELETE FROM members"), env.DB.prepare("DELETE FROM families")]);
});

afterEach(() => {
  vi.restoreAllMocks();
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

    const { members } = (await (await post("/api/household", { text: "so many dogs" })).json()) as any;

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
    const { id, token } = (await response.json()) as any;
    expect(id).toBeTruthy();
    expect(token).toMatch(/^[\w-]{40,}$/);
    expect(JSON.parse(services.to(SHEET)[0].body)).toEqual({
      secret: "test-secret",
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

describe("party", () => {
  it("leaves out a family that Jesse hid", async () => {
    const { id } = await submitFamily();

    await env.DB.prepare("UPDATE families SET hidden = 1 WHERE id = ?").bind(id).run();

    expect((await getParty()).families).toHaveLength(0);
  });

  it("tells the browser not to cache the party", async () => {
    const response = await request("/api/party");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
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

    const { suggestions } = (await (await request("/api/places?q=1428%20Maple&session=s1")).json()) as any;

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
