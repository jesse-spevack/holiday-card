// The rules of `pnpm invite`, with made-up friends. No test writes D1 or the Sheet.
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/party";
import {
  SHEET_HEADERS,
  cleanFriend,
  deleteSql,
  friendProblem,
  insertSql,
  inviteLink,
  listText,
  newInvite,
  parseCsv,
  readFriends,
  sheetRow,
  sheetTime,
} from "../scripts/invites";

const HEADER = "name,household,street,unit,city,state,zip";

describe("the CSV", () => {
  it("reads quotes, commas and line breaks inside quotes, and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n"x\ny",,z\n\n')).toEqual([["a", "b, c", 'say "hi"'], ["x\ny", "", "z"]]);
  });

  it("reads each friend by the header, in any column order", () => {
    const { friends, problems } = readFriends(`household,name,street,unit,city,state,zip\nThe Lovelaces,"Ada, Bo",77 Fifth Ave,Apt 3,New York,ny,10003\n`);
    expect(problems).toEqual([]);
    expect(friends).toEqual([{ name: "Ada, Bo", household: "The Lovelaces", street: "77 Fifth Ave", unit: "Apt 3", city: "New York", state: "NY", zip: "10003" }]);
  });

  it("names each bad line, and never its address", () => {
    const { friends, problems } = readFriends(
      [HEADER, ",,1 Elm St,,Denver,CO,80203", "Ada,The Lovelaces,,,,,", "Bo,The Bos,10 Baker St,,London,,NW1 6XE", "Cy,The Cys,55 King St W,,Toronto,ON,M5K 1A1", "Di,The Dis,9 Elm St,,Denver,CO,80203"].join("\n"),
    );
    expect(friends.map((f) => f.household)).toEqual(["The Dis"]);
    expect(problems).toEqual([
      "Line 2: no envelope name (household).",
      "Line 3: no street.",
      "Line 4: not a US address.",
      "Line 5: not a US address.",
    ]);
    expect(problems.join(" ")).not.toMatch(/Baker|King|Elm/);
  });

  it("asks for every column in the header", () => {
    expect(readFriends("household,street\nA,1 Elm St").problems[0]).toMatch(/It has no name, unit, city, state, zip/);
  });

  it("checks a friend from the prompts the same way", () => {
    expect(friendProblem(cleanFriend({ household: "The Dis", street: "9 Elm St", city: "Denver", state: "co", zip: "80203" }))).toBe(null);
    expect(friendProblem(cleanFriend({ household: "The Dis", street: "9 Elm St, Denver" }))).toBe("no US state");
  });
});

describe("a new invite", () => {
  const friend = cleanFriend({ household: "The O'Neils", street: "9 Elm St", city: "Denver", state: "CO", zip: "02139" });

  it("has a token of 256 random bits, and its hash is the one the Worker checks", async () => {
    const a = await newInvite(friend);
    const b = await newInvite(friend);
    expect(a.token).toMatch(/^[\w-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.id).not.toBe(b.id);
    expect(a.hash).toBe(await sha256(a.token));
  });

  it("puts only the id, the hash, and the envelope name in D1, with quotes escaped", async () => {
    const v = await newInvite(friend);
    const text = insertSql([v]);
    expect(text).toBe(`INSERT INTO invites (id, token_hash, envelope) VALUES ('${v.id}', '${v.hash}', 'The O''Neils');\n`);
    expect(text).not.toMatch(/Elm|02139|Denver/);
    expect(text).not.toContain(v.token);
    expect(deleteSql([v])).toBe(`DELETE FROM invites WHERE id IN ('${v.id}');\n`);
  });

  it("makes an invited Sheet row with the invite id as its family_id, every value as text", async () => {
    const v = await newInvite(friend);
    const row = sheetRow(v, "2026-11-23 10:00:00");
    expect(row).toHaveLength(SHEET_HEADERS.length);
    expect(row).toEqual(["2026-11-23 10:00:00", "", "'The O'Neils", "'9 Elm St", "", "'Denver", "'CO", "'02139", `'${v.id}`, "", "invited"]);
  });

  it("puts the token after # in the link, so no server sees it", () => {
    expect(inviteLink("abc")).toBe("https://hi.verynormal.dev/#invite=abc");
  });
});

describe("the helpers", () => {
  it("writes the time in the time zone of the Sheet", () => {
    expect(sheetTime(new Date("2026-11-23T17:05:09Z"), "America/Denver")).toBe("2026-11-23 10:05:09");
  });

  it("lists the envelope name and the status, and the new name after a confirm", () => {
    const text = listText([
      { envelope: "The Lovelaces", name: null, created_at: "2026-11-23 10:00:00", confirmed_at: null },
      { envelope: "The Bos", name: "Bo & Cy", created_at: "2026-11-23 10:00:00", confirmed_at: "2026-11-24 09:00:00" },
    ]);
    expect(text).toContain("The Lovelaces  invited");
    expect(text).toContain("Bo & Cy        confirmed 2026-11-24");
    expect(text).toContain("2 invites. 1 confirmed.");
    expect(listText([])).toBe("No invites yet.");
  });
});
