import { HttpError, field, json, limit, readJson } from "./http";
import { parseFamily } from "./family-parser";
import { lookUpAddress, suggestAddresses } from "./places";
import { BUBBLE_MAX, addFamily, partyVersion, readParty, updateMember } from "./party";
import { addContact } from "./sheet";
import { verifyTurnstile } from "./turnstile";

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code }, err.status);
      console.error("unhandled", err instanceof Error ? err.stack : String(err));
      return json({ error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;

  if (key === "GET /api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, bubbleMax: BUBBLE_MAX });
  if (key === "GET /api/party") return party(env, url);
  if (key === "POST /api/places/suggest") return suggest(request, env);
  if (key === "POST /api/places/address") return address(request, env);
  if (key === "POST /api/join") return join(request, env);

  const member = url.pathname.match(/^\/api\/members\/([\w-]{1,64})$/);
  if (member && request.method === "POST") return changeMember(request, env, member[1]);

  throw new HttpError(404, "not_found");
}

async function party(env: Env, url: URL): Promise<Response> {
  const version = await partyVersion(env.DB);
  if (url.searchParams.get("since") === String(version)) return json({ version, unchanged: true });
  return json({ version, families: await readParty(env.DB) });
}

async function suggest(request: Request, env: Env): Promise<Response> {
  await limit(env.PLACES_LIMIT, request);
  const body = await readJson(request);
  const input = field(body, "input", { max: 200 });
  const sessionToken = field(body, "sessionToken", { max: 64 });
  if (input.length < 3) return json({ suggestions: [] });
  return json({ suggestions: await suggestAddresses(env, input, sessionToken) });
}

async function address(request: Request, env: Env): Promise<Response> {
  await limit(env.PLACES_LIMIT, request);
  const body = await readJson(request);
  const placeId = field(body, "placeId", { max: 300 });
  const sessionToken = field(body, "sessionToken", { max: 64 });
  return json({ address: await lookUpAddress(env, placeId, sessionToken) });
}

async function join(request: Request, env: Env): Promise<Response> {
  await limit(env.WRITE_LIMIT, request);
  const body = await readJson(request);
  const contact = {
    name: field(body, "name", { max: 100 }),
    household: field(body, "household", { max: 100 }),
    street: field(body, "street", { max: 200 }),
    unit: field(body, "unit", { max: 50, required: false }),
    city: field(body, "city", { max: 100 }),
    state: field(body, "state", { max: 2 }).toUpperCase(),
    zip: field(body, "zip", { max: 10 }),
  };
  if (!/^[A-Z]{2}$/.test(contact.state)) throw new HttpError(400, "bad_state");
  if (!/^\d{5}(-\d{4})?$/.test(contact.zip)) throw new HttpError(400, "bad_zip");
  const familyText = field(body, "familyText", { max: 500 });

  await verifyTurnstile(env, field(body, "turnstileToken", { max: 4096 }), request.headers.get("CF-Connecting-IP"));
  // Parse first: a parse failure saves nothing, so the guest can retry without a duplicate row.
  const members = await parseFamily(env, contact.name, familyText);
  await addContact(env, contact);
  const family = await addFamily(env.DB, contact.household, familyText, members);

  return json({ ...family, household: contact.household }, 201);
}

async function changeMember(request: Request, env: Env, memberId: string): Promise<Response> {
  await limit(env.WRITE_LIMIT, request);
  const body = await readJson(request);
  const token = field(body, "token", { max: 100 });
  const change: { look?: number; bubble?: string } = {};
  if (body.look !== undefined) {
    if (!Number.isInteger(body.look) || (body.look as number) < 0 || (body.look as number) > 9999) throw new HttpError(400, "bad_look");
    change.look = body.look as number;
  }
  if (body.bubble !== undefined) change.bubble = field(body, "bubble", { max: BUBBLE_MAX, required: false });

  await updateMember(env.DB, memberId, token, change);
  return json({ ok: true });
}
