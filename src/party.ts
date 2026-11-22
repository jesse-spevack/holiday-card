import { HttpError } from "./http";
import type { Kind } from "./family-parser";

export const BUBBLE_MAX = 40;

export type NewMember = { type: Kind; look: string };
export type PartyFamily = { id: string; name: string; members: { type: Kind; look: string }[]; bubbles: string[] };

export async function partyVersion(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT version FROM party_version WHERE id = 1").first<{ version: number }>();
  return row?.version ?? 0;
}

export async function addFamily(db: D1Database, envelope: string, householdText: string, members: NewMember[]) {
  const id = crypto.randomUUID();
  const token = randomToken();
  await db.batch([
    db.prepare("INSERT INTO families (id, household, family_text, token_hash) VALUES (?, ?, ?, ?)")
      .bind(id, envelope, householdText, await sha256(token)),
    ...members.map((m, position) =>
      db.prepare("INSERT INTO members (id, family_id, position, kind, look) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, position, m.type, m.look),
    ),
  ]);
  return { id, token };
}

export async function readParty(db: D1Database): Promise<PartyFamily[]> {
  const [families, members] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, household FROM families WHERE hidden = 0 ORDER BY created_at, rowid"),
    db.prepare("SELECT family_id, kind, look, bubble, bubble_hidden FROM members ORDER BY family_id, position"),
  ]);

  const byFamily = new Map<string, PartyFamily>();
  const party = families.results.map((f) => {
    const family: PartyFamily = { id: f.id as string, name: f.household as string, members: [], bubbles: [] };
    byFamily.set(family.id, family);
    return family;
  });
  for (const m of members.results) {
    const family = byFamily.get(m.family_id as string);
    if (!family) continue;
    family.members.push({ type: m.kind as Kind, look: m.look as string });
    family.bubbles.push(m.bubble_hidden ? "" : (m.bubble as string));
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
  const family = await db.prepare("SELECT token_hash FROM families WHERE id = ?").bind(familyId).first<{ token_hash: string }>();
  if (!family) throw new HttpError(404, "not_found");
  if (family.token_hash !== (await sha256(token))) throw new HttpError(403, "forbidden");

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

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
