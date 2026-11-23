#!/usr/bin/env node
// Finds the guests who are in the contact Sheet more than once, and on request deletes the extra rows.
//   pnpm sheet:dupes            read only: print each group of rows with the same mailing address
//   pnpm sheet:dupes --apply    also delete the extra rows, after a CSV backup outside the repo
// Two rows are duplicates when they have the same address key or the same family id (scripts/dupes.ts).
// A confirmed row wins over an invited row. Then the newest row stays.
// It also prints, but never deletes, one name at two or more addresses.
// It gets a token as Jesse with gcloud and the service account in apps-script/README.md ("Maintain the Sheet").
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deleteRequests, findDuplicates, parseValues, serialToText, toCsv } from "./dupes.ts";

const SHEET_ID = "1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU";
const TAB = "Contacts";
const ACCOUNT = "holiday-card-sheet@very-normal.iam.gserviceaccount.com";
const BACKUPS = join(homedir(), "Documents", "holiday-card", "backups");
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

const args = process.argv.slice(2);
if (args.some((a) => a !== "--apply")) {
  console.error("sheet:dupes: use no flag (read only) or --apply (delete the extra rows).");
  process.exit(1);
}
const apply = args.includes("--apply");

function token() {
  try {
    return execFileSync(
      "gcloud",
      ["auth", "print-access-token", `--impersonate-service-account=${ACCOUNT}`, "--scopes=https://www.googleapis.com/auth/spreadsheets"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).trim();
  } catch {
    console.error("sheet:dupes: gcloud gave no token. Run `gcloud auth login` as Jesse, then try again.");
    process.exit(1);
  }
}

const headers = { authorization: `Bearer ${token()}`, "content-type": "application/json" };

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${body.error?.message ?? "no message"}`);
  return body;
}

// UNFORMATTED_VALUE gives added_at as a serial number, so the dates compare as numbers.
async function readRows() {
  const range = encodeURIComponent(`${TAB}!A:K`);
  const body = await call(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  return body.values ?? [];
}

const address = (c) => [c.street, c.unit, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const line = (label, c) =>
  `  ${label.padEnd(6)} row ${String(c.row).padEnd(4)} ${serialToText(c.addedAt).slice(0, 16).padEnd(16)}  ${(c.status || "confirmed").padEnd(9)}  ${c.name} / ${c.household} / ${address(c)}`;

const values = await readRows();
const contacts = parseValues(values);
const { groups, sameName, skipped } = findDuplicates(contacts);
const remove = groups.flatMap((g) => g.remove).sort((a, b) => a.row - b.row);

console.log(`${contacts.length} contacts in the ${TAB} tab. Times are in the time zone of the Sheet.\n`);

if (groups.length) {
  console.log("Same mailing address or same family. A confirmed row wins over an invited row, then the newest row stays:");
  for (const g of groups) {
    console.log(`\n${g.key}`);
    for (const c of [g.keep, ...g.remove].sort((a, b) => a.row - b.row)) console.log(line(c === g.keep ? "keep" : "delete", c));
    if (g.namesDiffer) console.log("  Note: the names differ. Make sure that the kept row has the right name.");
    if (g.householdsDiffer) console.log("  Note: the household names differ. The kept row goes on the envelope.");
  }
  console.log("");
}

if (sameName.length) {
  console.log("Same name at different addresses. The script never deletes these. Check them by hand:");
  for (const s of sameName) {
    console.log(`\n${s.name}`);
    for (const c of s.rows) console.log(line("", c));
  }
  console.log("");
}

if (skipped.length) console.log(`Rows with no street, in no group: ${skipped.map((c) => c.row).join(", ")}\n`);

console.log(`Groups with the same address: ${groups.length}. Rows to delete: ${remove.length}. Names at more than one address: ${sameName.length}.`);

if (!remove.length) process.exit(0);
if (!apply) {
  console.log("Nothing changed. Run `pnpm sheet:dupes --apply` to delete the rows marked delete.");
  process.exit(0);
}

// The backup comes first. If the backup fails, the script stops before it deletes.
mkdirSync(BACKUPS, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(BACKUPS, `contacts-deleted-${stamp}.csv`);
writeFileSync(backup, toCsv(remove), { mode: 0o600, flag: "wx" });
console.log(`\nBackup of the ${remove.length} rows to delete: ${backup}`);

// A person can change the Sheet while the script runs. Read it again, and stop if a row to delete moved or changed.
const again = await readRows();
const same = remove.every((c) => JSON.stringify(again[c.row - 1]) === JSON.stringify(values[c.row - 1]));
if (!same) {
  console.error("sheet:dupes: the Sheet changed after the first read. The script deleted nothing. Run the command again.");
  process.exit(1);
}

const meta = await call(`?fields=sheets.properties(sheetId,title)`);
const tab = meta.sheets?.find((s) => s.properties.title === TAB);
if (!tab) throw new Error(`The Sheet has no ${TAB} tab.`);

await call(":batchUpdate", {
  method: "POST",
  body: JSON.stringify({ requests: deleteRequests(tab.properties.sheetId, remove.map((c) => c.row)) }),
});
console.log(`Deleted ${remove.length} rows: ${remove.map((c) => c.row).join(", ")}.`);
