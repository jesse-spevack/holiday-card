import { HttpError } from "./http";

export type Contact = {
  name: string;
  household: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

export async function addContact(env: Env, contact: Contact): Promise<void> {
  const response = await fetch(env.SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.SHEET_SECRET, ...contact }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!result.ok) {
    console.error("sheet_failed", response.status, result.error);
    throw new HttpError(502, "sheet_failed");
  }
}
