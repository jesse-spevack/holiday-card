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
