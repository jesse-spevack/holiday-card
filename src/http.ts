export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
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
export async function callService(code: string, url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<ServiceReply> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  } catch (err) {
    console.error(code, String(err));
    throw new HttpError(502, code);
  }
  return { status: response.status, ok: response.ok, text, data: parseJson(text) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
