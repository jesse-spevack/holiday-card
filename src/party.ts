import { HttpError } from "./http";
import type { Kind, ParsedMember } from "./family-parser";

export const BUBBLE_MAX = 40;
const LOOK_RANGE = 1000;

export type PartyMember = { id: string; kind: Kind; look: number; bubble: string };
export type PartyFamily = { id: string; household: string; members: PartyMember[] };

export async function partyVersion(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT version FROM party_version WHERE id = 1").first<{ version: number }>();
  return row?.version ?? 0;
}

export async function addFamily(db: D1Database, household: string, familyText: string, members: ParsedMember[]) {
  const familyId = crypto.randomUUID();
  const token = randomToken();
  const rows = members.map((m, position) => ({ id: crypto.randomUUID(), position, ...m, look: randomLook() }));

  await db.batch([
    db.prepare("INSERT INTO families (id, household, family_text, token_hash) VALUES (?, ?, ?, ?)")
      .bind(familyId, household, familyText, await sha256(token)),
    ...rows.map((r) =>
      db.prepare("INSERT INTO members (id, family_id, position, name, kind, look) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(r.id, familyId, r.position, r.name, r.kind, r.look),
    ),
  ]);

  return { familyId, token, members: rows.map(({ id, kind, look }) => ({ id, kind, look, bubble: "" })) };
}

export async function readParty(db: D1Database): Promise<PartyFamily[]> {
  const [families, members] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, household FROM families ORDER BY created_at, rowid"),
    db.prepare("SELECT id, family_id, kind, look, bubble, bubble_hidden FROM members ORDER BY family_id, position"),
  ]);

  const byFamily = new Map<string, PartyMember[]>();
  for (const m of members.results) {
    const list = byFamily.get(m.family_id as string) ?? [];
    list.push({ id: m.id as string, kind: m.kind as Kind, look: m.look as number, bubble: m.bubble_hidden ? "" : (m.bubble as string) });
    byFamily.set(m.family_id as string, list);
  }
  return families.results.map((f) => ({ id: f.id as string, household: f.household as string, members: byFamily.get(f.id as string) ?? [] }));
}

export async function updateMember(db: D1Database, memberId: string, token: string, change: { look?: number; bubble?: string }) {
  const owner = await db
    .prepare("SELECT f.token_hash FROM members m JOIN families f ON f.id = m.family_id WHERE m.id = ?")
    .bind(memberId)
    .first<{ token_hash: string }>();
  if (!owner) throw new HttpError(404, "not_found");
  if (!token || owner.token_hash !== (await sha256(token))) throw new HttpError(403, "forbidden");

  if (change.look !== undefined) {
    await db.prepare("UPDATE members SET look = ? WHERE id = ?").bind(change.look, memberId).run();
  }
  if (change.bubble !== undefined) {
    // A new bubble shows again even if Jesse hid the old one.
    await db.prepare("UPDATE members SET bubble = ?, bubble_hidden = 0 WHERE id = ?").bind(change.bubble, memberId).run();
  }
}

function randomLook(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % LOOK_RANGE;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
