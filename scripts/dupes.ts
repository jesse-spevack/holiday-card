// The pure rules of `pnpm sheet:dupes`: the address key, the duplicate groups, the kept row, and the delete requests.
// It has no I/O, so test/sheet-dupes.test.ts tests it. scripts/sheet-dupes.mjs reads and changes the Sheet.

export const HEADERS = ["added_at", "name", "household", "street", "unit", "city", "state", "zip"] as const;

export type Contact = {
  row: number; // The row number in the Sheet. Row 1 is the header.
  addedAt: number | null; // A Sheets serial date: days since 1899-12-30, in the time zone of the Sheet.
  name: string;
  household: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

export type Group = {
  key: string;
  keep: Contact;
  remove: Contact[]; // Lowest row first.
  namesDiffer: boolean;
  householdsDiffer: boolean;
};

export type SameName = { name: string; rows: Contact[] };

export type Report = {
  groups: Group[];
  sameName: SameName[]; // Report only: one name at two or more addresses.
  skipped: Contact[]; // Rows with no street. They are in no group.
};

// USPS abbreviations for street types and other address words.
// "saint" and "street" both become "st", so "St Marks Pl" and "Saint Marks Place" agree.
const WORDS: Record<string, string> = {
  street: "st", str: "st", saint: "st",
  avenue: "ave", av: "ave", avn: "ave", aven: "ave",
  road: "rd", drive: "dr", drv: "dr", boulevard: "blvd", boul: "blvd",
  lane: "ln", court: "ct", place: "pl", terrace: "ter", terr: "ter",
  circle: "cir", parkway: "pkwy", pky: "pkwy", highway: "hwy", hiway: "hwy",
  square: "sq", trail: "trl", alley: "aly", crescent: "cres", expressway: "expy",
  freeway: "fwy", heights: "hts", plaza: "plz", ridge: "rdg", center: "ctr",
  centre: "ctr", crossing: "xing", point: "pt", mount: "mt", fort: "ft",
  route: "rte", turnpike: "tpke", junction: "jct", creek: "crk", canyon: "cyn",
  estates: "est", village: "vlg", valley: "vly", meadows: "mdws", grove: "grv",
  harbor: "hbr", island: "is", lake: "lk",
  north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
  floor: "fl", building: "bldg", bld: "bldg", room: "rm", penthouse: "ph",
};

// Words that mean "the unit number follows". Each one becomes "#".
const UNIT_WORDS = new Set(["#", "apt", "apartment", "unit", "suite", "ste"]);

// Other words that start the second line of an address. A unit with one of them gets no "#".
const SECOND_LINE = new Set(["fl", "bldg", "rm", "ph", "lot", "trlr", "spc", "dept", "bsmt", "rear", "frnt"]);

const STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co",
  connecticut: "ct", delaware: "de", "district of columbia": "dc", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky",
  louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn",
  mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd",
  tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
  "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "puerto rico": "pr",
};

// Lower case, no accents, no periods or apostrophes, no hyphens, and one space between words.
// A hyphen joins its two sides, so "4-B" and "4B" agree. "#" stays a word of its own.
export function clean(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/#/g, " # ")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(text: string): string[] {
  const s = clean(text)
    .replace(/\bpost office box\b/g, "po box")
    .replace(/\bp o box\b/g, "po box")
    .replace(/\bpobox\b/g, "po box");
  return s ? s.split(" ").map((w) => (UNIT_WORDS.has(w) ? "#" : (WORDS[w] ?? w))) : [];
}

// After the first "#", the unit is one word: "Apt 4 B", "#4B", and "Unit 4-b" all become "# 4b".
function joinUnit(list: string[]): string[] {
  const at = list.indexOf("#");
  if (at < 0) return list;
  const unit = list.slice(at + 1).filter((w) => w !== "#").join("");
  return unit ? [...list.slice(0, at), "#", unit] : list.slice(0, at);
}

// The street and the unit as one line, for example "123 main st # 4b".
// A guest can type the unit in the street, in the unit, or in both. All three give the same line.
export function streetLine(street: string, unit: string): string {
  const head = joinUnit(words(street));
  let second = words(unit);
  if (second.length && second[0] !== "#" && !SECOND_LINE.has(second[0])) second = ["#", ...second];
  const tail = joinUnit(second);
  const repeats = tail.length > 0 && head.slice(-tail.length).join(" ") === tail.join(" ");
  return joinUnit(repeats ? head : [...head, ...tail]).join(" ");
}

// The first five digits of a US ZIP code, or null for an other postal code.
// A ZIP of 3 or 4 digits lost its leading zeros in a number cell, so it gets them back.
export function zip5(zip: string): string | null {
  const s = zip.trim();
  const us = /^(\d{5})(?:[\s-]?\d{4})?$/.exec(s);
  if (us) return us[1];
  if (/^\d{3,4}$/.test(s)) return s.padStart(5, "0");
  return null;
}

