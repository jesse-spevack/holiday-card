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
  const value = typeof body[name] === "string" ? (body[name] as string).trim() : "";
  if (required && !value) throw new HttpError(400, `missing_${name}`);
  if (value.length > max) throw new HttpError(400, `too_long_${name}`);
  return value;
}

export async function limit(limiter: RateLimit, request: Request): Promise<void> {
  const key = request.headers.get("CF-Connecting-IP") ?? "local";
  const { success } = await limiter.limit({ key });
  if (!success) throw new HttpError(429, "slow_down");
}
