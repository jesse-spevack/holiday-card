import { albumList, albumPhoto } from "./album";
import { HttpError, field, json, limit, readJson } from "./http";
import { KINDS, MAX_MEMBERS, parseHousehold, type Kind } from "./family-parser";
import { lookUpAddress, suggestAddresses } from "./places";
import { BUBBLE_MAX, addFamily, partyVersion, readParty, updateMember, type NewMember } from "./party";
import { addContact } from "./sheet";
import { verifyTurnstile } from "./turnstile";

const LOOK_ID = /^[a-z0-9-]{1,40}$/;
const PARTY_CACHE_SECONDS = 60;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status);
      console.error("unhandled", err instanceof Error ? err.stack : String(err));
      return json({ error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  switch (`${request.method} ${url.pathname}`) {
    case "GET /api/config":
      return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
    case "POST /api/household":
      return household(request, env);
    case "GET /api/places":
      return places(request, env, url);
    case "GET /api/place":
      return place(request, env, url);
    case "POST /api/submit":
      return submit(request, env);
    case "POST /api/sprite":
      return sprite(request, env);
    case "GET /api/party":
      return party(request, env, ctx);
    default:
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/album/")) {
        return url.pathname === "/album/list" ? albumList(env) : albumPhoto(env, url.pathname);
      }
      throw new HttpError(404, "not_found");
  }
}

async function household(request: Request, env: Env): Promise<Response> {
  await limit(env.HOUSEHOLD_LIMIT, request);
  const text = field(await readJson(request), "text", { max: 400 });
  return json({ members: await parseHousehold(env, text) });
}

async function places(request: Request, env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return json({ suggestions: [] });
  await limit(env.PLACES_LIMIT, request);
  return json({ suggestions: await suggestAddresses(env, q, (url.searchParams.get("session") ?? "").slice(0, 64)) });
}

async function place(request: Request, env: Env, url: URL): Promise<Response> {
  await limit(env.PLACES_LIMIT, request);
  const id = url.searchParams.get("id") ?? "";
  return json({ address: await lookUpAddress(env, id, (url.searchParams.get("session") ?? "").slice(0, 64)) });
}

async function submit(request: Request, env: Env): Promise<Response> {
  await limit(env.WRITE_LIMIT, request);
  const body = await readJson(request);
  const envelope = field(body, "envelope", { max: 120 });
  const householdText = field(body, "household", { max: 400 });
  const address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>;
  const contact = {
    // The Sheet's name column holds who lives there, and its household column holds the envelope name.
    name: householdText,
    household: envelope,
    street: field(address, "street", { max: 300 }),
    unit: field(address, "unit", { max: 50, required: false }),
    city: field(address, "city", { max: 100, required: false }),
    state: field(address, "state", { max: 40, required: false }),
    zip: field(address, "zip", { max: 20, required: false }),
  };
  const members = readMembers(body.members);

  await verifyTurnstile(env, field(body, "turnstileToken", { max: 4096 }), request.headers.get("CF-Connecting-IP"));
  await addContact(env, contact);
  return json(await addFamily(env.DB, envelope, householdText, members), 201);
}

function readMembers(raw: unknown): NewMember[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "missing_members");
  return raw.slice(0, MAX_MEMBERS).map((m) => {
    const type = KINDS.includes(m?.type) ? (m.type as Kind) : "adult";
    const look = typeof m?.look === "string" && LOOK_ID.test(m.look) ? m.look : "";
    return { type, look };
  });
}

async function sprite(request: Request, env: Env): Promise<Response> {
  await limit(env.SPRITE_LIMIT, request);
  const body = await readJson(request);
  const id = field(body, "id", { max: 64 });
  const token = field(body, "token", { max: 100 });
  const index = body.index;
  if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= MAX_MEMBERS) throw new HttpError(400, "bad_index");

  const change: { look?: string; bubble?: string } = {};
  if (body.look !== undefined) {
    if (typeof body.look !== "string" || !LOOK_ID.test(body.look)) throw new HttpError(400, "bad_look");
    change.look = body.look;
  }
  if (body.bubble !== undefined) change.bubble = field(body, "bubble", { max: BUBBLE_MAX, required: false });

  await updateMember(env.DB, id, token, index as number, change);
  return json({ ok: true });
}

// Each change moves the party version, so the cache key changes with it and a cached party is never stale.
async function party(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const version = await partyVersion(env.DB);
  const key = new Request(new URL(`/api/party?v=${version}`, request.url).toString());
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return partyResponse(await hit.text());

  const body = JSON.stringify({ families: await readParty(env.DB) });
  const cached = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${PARTY_CACHE_SECONDS}` } });
  ctx.waitUntil(cache.put(key, cached));
  return partyResponse(body);
}

// The edge keeps a copy, but the browser must not, because the page polls for new families.
function partyResponse(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
