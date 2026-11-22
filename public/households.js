// The households this browser added. The edit token lets this browser change its own sprites.
const STORAGE_KEY = "holiday-card:households";

let households = read();

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function myHouseholds() {
  return households;
}

export function rememberHousehold({ familyId, token, household, members }) {
  households = [...households, { familyId, token, household, memberIds: members.map((m) => m.id) }];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(households));
  } catch {}
}

export function tokenFor(memberId) {
  return households.find((h) => h.memberIds.includes(memberId))?.token ?? null;
}
