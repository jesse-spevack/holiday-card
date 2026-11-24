import { readAddress } from "./address";
import { PHOTO, albumList, albumPhoto } from "./album";
import { HttpError, field, json, rateLimit, readJson } from "./http";
import { KINDS, MAX_MEMBERS, parseHousehold, type Kind } from "./household";
import { readEgg, recordInteraction } from "./interactions";
import { isFamilyId, logError, noteFamily } from "./log";
import { findInvite, openInvite, viewInvite } from "./invites";
import { lookUpAddress, suggestAddresses } from "./places";
import { BUBBLE_MAX, addFamily, checkToken, partyVersion, readParty, renameFamily, updateMember, type Member, type NewFamily } from "./party";
import { addContact, confirmContact, readContact, updateContact, type Contact } from "./sheet";

const LOOK_ID = /^[a-z0-9-]{1,40}$/;
const PARTY_CACHE_SECONDS = 60;

const LOG_ROUTE = "POST /api/log";
const LOG_BODY_MAX = 2048;
const WORD = /^[\w:./-]{1,40}$/;
// The paths that a GET can ask for. A 404 on a GET to any other path is a web scanner (/.git/config, /api/.env),
// so it goes to Workers Logs only, not to the D1 table.
const KNOWN_GETS = ["/api/places", "/api/place", "/api/party", "/api/config", "/album/list"];
// The iOS Safari warning "ResizeObserver loop completed with undelivered notifications" is harmless. It stays out of the table.
const HARMLESS_PAGE_ERROR = /ResizeObserver loop/;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      const http = err instanceof HttpError ? err : null;
      const status = http?.status ?? 500;
      const code = http?.code ?? "server_error";
      // A 5xx that is not ours (a bug, a D1 error) logs its message and stack.
      const detail = http ? http.detail : err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      const name = routeName(request);
      // A failed page report and a scanner probe go to Workers Logs only, so they cannot fill the table.
      const store = name !== LOG_ROUTE && !(status === 404 && code === "not_found" && probe(request));
      await logError(env, request, { source: "worker", route: name, code, status, detail }, { store });
      return json({ error: code }, status);
    }
  },
} satisfies ExportedHandler<Env>;

// A GET or HEAD to a path that no route serves.
function probe(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const path = new URL(request.url).pathname;
  return !KNOWN_GETS.includes(path) && !PHOTO.test(path);
}

// The method and path of a request. The path never holds guest data: the search text of /api/places is in the query.
function routeName(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  switch (`${request.method} ${url.pathname}`) {
    // Only the Turnstile check used this. A page from before its removal still asks for it at load, so it gets an empty reply.
    case "GET /api/config":
      return json({});
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
    case "POST /api/interaction":
      return interaction(request, env);
    case "POST /api/invite":
      return invite(request, env);
    case "POST /api/address/read":
      return addressRead(request, env);
    case "POST /api/address/change":
      return addressChange(request, env);
    case "GET /api/party":
      return party(request, env, ctx);
    case LOG_ROUTE:
      return pageLog(request, env);
    default:
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/album/")) {
        return url.pathname === "/album/list" ? albumList(env) : albumPhoto(env, url.pathname);
      }
      throw new HttpError(404, "not_found");
  }
}

async function household(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.HOUSEHOLD_LIMIT, request);
  const text = field(await readJson(request), "text", { max: 400 });
  return json({ members: await parseHousehold(env, text) });
}

async function places(request: Request, env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return json({ suggestions: [] });
  await rateLimit(env.PLACES_LIMIT, request);
  return json({ suggestions: await suggestAddresses(env, q, sessionToken(url)) });
}

async function place(request: Request, env: Env, url: URL): Promise<Response> {
  await rateLimit(env.PLACES_LIMIT, request);
  const id = url.searchParams.get("id") ?? "";
  return json({ address: await lookUpAddress(env, id, sessionToken(url)) });
}

function sessionToken(url: URL): string {
  return (url.searchParams.get("session") ?? "").slice(0, 64);
}

async function submit(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.WRITE_LIMIT, request);
  const body = await readJson(request);
  // The bot trap: a person never fills `extra` (the hidden input in index.html). A bot gets a fake 201, and nothing is written.
  // The error log gets a row, so `pnpm errors` shows it if autofill ever fills the trap for a real guest.
  if (typeof body.extra === "string" && body.extra.trim()) {
    await logError(env, request, { source: "worker", route: "POST /api/submit", code: "submit_trap", status: 201 });
    return json({ id: crypto.randomUUID(), token: crypto.randomUUID() }, 201);
  }
  const envelope = field(body, "envelope", { max: 120 });
  const householdNote = field(body, "household", { max: 400 });
  // The Sheet's name column holds who lives there, and its household column holds the envelope name.
  const contact = { name: householdNote, household: envelope, ...readAddress(body.address) };
  const members = readMembers(body.members);

  const inviteToken = field(body, "invite", { max: 100, required: false });

  const family = { envelope, householdNote, members };
  if (inviteToken) return json(await confirmInvite(env, request, inviteToken, contact, family), 201);

  // The address is the point, so the Sheet goes first, with the family id that D1 gets next. If D1 fails after it,
  // the guest sees an error and a retry adds a second Sheet row. `pnpm sheet:dupes` finds it.
  const id = crypto.randomUUID();
  noteFamily(request, id);
  await addContact(env, id, contact);
  return json(await addFamily(env.DB, { id, ...family }), 201);
}

