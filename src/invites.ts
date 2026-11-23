import { HttpError } from "./http";
import { readFamily, sha256, type PartyFamily } from "./party";
import { readContact, type Address } from "./sheet";

// A custom link for a friend (pnpm invite). The link holds a random token, and D1 keeps only its hash.
// The friend's Sheet row has the invite id as its family_id, and the address lives only in that row.

type InviteRow = { id: string; token_hash: string; envelope: string; family_id: string | null; confirmed_at: string | null };

export type InviteView =
  | { invite: { envelope: string; household: string; address: Address } }
  | { family: PartyFamily };

const TOKEN = /^[\w-]{22,100}$/;

export async function findInvite(db: D1Database, token: string): Promise<InviteRow> {
  if (!TOKEN.test(token)) throw new HttpError(404, "bad_invite");
  const row = await db
    .prepare("SELECT id, token_hash, envelope, family_id, confirmed_at FROM invites WHERE token_hash = ?")
    .bind(await sha256(token))
    .first<InviteRow>();
  if (!row) throw new HttpError(404, "bad_invite");
  return row;
}

// A new link gives what the friend confirms: the envelope name, who lives there, and the address, from the Sheet row.
// A used link gives the family, so the link opens the party as that family in any browser.
export async function viewInvite(env: Env, token: string): Promise<InviteView> {
  const invite = await findInvite(env.DB, token);
  if (invite.confirmed_at) {
    const family = invite.family_id ? await readFamily(env.DB, invite.family_id) : null;
    if (!family) throw new HttpError(404, "bad_invite");
    return { family };
  }
  const contact = await readContact(env, invite.id);
  if (!contact) throw new HttpError(404, "bad_invite");
  const { name, household, ...address } = contact;
  return { invite: { envelope: household || invite.envelope, household: name, address } };
}

// The invite for a submit: it must be new. A used invite fails with 409, so the page opens the party in its place.
export async function openInvite(db: D1Database, token: string): Promise<InviteRow> {
  const invite = await findInvite(db, token);
  if (invite.confirmed_at) throw new HttpError(409, "invite_used");
  return invite;
}
