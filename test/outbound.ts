import { vi } from "vitest";

type Handler = (request: Request) => Response | Promise<Response>;

// Stubs the external services by host. A call to a host with no handler fails the test.
export function stubOutbound(handlers: Record<string, Handler>) {
  const calls: { host: string; url: string; body: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const host = new URL(request.url).host;
    // Read the body here: the worker's I/O objects cannot cross into the test context.
    calls.push({ host, url: request.url, body: await bodyText(request.clone()) });
    const handler = handlers[host];
    if (!handler) throw new Error(`unexpected outbound call to ${host}`);
    return handler(request);
  });
  return {
    calls,
    to: (host: string) => calls.filter((c) => c.host === host),
  };
}

// A form body (Turnstile) reads as URL-encoded text, because .text() on multipart data warns.
async function bodyText(request: Request): Promise<string> {
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) return request.text();
  const form = await request.formData();
  return new URLSearchParams([...form].map(([k, v]) => [k, String(v)])).toString();
}

export const OPENROUTER = "openrouter.ai";
export const SHEET = "script.google.com";
export const TURNSTILE = "challenges.cloudflare.com";
export const PLACES = "places.googleapis.com";

export function llmReply(members: unknown[]): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ members }) } }] });
}

// A fake of the Apps Script on the contact Sheet (apps-script/Code.js), with its rows in memory.
// It checks the secret, and it adds, reads, and updates rows by family_id as the real script does.
export type SheetRow = Record<string, string>;
export function fakeSheet(rows: SheetRow[] = []) {
  const FIELDS = ["name", "household", "street", "unit", "city", "state", "zip"];
  const pick = (body: Record<string, unknown>) => Object.fromEntries(FIELDS.map((f) => [f, String(body[f] ?? "")]));
  const newest = (id: string) => rows.findLast((r) => r.family_id === id);
  const handler = async (request: Request) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.secret !== "test-secret") return Response.json({ error: "forbidden" });
    const action = (body.action as string) || "add";
    const id = String(body.family_id ?? "");
    if (action === "read") return Response.json({ ok: true, contact: newest(id) ? pick(newest(id)!) : null });
    if (!body.name || !body.household || !body.street) return Response.json({ error: "missing_fields" });
    if (!["add", "update", "confirm"].includes(action)) return Response.json({ error: "bad_action" });
    const row = action === "add" ? undefined : newest(id);
    if (row) {
      Object.assign(row, pick(body), { name: action === "confirm" ? String(body.name) : row.name, updated_at: "now", status: "confirmed" });
      return Response.json({ ok: true, row: "updated" });
    }
    const status = action === "add" && body.status === "invited" ? "invited" : "confirmed";
    rows.push({ ...pick(body), family_id: id, updated_at: "", status });
    return Response.json({ ok: true, row: "added" });
  };
  return { rows, handler };
}
