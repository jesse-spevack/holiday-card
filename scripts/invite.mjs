#!/usr/bin/env node
// Makes a custom link for a friend whose address Jesse has. The friend opens it, confirms or fixes the address, and joins the party.
//   pnpm invite                 ask for each friend in prompts
//   pnpm invite friends.csv     one friend on each line. Columns: name, household, street, unit, city, state, zip
//   pnpm invite --list          each invite's envelope name and status, with no addresses
// In the CSV, as in the Sheet, `household` is the envelope name and `name` is who lives there (it can be empty).
// Addresses never go on the command line, so they stay out of the shell history.
//
// For each friend it writes:
//   1. D1 (production, with wrangler as Jesse): the invite id, the hash of the link token, and the envelope name. No address.
//   2. The contact Sheet (with gcloud as Jesse and the service account in apps-script/README.md): one row with status "invited",
//      and the invite id as its family_id. The address lives only there.
// If the Sheet write fails, it deletes the new invites from D1 again.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { SHEET_HEADERS, cleanFriend, deleteSql, friendProblem, insertSql, inviteLink, listText, newInvite, readFriends, sheetRow, sheetTime } from "./invites.ts";

const SHEET_ID = "1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU";
const TAB = "Contacts";
const ACCOUNT = "holiday-card-sheet@very-normal.iam.gserviceaccount.com";
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

const args = process.argv.slice(2);
const fail = (message) => {
  console.error(`invite: ${message}`);
  process.exit(1);
};

function wrangler(extra) {
  return execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "holiday-card", "--remote", ...extra], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

// A SQL file in a private folder, removed after wrangler reads it. It holds names, never addresses.
function runSql(text) {
  const dir = mkdtempSync(join(tmpdir(), "holiday-card-invite-"));
  const file = join(dir, "invites.sql");
  writeFileSync(file, text, { mode: 0o600 });
  try {
    wrangler(["--yes", "--file", file]);
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
}

function sheetToken() {
  try {
    return execFileSync(
      "gcloud",
      ["auth", "print-access-token", `--impersonate-service-account=${ACCOUNT}`, "--scopes=https://www.googleapis.com/auth/spreadsheets"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).trim();
  } catch {
    fail("gcloud gave no token. Run `gcloud auth login` as Jesse, then try again.");
  }
}

async function sheets(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${body.error?.message ?? "no message"}`);
  return body;
}

async function ask() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const friends = [];
  try {
    for (;;) {
      console.log(friends.length ? "\nNext friend." : "A new friend. Press Enter to skip a field that can be empty.");
      const raw = {};
      raw.household = await rl.question("Name on the envelope: ");
      raw.name = await rl.question("Who lives there (can be empty): ");
      raw.street = await rl.question("Street: ");
      raw.unit = await rl.question("Apartment or unit (can be empty): ");
      raw.city = await rl.question("City: ");
      raw.state = await rl.question("State (two letters): ");
      raw.zip = await rl.question("ZIP: ");
      const friend = cleanFriend(raw);
      const problem = friendProblem(friend);
      if (problem) console.log(`Not added: ${problem}. Try this friend again.`);
      else friends.push(friend);
      if (!/^y/i.test(await rl.question("Another friend? (y/N) "))) break;
    }
  } finally {
    rl.close();
  }
  return friends;
}

if (args.includes("--help") || args.includes("-h") || args.length > 1) {
  console.log("Use: pnpm invite | pnpm invite friends.csv | pnpm invite --list");
  process.exit(args.length > 1 ? 1 : 0);
}

if (args[0] === "--list") {
  const out = wrangler([
    "--json",
    "--command",
    "SELECT i.envelope, f.household AS name, i.created_at, i.confirmed_at FROM invites i LEFT JOIN families f ON f.id = i.family_id ORDER BY i.created_at, i.rowid",
  ]);
  console.log(listText(JSON.parse(out)[0].results));
  process.exit(0);
}

let friends;
if (args[0]) {
  const { friends: read, problems } = readFriends(readFileSync(args[0], "utf8"));
  if (problems.length) fail(`fix these lines, then run it again. Nothing changed.\n  ${problems.join("\n  ")}`);
  friends = read;
} else {
  if (!process.stdin.isTTY) fail("give a CSV file, or run it in a terminal to answer prompts.");
  friends = await ask();
}
if (!friends.length) fail("no friends to invite. Nothing changed.");

// The Sheet check comes first, so a wrong header stops the script before it writes anything.
const token = sheetToken();
const meta = await sheets(token, "?fields=properties.timeZone");
const header = (await sheets(token, `/values/${encodeURIComponent(`${TAB}!A1:K1`)}`)).values?.[0] ?? [];
if (header.join(",") !== SHEET_HEADERS.join(",")) fail(`the Contacts header is "${header.join(",")}". The script expects "${SHEET_HEADERS.join(",")}". Nothing changed.`);

const invites = await Promise.all(friends.map(newInvite));
runSql(insertSql(invites));
try {
  const now = sheetTime(new Date(), meta.properties.timeZone);
  await sheets(token, `/values/${encodeURIComponent(`${TAB}!A:K`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: invites.map((v) => sheetRow(v, now)) }),
  });
} catch (err) {
  console.error(`invite: the Sheet write failed: ${err.message}`);
  runSql(deleteSql(invites));
  fail("the new invites are gone from D1 again. Nothing changed.");
}

console.log(`\n${invites.length} ${invites.length === 1 ? "link" : "links"}. Send each friend their own link. Anyone with a link sees that address.\n`);
for (const v of invites) console.log(`${v.friend.household}: ${inviteLink(v.token)}`);
