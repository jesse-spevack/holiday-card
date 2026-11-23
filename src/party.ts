import { HttpError } from "./http";
import type { Kind } from "./household";

export const BUBBLE_MAX = 40;

export type Member = { type: Kind; look: string };
export type PartyFamily = { id: string; name: string; members: Member[]; bubbles: string[] };

type FamilyRow = { id: string; household: string };
type MemberRow = { family_id: string; kind: Kind; look: string; bubble: string; bubble_hidden: number };

export async function partyVersion(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT version FROM party_version WHERE id = 1").first<{ version: number }>();
  return row?.version ?? 0;
}

export type NewFamily = { id: string; envelope: string; householdNote: string; members: Member[] };

// The columns follow the Sheet: `household` holds the envelope name, and `family_text` holds the guest's note.
// The caller picks the id first, because the Sheet row gets it before the family goes in D1.
// A family from an invite gets the invite token (`invite`), and the invite links to it in the same batch.
export async function addFamily(db: D1Database, { id, envelope, householdNote, members }: NewFamily, invite?: { token: string }) {
  const token = invite?.token ?? randomToken();
  await db.batch([
    db.prepare("INSERT INTO families (id, household, family_text, token_hash) VALUES (?, ?, ?, ?)")
      .bind(id, envelope, householdNote, await sha256(token)),
    ...members.map((m, position) =>
      db.prepare("INSERT INTO members (id, family_id, position, kind, look) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, position, m.type, m.look),
    ),
    ...(invite ? [db.prepare("UPDATE invites SET family_id = ?, confirmed_at = datetime('now') WHERE id = ?").bind(id, id)] : []),
  ]);
  return { id, token };
}

// One family as the party shows it, also a hidden one, or null.
export async function readFamily(db: D1Database, familyId: string): Promise<PartyFamily | null> {
  const [families, members] = await db.batch([
    db.prepare("SELECT id, household FROM families WHERE id = ?").bind(familyId),
    db.prepare("SELECT family_id, kind, look, bubble, bubble_hidden FROM members WHERE family_id = ? ORDER BY position").bind(familyId),
  ]);
  const [f] = families.results as FamilyRow[];
  if (!f) return null;
  const rows = members.results as MemberRow[];
  return {
    id: f.id,
    name: f.household,
    members: rows.map((m) => ({ type: m.kind, look: m.look })),
    bubbles: rows.map((m) => (m.bubble_hidden ? "" : m.bubble)),
  };
}

export async function readParty(db: D1Database): Promise<PartyFamily[]> {
  const [families, members] = await db.batch([
    db.prepare("SELECT id, household FROM families WHERE hidden = 0 ORDER BY created_at, rowid"),
    db.prepare("SELECT family_id, kind, look, bubble, bubble_hidden FROM members ORDER BY family_id, position"),
  ]);

  const byFamily = new Map<string, PartyFamily>();
  const party = (families.results as FamilyRow[]).map((f) => {
    const family: PartyFamily = { id: f.id, name: f.household, members: [], bubbles: [] };
    byFamily.set(family.id, family);
    return family;
  });
  for (const m of members.results as MemberRow[]) {
    const family = byFamily.get(m.family_id);
    if (!family) continue;
    family.members.push({ type: m.kind, look: m.look });
    family.bubbles.push(m.bubble_hidden ? "" : m.bubble);
  }
  return party;
}

export async function updateMember(
  db: D1Database,
  familyId: string,
  token: string,
  position: number,
  change: { look?: string; bubble?: string },
) {
  await checkToken(db, familyId, token);

  const statements = [];
  if (change.look !== undefined) {
    statements.push(db.prepare("UPDATE members SET look = ? WHERE family_id = ? AND position = ?").bind(change.look, familyId, position));
  }
  if (change.bubble !== undefined) {
    // A new bubble shows again even if Jesse hid the old one.
    statements.push(
      db.prepare("UPDATE members SET bubble = ?, bubble_hidden = 0 WHERE family_id = ? AND position = ?").bind(change.bubble, familyId, position),
    );
  }
  if (!statements.length) return;
  const results = await db.batch(statements);
  if (results.some((r) => r.meta.changes === 0)) throw new HttpError(404, "not_found");
}

// The family's own token proves the call comes from the browser that signed it up.
// It returns the envelope name and the guest's note, for the Sheet. Neither goes back to the page.
export async function checkToken(db: D1Database, familyId: string, token: string) {
  const family = await db
    .prepare("SELECT token_hash, household, family_text FROM families WHERE id = ?")
    .bind(familyId)
    .first<{ token_hash: string; household: string; family_text: string }>();
  if (!family) throw new HttpError(404, "not_found");
  if (family.token_hash !== (await sha256(token))) throw new HttpError(403, "forbidden");
  return { envelope: family.household, note: family.family_text };
}

// A new envelope name is also the name at the party.
export async function renameFamily(db: D1Database, familyId: string, envelope: string) {
  await db.prepare("UPDATE families SET household = ? WHERE id = ? AND household <> ?").bind(envelope, familyId, envelope).run();
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
