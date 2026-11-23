// The rules of `pnpm sheet:dupes`, with made-up fixtures. No test reads or writes the real Sheet.
import { describe, expect, it } from "vitest";
import {
  addressKey,
  cellText,
  deleteRequests,
  findDuplicates,
  parseValues,
  serialToText,
  streetLine,
  toCsv,
  zip5,
  type Contact,
} from "../scripts/dupes";

let next = 2;
function contact(fields: Partial<Contact>): Contact {
  return {
    row: next++,
    addedAt: 46000,
    name: "Ada Lovelace",
    household: "The Lovelaces",
    street: "1428 Maple Ave",
    unit: "",
    city: "Evanston",
    state: "IL",
    zip: "60201",
    familyId: "",
    updatedAt: null,
    ...fields,
  };
}

const same = (a: Partial<Contact>, b: Partial<Contact>) => addressKey(contact(a)) === addressKey(contact(b));

describe("the address key", () => {
  it("ignores case, spaces, and punctuation", () => {
    expect(same({ street: "1428 Maple Ave." }, { street: "  1428  MAPLE   ave" })).toBe(true);
    expect(same({ street: "12 O'Brien Rd" }, { street: "12 OBrien Road" })).toBe(true);
  });

  it("uses one form for each common street word", () => {
    expect(streetLine("1428 Maple Avenue", "")).toBe("1428 maple ave");
    expect(streetLine("9 North Main Street", "")).toBe("9 n main st");
    expect(streetLine("9 N. Main St.", "")).toBe("9 n main st");
    expect(streetLine("40 Elm Drive", "")).toBe("40 elm dr");
    expect(streetLine("5 Lakeview Boulevard", "")).toBe("5 lakeview blvd");
    expect(streetLine("77 Fifth Avenue", "")).toBe("77 5th ave");
    expect(streetLine("3 Southwest Oak Court", "")).toBe("3 sw oak ct");
    expect(streetLine("1 Saint Marks Place", "")).toBe("1 st marks pl");
  });

  it("gives one form to each way to write a unit", () => {
    const line = "1428 maple ave # 2b";
    expect(streetLine("1428 Maple Ave", "Apt 2B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "Apartment 2-B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "#2B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "Unit 2 B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "Suite 2B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "2B")).toBe(line);
    expect(streetLine("1428 Maple Ave", "Apt #2B")).toBe(line);
  });

  it("finds the unit in the street, in the unit, or in both", () => {
    const line = "1428 maple ave # 2b";
    expect(streetLine("1428 Maple Ave Apt 2B", "")).toBe(line);
    expect(streetLine("1428 Maple Ave, #2B", "")).toBe(line);
    expect(streetLine("1428 Maple Ave Apt 2B", "2B")).toBe(line);
    expect(streetLine("1428 Maple Ave Apt 2B", "Apt 2B")).toBe(line);
  });

  it("keeps a floor or a building apart from a unit number", () => {
    expect(streetLine("1428 Maple Ave", "Floor 2")).toBe("1428 maple ave fl 2");
    expect(streetLine("1428 Maple Ave", "Fl 2")).toBe("1428 maple ave fl 2");
    expect(same({ unit: "Fl 2" }, { unit: "Apt 2" })).toBe(false);
  });

  it("uses the first five digits of a ZIP", () => {
    expect(zip5("60201")).toBe("60201");
    expect(zip5("60201-1234")).toBe("60201");
    expect(zip5("602011234")).toBe("60201");
    expect(zip5(" 60201 1234 ")).toBe("60201");
    expect(same({ zip: "60201" }, { zip: "60201-4321" })).toBe(true);
  });

  it("gives back the leading zeros that a number cell drops", () => {
    expect(zip5("2139")).toBe("02139");
    expect(zip5("501")).toBe("00501");
    expect(same({ zip: "02139" }, { zip: "2139" })).toBe(true);
  });

  it("ignores the city and the state when the ZIP is a US ZIP", () => {
    expect(same({ city: "New York" }, { city: "NYC", state: "New York" })).toBe(true);
  });

  it("uses the city, the state, and the postal code when there is no US ZIP", () => {
    expect(zip5("SW1A 1AA")).toBe(null);
    const london = { street: "10 Downing Street", city: "London", state: "", zip: "SW1A 1AA" };
    expect(same(london, { ...london, street: "10 Downing St", zip: "sw1a1aa" })).toBe(true);
    expect(same(london, { ...london, city: "Leeds" })).toBe(false);
    expect(same({ zip: "", state: "Illinois" }, { zip: "", state: "IL" })).toBe(true);
  });

  it("ignores accents", () => {
    expect(same({ street: "8 Calle Peña" }, { street: "8 Calle Pena" })).toBe(true);
  });
});

describe("near matches that are not duplicates", () => {
  it("a different unit in the same building", () => {
    expect(same({ unit: "Apt 2B" }, { unit: "Apt 2C" })).toBe(false);
    expect(same({ unit: "Apt 2" }, { unit: "Apt 12" })).toBe(false);
  });

  it("one row with a unit and one with no unit", () => {
    expect(same({ unit: "Apt 2B" }, { unit: "" })).toBe(false);
  });

  it("a different house number on the same street", () => {
    expect(same({ street: "1428 Maple Ave" }, { street: "1430 Maple Ave" })).toBe(false);
    expect(same({ street: "14 Maple Ave" }, { street: "1 4 Maple Ave" })).toBe(false);
  });

  it("a different street type or direction", () => {
    expect(same({ street: "1428 Maple Ave" }, { street: "1428 Maple St" })).toBe(false);
    expect(same({ street: "9 N Main St" }, { street: "9 S Main St" })).toBe(false);
    expect(same({ street: "9 N Main St" }, { street: "9 Main St" })).toBe(false);
  });

  it("the same street in a different ZIP", () => {
    expect(same({ zip: "60201" }, { zip: "60202" })).toBe(false);
  });
});

describe("the duplicate groups", () => {
  it("keeps the newest row and deletes the others", () => {
    const old = contact({ addedAt: 46000.1 });
    const newer = contact({ addedAt: 46002.5, street: "1428 Maple Avenue" });
    const mid = contact({ addedAt: 46001, street: "1428 maple ave." });
    const other = contact({ street: "77 Fifth Ave", zip: "10003" });
    const { groups } = findDuplicates([old, newer, mid, other]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep).toBe(newer);
    expect(groups[0].remove).toEqual([old, mid]);
    expect(groups[0].namesDiffer).toBe(false);
  });

  it("keeps the row nearer the bottom when two rows have the same time", () => {
    const a = contact({ addedAt: 46000 });
    const b = contact({ addedAt: 46000 });
    expect(findDuplicates([a, b]).groups[0].keep).toBe(b);
  });

  it("treats a row with no date as the oldest", () => {
    const dated = contact({ addedAt: 46000 });
    const undated = contact({ addedAt: null });
    expect(findDuplicates([dated, undated]).groups[0].keep).toBe(dated);
  });

  it("marks a group when the names or the households differ", () => {
    const a = contact({ name: "Ada Lovelace", household: "The Lovelaces" });
    const b = contact({ name: "William King", household: "Ada and William" });
    const [group] = findDuplicates([a, b]).groups;
    expect(group.namesDiffer).toBe(true);
    expect(group.householdsDiffer).toBe(true);
  });

  it("does not mark a group when the names differ only in case and spaces", () => {
    const [group] = findDuplicates([contact({ name: "Ada Lovelace" }), contact({ name: " ada  lovelace " })]).groups;
    expect(group.namesDiffer).toBe(false);
  });

  it("makes no group for different units in one building", () => {
    const report = findDuplicates([contact({ unit: "Apt 1", name: "A" }), contact({ unit: "Apt 2", name: "B" })]);
    expect(report.groups).toEqual([]);
  });

  it("reports one name at two addresses, and never puts it in a group", () => {
    const home = contact({ name: "Ada Lovelace" });
    const moved = contact({ name: "ada lovelace", street: "77 Fifth Ave", zip: "10003" });
    const report = findDuplicates([home, moved]);
    expect(report.groups).toEqual([]);
    expect(report.sameName).toEqual([{ name: "ada lovelace", rows: [home, moved] }]);
  });

  it("does not report one name at one address", () => {
    expect(findDuplicates([contact({}), contact({})]).sameName).toEqual([]);
  });

  it("puts rows with the same family id in one group, also at two addresses", () => {
    const old = contact({ familyId: "f1", addedAt: 46000 });
    const moved = contact({ familyId: "f1", addedAt: 46001, street: "77 Fifth Ave", zip: "10003" });
    const other = contact({ familyId: "f2", street: "9 Elm St", name: "Bo" });
    const report = findDuplicates([old, moved, other]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({ key: "family f1", keep: moved, remove: [old] });
    expect(report.sameName).toEqual([]);
  });

  it("joins a family group and an address group into one", () => {
    const a = contact({ familyId: "f1", addedAt: 46000 });
    const b = contact({ familyId: "f1", addedAt: 46001, street: "77 Fifth Ave", zip: "10003" });
    const c = contact({ addedAt: 46002, street: "77 Fifth Avenue", zip: "10003" });
    const [group] = findDuplicates([a, b, c]).groups;
    expect(group.keep).toBe(c);
    expect(group.remove).toEqual([a, b]);
  });

  it("keeps the row that its guest changed last", () => {
    const changed = contact({ addedAt: 46000, updatedAt: 46005 });
    const later = contact({ addedAt: 46002 });
    expect(findDuplicates([changed, later]).groups[0].keep).toBe(changed);
  });

  it("does not join two rows with no family id", () => {
    const report = findDuplicates([contact({ name: "A" }), contact({ name: "B", street: "9 Elm St" })]);
    expect(report.groups).toEqual([]);
  });

  it("skips a row with no street", () => {
    const blank = contact({ street: "  " });
    const report = findDuplicates([blank, contact({ street: "" }), contact({})]);
    expect(report.skipped).toHaveLength(2);
    expect(report.groups).toEqual([]);
  });
});

describe("the delete requests", () => {
  it("deletes from the bottom row up, one row at a time", () => {
    expect(deleteRequests(7, [3, 9, 5])).toEqual([
      { deleteDimension: { range: { sheetId: 7, dimension: "ROWS", startIndex: 8, endIndex: 9 } } },
      { deleteDimension: { range: { sheetId: 7, dimension: "ROWS", startIndex: 4, endIndex: 5 } } },
      { deleteDimension: { range: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 } } },
    ]);
  });

  it("asks once for a row that shows twice", () => {
    expect(deleteRequests(7, [4, 4])).toHaveLength(1);
  });

  it("never deletes the header", () => {
    expect(() => deleteRequests(7, [1, 4])).toThrow(/header/);
    expect(() => deleteRequests(7, [0])).toThrow();
  });
});

describe("the rows from the Sheets API", () => {
  const header = ["added_at", "name", "household", "street", "unit", "city", "state", "zip"];

  it("reads each cell as text and gives each row its Sheet row number", () => {
    const rows = parseValues([
      header,
      [46348.5, "'Ada", "The Lovelaces", "1428 Maple Ave", "", "Evanston", "IL", "02139"],
      [],
      [46349, "Bo", "Bo", "1 Elm St", "", "Evanston", "IL", 60201],
      [46350, "Cy", "Cy", "2 Oak St"],
    ]);
    expect(rows.map((r) => r.row)).toEqual([2, 4, 5]);
    expect(rows[0]).toMatchObject({ name: "Ada", zip: "02139", addedAt: 46348.5 });
    expect(rows[1].zip).toBe("60201");
    expect(rows[2]).toMatchObject({ unit: "", city: "", zip: "" });
  });

  it("reads the family id and the change date when the header has them", () => {
    const rows = parseValues([
      [...header, "family_id", "updated_at"],
      [46348.5, "Ada", "The Lovelaces", "1428 Maple Ave", "", "Evanston", "IL", "60201", "'f-1", 46349.25],
      [46350, "Cy", "Cy", "2 Oak St", "", "Evanston", "IL", "60201"],
    ]);
    expect(rows[0]).toMatchObject({ familyId: "f-1", updatedAt: 46349.25 });
    expect(rows[1]).toMatchObject({ familyId: "", updatedAt: null });
  });

  it("reads a header with the family id but no change date yet", () => {
    expect(parseValues([[...header, "family_id"], [1, "A", "A", "1 Elm St"]])[0].familyId).toBe("");
  });

  it("stops when a newer column is out of place", () => {
    expect(() => parseValues([[...header, "updated_at", "family_id"]])).toThrow(/header/);
  });

  it("stops when the header is not the one it expects", () => {
    expect(() => parseValues([["added_at", "household", "name"]])).toThrow(/header/);
  });

  it("drops the leading quote that marks text", () => {
    expect(cellText("'02139")).toBe("02139");
    expect(cellText("  plain ")).toBe("plain");
    expect(cellText(undefined)).toBe("");
  });
});

describe("the backup", () => {
  it("writes the date in a form that Sheets reads back", () => {
    // 0.75 days is 18:00, and 0.000006 days is 0.52 seconds, so the time rounds up to the next second.
    expect(serialToText(46000.750006)).toBe("2025-12-09 18:00:01");
    expect(serialToText(null)).toBe("");
  });

  it("writes one CSV line for each row, with quotes where a cell needs them", () => {
    const csv = toCsv([
      { row: 4, addedAt: 46348.5, name: 'Ada "A" L', household: "Ada, Bo", street: "1 Elm St", unit: "", city: "X", state: "IL", zip: "02139", familyId: "f-1", updatedAt: null },
    ]);
    expect(csv).toBe('row,added_at,name,household,street,unit,city,state,zip,family_id,updated_at\n4,2026-11-22 12:00:00,"Ada ""A"" L","Ada, Bo",1 Elm St,,X,IL,02139,f-1,\n');
  });
});
