import { HttpError } from "./http";

export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<void> {
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = (await response.json()) as { success?: boolean };
  if (!result.success) throw new HttpError(403, "turnstile_failed");
}
