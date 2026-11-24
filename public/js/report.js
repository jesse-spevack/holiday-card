// Reports a failure that the guest saw to the Worker (POST /api/log), so `pnpm errors` shows its cause.
// A report holds the step, the error code or message, the file and line, and a flag for the connection. Never guest data:
// no name, no address, no household text, no token. Demo mode sends nothing. A failed report stays silent and is not reported.
import { DEMO } from "./demo.js";

const MAX_REPORTS = 20;
const SAME_MS = 30000;
let sent = 0;
const lastSent = new Map();
let familyOf = () => null;

// The id of this browser's family, for the reports. app.js gives it.
export function reportFamily(fn) {
  familyOf = fn;
}

// step: a short name, for example "submit" or "fetch:/api/party". err: an Error, or a code.
// The same step and code go at most once in 30 seconds, and a page sends at most 20 reports.
export function report(step, err) {
  if (DEMO || sent >= MAX_REPORTS) return;
  const code = String((err && err.message) || err || "unknown").slice(0, 120);
  const key = `${step}|${code}`;
  const now = performance.now();
  if (lastSent.has(key) && now - lastSent.get(key) < SAME_MS) return;
  lastSent.set(key, now);
  sent++;
  const body = { step: String(step).slice(0, 40), code, where: where(err), online: navigator.onLine, family: familyOf() || undefined };
  try {
    fetch("/api/log", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  } catch {}
}

// The file and line of the first stack frame in our own code, for example "app.js:421:30".
function where(err) {
  const m = /([\w.-]+\.m?js):(\d+):(\d+)/.exec((err && err.stack) || "");
  return m ? `${m[1]}:${m[2]}:${m[3]}` : "";
}

// An error that nothing caught, and a promise that failed with no catch.
// iOS Safari's "ResizeObserver loop completed with undelivered notifications" is harmless, so it is not reported.
const HARMLESS = /ResizeObserver loop/;
export function reportUncaught() {
  window.addEventListener("error", (e) => {
    if (HARMLESS.test(String(e.message || e.error?.message || ""))) return;
    report("uncaught", e.error || e.message);
  });
  window.addEventListener("unhandledrejection", (e) => report("rejection", e.reason));
}
