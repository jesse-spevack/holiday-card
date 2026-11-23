// `detail` goes to the error log only (src/log.ts), never to the page. It holds codes and numbers, never guest data.
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail = "") {
    super(code);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// maxBytes caps the body. A longer body fails with 413 before it is parsed.
export async function readJson(request: Request, maxBytes = 65_536): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) throw new HttpError(413, "too_large");
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, "bad_json");
  }
  if (text.length > maxBytes) throw new HttpError(413, "too_large");
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, "bad_json");
}

export function field(body: Record<string, unknown>, name: string, { max, required = true }: { max: number; required?: boolean }): string {
  const raw = body[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (required && !value) throw new HttpError(400, `missing_${name}`);
  if (value.length > max) throw new HttpError(400, `too_long_${name}`);
  return value;
}

export async function rateLimit(limiter: RateLimit, request: Request): Promise<void> {
  const key = request.headers.get("CF-Connecting-IP") ?? "local";
  const { success } = await limiter.limit({ key });
  if (!success) throw new HttpError(429, "slow_down");
}

export type ServiceReply = { status: number; ok: boolean; text: string; data: unknown };

// One shape for every outside service: a timeout, and a 502 with `code` when the service cannot be reached.
// Each failure logs one JSON line with the service, the status, and the time. Never the URL or the body: they hold guest data.
export async function callService(code: string, url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<ServiceReply> {
  const started = Date.now();
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  } catch (err) {
    const ms = Date.now() - started;
    const error = err instanceof Error ? err.name : "Error";
    console.error(JSON.stringify({ event: "service", service: code, ok: false, error, ms }));
    throw new HttpError(502, code, `${error} after ${ms} ms`);
  }
  if (!response.ok) console.error(JSON.stringify({ event: "service", service: code, ok: false, status: response.status, ms: Date.now() - started }));
  return { status: response.status, ok: response.ok, text, data: parseJson(text) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
