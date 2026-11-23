// Calls to our Cloudflare function. Every call throws on failure so the page can offer a retry.
// In demo mode ("/#demo", demo.js), every write stays in the page: demoWrite answers it, and only the reads go out.
import { DEMO, demoWrite } from "./demo.js";

async function call(path, options = {}) {
  if (DEMO && options.method && options.method !== "GET") return demoWrite(path, JSON.parse(options.body || "{}"));
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const postJson = (path, body) => call(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  household: (text) => postJson("/api/household", { text }),
  places: (q, session) => call(`/api/places?q=${encodeURIComponent(q)}&session=${encodeURIComponent(session)}`),
  place: (id, session) => call(`/api/place?id=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`),
  submit: (entry) => postJson("/api/submit", entry),
  sprite: (update) => postJson("/api/sprite", update),
  interaction: (update) => postJson("/api/interaction", update),
  invite: (token) => postJson("/api/invite", { token }),
  addressRead: (family) => postJson("/api/address/read", family),
  addressChange: (change) => postJson("/api/address/change", change),
  party: () => call("/api/party"),
  config: () => call("/api/config"),
};
