import { vi } from "vitest";

type Handler = (request: Request) => Response | Promise<Response>;

// Stubs the external services by host. A call to a host with no handler fails the test.
export function stubOutbound(handlers: Record<string, Handler>) {
  const calls: { host: string; url: string; body: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const host = new URL(request.url).host;
    // Read the body here: the worker's I/O objects cannot cross into the test context.
    calls.push({ host, url: request.url, body: await request.clone().text() });
    const handler = handlers[host];
    if (!handler) throw new Error(`unexpected outbound call to ${host}`);
    return handler(request);
  });
  return {
    calls,
    to: (host: string) => calls.filter((c) => c.host === host),
  };
}

export const OPENROUTER = "openrouter.ai";
export const SHEET = "script.google.com";
export const TURNSTILE = "challenges.cloudflare.com";
export const PLACES = "places.googleapis.com";

export function llmReply(members: unknown[]): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify({ members }) } }] });
}
