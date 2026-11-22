import { HttpError, callService } from "./http";

export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<void> {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const reply = await callService("turnstile_unavailable", "https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = reply.data as { success?: boolean } | undefined;
  if (!result) {
    console.error("turnstile_unavailable", reply.status, reply.text.slice(0, 200));
    throw new HttpError(502, "turnstile_unavailable");
  }
  if (!result.success) throw new HttpError(403, "turnstile_failed");
}
