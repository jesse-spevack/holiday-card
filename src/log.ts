// The error log. Each failed API request (source "worker") and each failure that the page reports (source "page",
// POST /api/log) becomes one JSON line in Workers Logs and one row in the D1 `errors` table. `pnpm errors` reads it.
// A row holds codes, field names, and booleans only. It never holds an address, a name, the household text,
// a bubble, a token, or an IP.

export type ErrorEntry = {
  source: "page" | "worker";
  route: string;
  code: string;
  status: number | null;
  detail?: string;
  familyId?: string | null;
};

const KEEP_DAYS = 30;
const KEEP_ROWS = 5000;
const FAMILY_ID = /^[A-Za-z0-9-]{1,64}$/;

// The family of a request, when a handler knows it. The router reads it when the request fails.
const families = new WeakMap<Request, string>();
export function noteFamily(request: Request, id: string): void {
  if (FAMILY_ID.test(id)) families.set(request, id);
}
export const isFamilyId = (id: unknown): id is string => typeof id === "string" && FAMILY_ID.test(id);

// Writes the JSON line and the D1 row. A failed D1 write only logs, so the log never breaks a reply.
export async function logError(env: Env, request: Request, entry: ErrorEntry, { store = true } = {}): Promise<void> {
  const row = {
    source: entry.source,
    route: entry.route.slice(0, 80),
    code: entry.code.slice(0, 120),
    status: entry.status,
    detail: (entry.detail ?? "").slice(0, 1000),
    ua: uaClass(request.headers.get("User-Agent") ?? ""),
    country: ((request.cf as { country?: string } | undefined)?.country ?? "").slice(0, 8),
    familyId: entry.familyId ?? families.get(request) ?? null,
    version: (env.CF_VERSION_METADATA?.id ?? "").slice(0, 8),
  };
  const line = JSON.stringify({ event: "error", ...row });
  if ((row.status ?? 0) >= 500) console.error(line);
  else console.log(line);
  if (!store) return;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO errors (source, route, code, status, detail, ua, country, family_id, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(row.source, row.route, row.code, row.status, row.detail, row.ua, row.country, row.familyId, row.version),
      env.DB.prepare(`DELETE FROM errors WHERE at < strftime('%Y-%m-%d %H:%M:%f', 'now', '-${KEEP_DAYS} days')`),
      env.DB.prepare(`DELETE FROM errors WHERE id <= (SELECT id FROM errors ORDER BY id DESC LIMIT 1 OFFSET ${KEEP_ROWS})`),
    ]);
  } catch (err) {
    console.error(JSON.stringify({ event: "error_log_failed", message: String(err).slice(0, 200) }));
  }
}

// A short class of the browser, for example "Safari 18 iOS 18.7" or "Instagram iOS 17.5". Not the whole user agent.
export function uaClass(ua: string): string {
  if (!ua) return "";
  if (/bot|crawl|spider|curl|wget|python|node-fetch|undici|headless/i.test(ua)) return "bot";
  const os = osOf(ua);
  const app = /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /GSA\//.test(ua) ? "Google app"
    : /Snapchat/.test(ua) ? "Snapchat" : /LinkedInApp/.test(ua) ? "LinkedIn" : /MicroMessenger/.test(ua) ? "WeChat" : /\bLine\//.test(ua) ? "Line" : "";
  if (app) return `${app} ${os}`.trim();
  const browser = match(ua, /Edg(?:A|iOS)?\/(\d+)/, "Edge") || match(ua, /OPR\/(\d+)/, "Opera") || match(ua, /SamsungBrowser\/(\d+)/, "Samsung")
    || match(ua, /(?:Firefox|FxiOS)\/(\d+)/, "Firefox") || match(ua, /CriOS\/(\d+)/, "Chrome")
    || (/; wv\)/.test(ua) ? "WebView" : "") || match(ua, /Chrome\/(\d+)/, "Chrome") || match(ua, /Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/, "Safari")
    || (/AppleWebKit/.test(ua) && /iPhone|iPad/.test(ua) ? "WebKit app" : "other");
  return `${browser} ${os}`.trim();
}

function match(ua: string, re: RegExp, name: string): string {
  const m = re.exec(ua);
  return m ? `${name} ${m[1]}` : "";
}

function osOf(ua: string): string {
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)(?:_(\d+))?/.exec(ua);
  if (ios) return `iOS ${ios[1]}${ios[2] ? `.${ios[2]}` : ""}`;
  const android = /Android (\d+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}