// A friend confirms an invite. The invited Sheet row changes in place and becomes "confirmed", with no second row.
// The family takes the invite id and the invite token, so the link opens the party as this family in any browser.
async function confirmInvite(env: Env, request: Request, token: string, contact: Contact, family: Omit<NewFamily, "id">) {
  const { id } = await openInvite(env.DB, token);
  noteFamily(request, id);
  await confirmContact(env, id, contact);
  try {
    return await addFamily(env.DB, { id, ...family }, { token });
  } catch (err) {
    // Two browsers confirm at the same time: the second family insert fails on the id. That browser opens the party.
    if ((await findInvite(env.DB, token)).confirmed_at) throw new HttpError(409, "invite_used");
    throw err;
  }
}

// What an invite link shows: the data to confirm, or the family after the friend confirms.
async function invite(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.INVITE_LIMIT, request);
  const body = await readJson(request);
  return json(await viewInvite(env, field(body, "token", { max: 100 })));
}

// The address on file for this browser's family, from the Sheet. Only the family's own token reads it.
// `address` is null when the Sheet has no row with the family id, for example a sign-up from before the ids.
async function addressRead(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.ADDRESS_LIMIT, request);
  const body = await readJson(request);
  const id = field(body, "id", { max: 64 });
  noteFamily(request, id);
  const family = await checkToken(env.DB, id, field(body, "token", { max: 100 }));
  const contact = await readContact(env, id);
  if (!contact) return json({ envelope: family.envelope, address: null });
  const { name: _note, household, ...address } = contact;
  return json({ envelope: household || family.envelope, address });
}

// A new address, and maybe a new envelope name, for this browser's family. The Sheet row changes in place.
// The Sheet goes first. A new envelope name then also changes the name at the party.
async function addressChange(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.ADDRESS_LIMIT, request);
  const body = await readJson(request);
  const id = field(body, "id", { max: 64 });
  const token = field(body, "token", { max: 100 });
  noteFamily(request, id);
  const envelope = field(body, "envelope", { max: 120 });
  const address = readAddress(body.address);
  const family = await checkToken(env.DB, id, token);

  await updateContact(env, id, { name: family.note, household: envelope, ...address });
  await renameFamily(env.DB, id, envelope);
  return json({ ok: true, name: envelope });
}

// The page sends what the household parser returned, so a bad member falls back instead of failing the submit.
function readMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "missing_members");
  return raw.slice(0, MAX_MEMBERS).map((m: unknown) => {
    const { type, look } = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    return {
      type: KINDS.includes(type as Kind) ? (type as Kind) : "adult",
      look: typeof look === "string" && LOOK_ID.test(look) ? look : "",
    };
  });
}

async function sprite(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.SPRITE_LIMIT, request);
  const body = await readJson(request);
  const id = field(body, "id", { max: 64 });
  const token = field(body, "token", { max: 100 });
  noteFamily(request, id);
  const index = body.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= MAX_MEMBERS) throw new HttpError(400, "bad_index");

  const change: { look?: string; bubble?: string } = {};
  if (body.look !== undefined) {
    if (typeof body.look !== "string" || !LOOK_ID.test(body.look)) throw new HttpError(400, "bad_look");
    change.look = body.look;
  }
  if (body.bubble !== undefined) change.bubble = field(body, "bubble", { max: BUBBLE_MAX, required: false });

  await updateMember(env.DB, id, token, index, change);
  return json({ ok: true });
}

// The reply is empty, so it tells the page nothing more than "saved".
async function interaction(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.INTERACTION_LIMIT, request);
  const body = await readJson(request);
  const id = field(body, "id", { max: 64 });
  const token = field(body, "token", { max: 100 });
  noteFamily(request, id);
  const egg = readEgg(body);
  await recordInteraction(env.DB, id, token, egg);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
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

// The page reports a failure that the guest saw (public/js/report.js). Only the fields below are kept, each one short:
// codes, a flag, and the widget state. The body is never stored as it came, so an address cannot slip in.
async function pageLog(request: Request, env: Env): Promise<Response> {
  await rateLimit(env.LOG_LIMIT, request);
  const body = await readJson(request, LOG_BODY_MAX);
  const word = (v: unknown) => (typeof v === "string" && WORD.test(v) ? v : "");
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
  const detail = JSON.stringify({ where: text(body.where, 80), online: body.online === true ? true : body.online === false ? false : undefined });
  const code = text(body.code, 120) || "unknown";
  await logError(env, request, {
    source: "page",
    route: word(body.step) || "unknown",
    code,
    status: typeof body.status === "number" && Number.isInteger(body.status) ? body.status : null,
    detail,
    familyId: isFamilyId(body.family) ? body.family : null,
  }, { store: !HARMLESS_PAGE_ERROR.test(code) });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