export function stateCode(state: string): string {
  const s = clean(state);
  return STATES[s] ?? s;
}

// Two rows with the same key go to the same mailbox.
// With a US ZIP, the key is the street line and the ZIP, because a city can have more than one name.
// With no US ZIP, the key also holds the city, the state, and the postal code.
export function addressKey(c: Contact): string {
  const line = streetLine(c.street, c.unit);
  const zip = zip5(c.zip);
  if (zip) return `${line} | ${zip}`;
  return [line, words(c.city).join(" "), stateCode(c.state), clean(c.zip).replace(/ /g, "")].join(" | ");
}

export function nameKey(name: string): string {
  return clean(name);
}

// The newest row stays: a guest who signs up again likely gave new data.
// A row with no date is the oldest. For two equal dates, the row nearer the bottom is newer, because the Sheet adds rows at the bottom.
export function newest(rows: Contact[]): Contact {
  const time = (c: Contact) => c.addedAt ?? -Infinity;
  return rows.reduce((best, c) => (time(c) > time(best) || (time(c) === time(best) && c.row > best.row) ? c : best));
}

function bucket(rows: Contact[], key: (c: Contact) => string): Map<string, Contact[]> {
  const map = new Map<string, Contact[]>();
  for (const c of rows) {
    const k = key(c);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return map;
}

function distinct(rows: Contact[], key: (c: Contact) => string): number {
  return new Set(rows.map(key)).size;
}

export function findDuplicates(contacts: Contact[]): Report {
  const skipped = contacts.filter((c) => !clean(c.street));
  const rows = contacts.filter((c) => clean(c.street));

  const groups: Group[] = [];
  for (const [key, list] of bucket(rows, addressKey)) {
    if (list.length < 2) continue;
    const keep = newest(list);
    groups.push({
      key,
      keep,
      remove: list.filter((c) => c !== keep).sort((a, b) => a.row - b.row),
      namesDiffer: distinct(list, (c) => nameKey(c.name)) > 1,
      householdsDiffer: distinct(list, (c) => clean(c.household)) > 1,
    });
  }
  const top = (g: Group) => Math.min(g.keep.row, ...g.remove.map((c) => c.row));
  groups.sort((a, b) => top(a) - top(b));

  const sameName: SameName[] = [];
  for (const [name, list] of bucket(rows, (c) => nameKey(c.name))) {
    if (distinct(list, addressKey) > 1) sameName.push({ name, rows: list });
  }

  return { groups, sameName, skipped };
}

// One deleteDimension request for each row, from the bottom row up.
// Each delete then leaves the row numbers of the next deletes as they were.
export function deleteRequests(sheetId: number, rows: number[]) {
  const sorted = [...new Set(rows)].sort((a, b) => b - a);
  if (sorted.some((r) => !Number.isInteger(r) || r < 2)) throw new Error("deleteRequests: a row must be 2 or more. Row 1 is the header.");
  return sorted.map((r) => ({
    deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } },
  }));
}

// A Sheets serial date as "YYYY-MM-DD HH:MM:SS", in the time zone of the Sheet. Sheets reads this form back as a date.
export function serialToText(serial: number | null): string {
  if (serial === null || !Number.isFinite(serial)) return "";
  const ms = Math.round((serial - 25569) * 86400) * 1000; // Sheets rounds to the nearest second.
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

// A cell from the Sheets API as text. A leading quote marks text in Sheets, so it goes.
export function cellText(value: unknown): string {
  const s = String(value ?? "").trim();
  return s.startsWith("'") ? s.slice(1).trim() : s;
}

// Rows from the values API, header first, as contacts. The API leaves out empty cells at the end of a row.
export function parseValues(values: unknown[][]): Contact[] {
  const [header = [], ...rest] = values;
  const got = header.map(cellText);
  if (got.slice(0, HEADERS.length).join(",") !== HEADERS.join(",")) {
    throw new Error(`The header of the Contacts tab is "${got.join(",")}". The script expects "${HEADERS.join(",")}".`);
  }
  const contacts: Contact[] = [];
  rest.forEach((cells, i) => {
    if (!cells.some((v) => cellText(v))) return;
    const [added, name, household, street, unit, city, state, zip] = HEADERS.map((_, k) => cells[k]);
    contacts.push({
      row: i + 2,
      addedAt: typeof added === "number" ? added : null,
      name: cellText(name),
      household: cellText(household),
      street: cellText(street),
      unit: cellText(unit),
      city: cellText(city),
      state: cellText(state),
      zip: cellText(zip),
    });
  });
  return contacts;
}

// The CSV of a backup: the row number, then the columns of the Sheet.
export function toCsv(contacts: Contact[]): string {
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [["row", ...HEADERS].join(",")];
  for (const c of contacts) {
    const cells = [String(c.row), serialToText(c.addedAt), c.name, c.household, c.street, c.unit, c.city, c.state, c.zip];
    lines.push(cells.map(quote).join(","));
  }
  return lines.join("\n") + "\n";
}
