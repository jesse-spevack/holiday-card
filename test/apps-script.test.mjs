// The Apps Script on the contact Sheet (apps-script/Code.js), run in Node against a small fake of the Sheets service.
// It never calls Google. `pnpm test` runs it after the Worker tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CODE = readFileSync(new URL("../apps-script/Code.js", import.meta.url), "utf8");
const OLD_HEADER = ["added_at", "name", "household", "street", "unit", "city", "state", "zip"];
const HEADER = [...OLD_HEADER, "family_id", "updated_at", "status"];

// A tab as a list of rows. A cell that starts with a quote shows without it, as in Sheets.
function fakeTab(rows) {
  const show = (v) => (Object.prototype.toString.call(v) === "[object Date]" ? "date" : typeof v === "string" && v.startsWith("'") ? v.slice(1) : String(v ?? ""));
  const range = (r, c, nr = 1, nc = 1) => {
    const cells = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? ""));
    const put = (values) => values.forEach((line, i) => line.forEach((v, j) => {
      rows[r - 1 + i] ??= [];
      rows[r - 1 + i][c - 1 + j] = v;
    }));
    const self = {
      getValues: cells,
      getDisplayValues: () => cells().map((line) => line.map(show)),
      setValues: (values) => (put(values), self),
      setValue: (value) => (put([[value]]), self),
      setFontWeight: () => self,
    };
    return self;
  };
  return { rows, getLastRow: () => rows.length, getRange: range, appendRow: (line) => rows.push([...line]), setFrozenRows: () => {} };
}

function script(rows) {
  const tab = fakeTab(rows);
  const context = {
    SHARED_SECRET: "s3cret",
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => tab, insertSheet: () => tab }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
  };
  vm.createContext(context);
  vm.runInContext(CODE, context);
  return (body) => context.doPost({ postData: { contents: JSON.stringify({ secret: "s3cret", ...body }) } });
}

const CONTACT = { name: "Sofia and Dan", household: "The Garcia Family", street: "1428 Maple Ave", unit: "", city: "Evanston", state: "IL", zip: "02139" };

test("a call with no action adds a row, as the first Worker sends it", () => {
  const rows = [HEADER];
  assert.deepEqual(script(rows)(CONTACT), { ok: true, row: "added" });
  assert.deepEqual(rows[1].slice(1), ["'Sofia and Dan", "'The Garcia Family", "'1428 Maple Ave", "", "'Evanston", "'IL", "'02139", "", "", "confirmed"]);
});

test("an older tab gets the header cells of the new columns, and no other cell changes", () => {
  const rows = [[...OLD_HEADER], ["d", "a", "b", "c", "", "e", "f", "g"]];
  script(rows)({ action: "add", family_id: "f1", ...CONTACT });
  assert.deepEqual(rows[0], HEADER);
  assert.deepEqual(rows[1], ["d", "a", "b", "c", "", "e", "f", "g"]);
  assert.equal(rows[2][8], "'f1");
});

test("a header that is not the one the script expects stops the script", () => {
  const rows = [["name", "added_at"]];
  assert.throws(() => script(rows)({ action: "read", family_id: "f1" }), /header/);
});

test("read gives the newest row of a family, or null", () => {
  const rows = [HEADER];
  const call = script(rows);
  call({ action: "add", family_id: "f1", ...CONTACT });
  call({ action: "add", family_id: "f1", ...CONTACT, street: "77 Fifth Ave" });
  call({ action: "add", family_id: "f2", ...CONTACT, street: "9 Elm St" });
  assert.deepEqual(call({ action: "read", family_id: "f1" }), { ok: true, contact: { ...CONTACT, street: "77 Fifth Ave" } });
  assert.deepEqual(call({ action: "read", family_id: "nope" }), { ok: true, contact: null });
});

test("update changes the newest row in place and keeps added_at, the name, and the family id", () => {
  const rows = [HEADER];
  const call = script(rows);
  call({ action: "add", family_id: "f1", ...CONTACT });
  const before = [...rows[1]];
  const moved = { ...CONTACT, name: "someone else", household: "The Garcias", street: "77 Fifth Ave", city: "New York", state: "NY", zip: "10003" };
  assert.deepEqual(call({ action: "update", family_id: "f1", ...moved }), { ok: true, row: "updated" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].slice(0, 2), before.slice(0, 2));
  assert.deepEqual(rows[1].slice(2, 9), ["'The Garcias", "'77 Fifth Ave", "", "'New York", "'NY", "'10003", "'f1"]);
  // The script runs in its own realm, so its Date is not this file's Date.
  assert.equal(Object.prototype.toString.call(rows[1][9]), "[object Date]");
  assert.equal(rows[1][10], "confirmed");
});

test("an add can mark the row invited, and confirm changes it in place with who lives there", () => {
  const rows = [HEADER];
  const call = script(rows);
  call({ action: "add", family_id: "f1", status: "invited", ...CONTACT, name: "Sofia & Dan", household: "The Garcias" });
  call({ action: "add", family_id: "f2", status: "bogus", ...CONTACT });
  assert.deepEqual([rows[1][10], rows[2][10]], ["invited", "confirmed"]);
  const added = rows[1][0];
  const fixed = { ...CONTACT, name: "Sofia, Dan, and Mia", street: "77 Fifth Ave", city: "New York", state: "NY", zip: "10003" };
  assert.deepEqual(call({ action: "confirm", family_id: "f1", ...fixed }), { ok: true, row: "updated" });
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], added);
  assert.deepEqual(rows[1].slice(1, 9), ["'Sofia, Dan, and Mia", "'The Garcia Family", "'77 Fifth Ave", "", "'New York", "'NY", "'10003", "'f1"]);
  assert.equal(rows[1][10], "confirmed");
});

test("update adds a row when the family has none", () => {
  const rows = [HEADER];
  assert.deepEqual(script(rows)({ action: "update", family_id: "f9", ...CONTACT }), { ok: true, row: "added" });
  assert.equal(rows[1][8], "'f9");
});

test("a wrong secret, a missing field, and an unknown action change nothing", () => {
  const rows = [HEADER];
  const call = script(rows);
  assert.deepEqual(call({ secret: "wrong", ...CONTACT }), { error: "forbidden" });
  assert.deepEqual(call({ ...CONTACT, street: "" }), { error: "missing_fields" });
  assert.deepEqual(call({ action: "update", ...CONTACT }), { error: "missing_fields" });
  assert.deepEqual(call({ action: "read" }), { error: "missing_fields" });
  assert.deepEqual(call({ action: "drop", ...CONTACT }), { error: "bad_action" });
  assert.equal(rows.length, 1);
});
