// The pure parts of `pnpm invite`: the CSV, the checks, the new invite, the D1 SQL, the Sheet row, and the link.
// It has no I/O, so test/invites.test.ts tests it. scripts/invite.mjs reads the input and writes D1 and the Sheet.
import { usAddressProblem } from "../public/js/us.js";

export const SITE = "https://hi.verynormal.dev";
// The columns of the CSV. They follow the Sheet: `name` is who lives there, and `household` is the envelope name.
export const CSV_COLUMNS = ["name", "household", "street", "unit", "city", "state", "zip"] as const;
// The columns of the Contacts tab, as apps-script/Code.js writes them.
export const SHEET_HEADERS = ["added_at", ...CSV_COLUMNS, "family_id", "updated_at", "status"] as const;

export type Friend = Record<(typeof CSV_COLUMNS)[number], string>;
export type Invite = { id: string; token: string; hash: string; friend: Friend };

// RFC 4180: commas, quotes with "" inside, and line breaks inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

// What is wrong with one friend, or null. The words name the field, never the address.
export function friendProblem(f: Friend): string | null {
  if (!f.household) return "no envelope name (household)";
  if (!f.street) return "no street";
  if (f.household.length > 120 || f.name.length > 400 || f.street.length > 300) return "a field is too long";
  const problem = usAddressProblem(f);
  if (problem === "not_us") return "not a US address";
  if (problem === "no_state") return "no US state";
  return null;
}

export function cleanFriend(raw: Partial<Record<string, string>>): Friend {
  const f = Object.fromEntries(CSV_COLUMNS.map((c) => [c, String(raw[c] ?? "").trim().replace(/\s+/g, " ")])) as Friend;
  f.state = f.state.toUpperCase();
  return f;
}

// The friends in a CSV with a header row. Each problem names its line in the file.
export function readFriends(text: string): { friends: Friend[]; problems: string[] } {
  const [header = [], ...lines] = parseCsv(text);
  const names = header.map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) return { friends: [], problems: [`The header needs the columns ${CSV_COLUMNS.join(", ")}. It has no ${missing.join(", ")}.`] };
  const friends: Friend[] = [];
  const problems: string[] = [];
  lines.forEach((cells, i) => {
    const friend = cleanFriend(Object.fromEntries(names.map((n, k) => [n, cells[k] ?? ""])));
    const problem = friendProblem(friend);
    if (problem) problems.push(`Line ${i + 2}: ${problem}.`);
    else friends.push(friend);
  });
  return { friends, problems };
}

// 32 random bytes: 256 bits, as base64url. The link holds the token, and D1 holds only its SHA-256.
export async function newInvite(friend: Friend): Promise<Invite> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { id: crypto.randomUUID(), token, hash, friend };
}

const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

// The D1 rows: the id, the token hash, and the envelope name. No address.
export function insertSql(invites: Invite[]): string {
  return invites.map((v) => `INSERT INTO invites (id, token_hash, envelope) VALUES (${sql(v.id)}, ${sql(v.hash)}, ${sql(v.friend.household)});`).join("\n") + "\n";
}

export function deleteSql(invites: Invite[]): string {
  return `DELETE FROM invites WHERE id IN (${invites.map((v) => sql(v.id)).join(", ")});\n`;
}

// A leading quote keeps each value as text, as the Apps Script does: no formulas, and zip 02139 keeps its zero.
// The Sheet reads `addedAt` ("YYYY-MM-DD HH:MM:SS" in the time zone of the Sheet) as a date.
export function sheetRow(v: Invite, addedAt: string): string[] {
  const text = (s: string) => (s ? `'${s}` : "");
  return [addedAt, ...CSV_COLUMNS.map((c) => text(v.friend[c])), text(v.id), "", "invited"];
}

// The token goes after "#", so it never reaches a server log or a Referer header.
export function inviteLink(token: string, site = SITE): string {
  return `${site}/#invite=${token}`;
}

// The time now in a time zone, as Sheets reads a date: "YYYY-MM-DD HH:MM:SS".
export function sheetTime(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export type ListRow = { envelope: string; name: string | null; created_at: string; confirmed_at: string | null };

// One line for each invite: the envelope name and the status, with no address. A confirmed friend can change the name.
export function listText(rows: ListRow[]): string {
  if (!rows.length) return "No invites yet.";
  const width = Math.max(...rows.map((r) => (r.name ?? r.envelope).length), 8);
  const lines = rows.map((r) => {
    const status = r.confirmed_at ? `confirmed ${r.confirmed_at.slice(0, 10)}` : "invited";
    return `${(r.name ?? r.envelope).padEnd(width)}  ${status.padEnd(20)}  made ${r.created_at.slice(0, 10)}`;
  });
  const confirmed = rows.filter((r) => r.confirmed_at).length;
  return [...lines, "", `${rows.length} invites. ${confirmed} confirmed. Times are UTC.`].join("\n");
}
