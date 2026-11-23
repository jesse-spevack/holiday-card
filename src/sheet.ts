import { HttpError, callService } from "./http";

// One row of the Contacts tab. `name` holds who lives there, and `household` holds the envelope name.
export type Contact = {
  name: string;
  household: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

export type Address = Omit<Contact, "name" | "household">;

// A new row, with the family id of the party.
export async function addContact(env: Env, familyId: string, contact: Contact): Promise<void> {
  await callSheet(env, { action: "add", family_id: familyId, ...contact });
}

// The newest row of a family, or null when the Sheet has no row for it (a sign-up from before family ids, or a deleted row).
export async function readContact(env: Env, familyId: string): Promise<Contact | null> {
  const result = await callSheet(env, { action: "read", family_id: familyId });
  const contact = result.contact as Record<string, unknown> | null | undefined;
  if (!contact) return null;
  const text = (k: keyof Contact) => (typeof contact[k] === "string" ? (contact[k] as string) : "");
  return { name: text("name"), household: text("household"), street: text("street"), unit: text("unit"), city: text("city"), state: text("state"), zip: text("zip") };
}

// Changes the newest row of a family. The Apps Script adds a row when the family has none.
export async function updateContact(env: Env, familyId: string, contact: Contact): Promise<void> {
  await callSheet(env, { action: "update", family_id: familyId, ...contact });
}

async function callSheet(env: Env, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const reply = await callService(
    "sheet_failed",
    env.SHEET_URL,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: env.SHEET_SECRET, ...body }) },
    20_000,
  );
  // Apps Script answers 200 even on a script error, so only its `ok` flag counts.
  const result = reply.data as { ok?: boolean; error?: string } | undefined;
  if (!result?.ok) {
    console.error("sheet_failed", body.action, reply.status, result?.error ?? reply.text.slice(0, 200));
    throw new HttpError(502, "sheet_failed");
  }
  return result as Record<string, unknown>;
}
