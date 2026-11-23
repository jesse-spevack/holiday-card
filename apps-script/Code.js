const SHEET_ID = "1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU";
const TAB = "Contacts";
const FIELDS = ["name", "household", "street", "unit", "city", "state", "zip"];
const HEADERS = ["added_at", ...FIELDS, "family_id", "updated_at"];
const FAMILY_COL = HEADERS.indexOf("family_id") + 1;
const UPDATED_COL = HEADERS.indexOf("updated_at") + 1;

// One POST with the shared secret and an action:
//   "add" (also no action, as the first Worker sends): add a row.
//   "read": the newest row of a family_id, or null.
//   "update": change the newest row of a family_id. With no row for it, add a row.
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: "bad_json" });
  }
  if (body.secret !== SHARED_SECRET) return reply({ error: "forbidden" });

  const action = body.action || "add";
  if (action === "read") {
    if (!body.family_id) return reply({ error: "missing_fields" });
    return reply({ ok: true, contact: readContact(String(body.family_id)) });
  }
  if (action !== "add" && action !== "update") return reply({ error: "bad_action" });
  if (!body.name || !body.household || !body.street) return reply({ error: "missing_fields" });
  if (action === "update" && !body.family_id) return reply({ error: "missing_fields" });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const tab = contactsTab();
    const row = action === "update" ? familyRow(tab, String(body.family_id)) : 0;
    if (row) {
      // The added_at, name, and family_id cells stay as they were.
      tab.getRange(row, 3, 1, FIELDS.length - 1).setValues([FIELDS.slice(1).map((f) => text(body[f]))]);
      tab.getRange(row, UPDATED_COL).setValue(new Date());
      return reply({ ok: true, row: "updated" });
    }
    tab.appendRow([new Date(), ...FIELDS.map((f) => text(body[f])), text(body.family_id), ""]);
    return reply({ ok: true, row: "added" });
  } finally {
    lock.releaseLock();
  }
}

function readContact(familyId) {
  const tab = contactsTab();
  const row = familyRow(tab, familyId);
  if (!row) return null;
  const cells = tab.getRange(row, 2, 1, FIELDS.length).getDisplayValues()[0];
  return Object.fromEntries(FIELDS.map((f, i) => [f, cells[i]]));
}

// The newest row of a family is the lowest one, because rows go on at the bottom. 0 means no row.
function familyRow(tab, familyId) {
  const last = tab.getLastRow();
  if (last < 2) return 0;
  const ids = tab.getRange(2, FAMILY_COL, last - 1, 1).getDisplayValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] === familyId) return i + 2;
  }
  return 0;
}

// The tab gets its header on first use. An older tab gets the header cells of the newer columns.
function contactsTab() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  let tab = book.getSheetByName(TAB);
  if (!tab) {
    tab = book.insertSheet(TAB, 0);
    tab.setFrozenRows(1);
  }
  const header = tab.getRange(1, 1, 1, HEADERS.length);
  const now = header.getDisplayValues()[0];
  if (now.some((cell, i) => cell !== HEADERS[i])) {
    if (now.some((cell, i) => cell && cell !== HEADERS[i])) throw new Error("The Contacts header is not the one the script expects.");
    header.setValues([HEADERS]).setFontWeight("bold");
  }
  return tab;
}

// A leading quote keeps guest input as text: no formulas, and zip 02139 keeps its zero.
function text(value) {
  const s = String(value ?? "").trim();
  return s ? "'" + s : "";
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
