import { HttpError, callService } from "./http";

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
  const reply = await callService(
    "sheet_failed",
    env.SHEET_URL,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: env.SHEET_SECRET, ...contact }) },
    20_000,
  );
  // Apps Script answers 200 even on a script error, so only its `ok` flag counts.
  const result = reply.data as { ok?: boolean; error?: string } | undefined;
  if (!result?.ok) {
    console.error("sheet_failed", reply.status, result?.error ?? reply.text.slice(0, 200));
    throw new HttpError(502, "sheet_failed");
  }
}
