const SHEET_ID = "1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU";
const TAB = "Contacts";
const FIELDS = ["name", "household", "street", "unit", "city", "state", "zip"];
const HEADERS = ["added_at", ...FIELDS];

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: "bad_json" });
  }
  if (body.secret !== SHARED_SECRET) return reply({ error: "forbidden" });
  if (!body.name || !body.household || !body.street) return reply({ error: "missing_fields" });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    contactsTab().appendRow([new Date(), ...FIELDS.map((f) => text(body[f]))]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function contactsTab() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  const existing = book.getSheetByName(TAB);
  if (existing) return existing;

  const tab = book.insertSheet(TAB, 0);
  tab.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
  tab.setFrozenRows(1);
  return tab;
}

// A leading quote stops the Sheet from running guest text as a formula.
function text(value) {
  const s = String(value ?? "").trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
