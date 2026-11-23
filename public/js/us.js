// The rule for a US mailing address. We mail cards inside the US only.
// The page (app.js), the Worker (src/address.ts), and the scripts share this one file, so the rule is the same everywhere.
// It has no imports and no I/O.

// The states, DC, the territories, and the military mail codes.
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "VI", "GU", "AS", "MP", "AA", "AE", "AP",
];

const STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "district of columbia",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming", "puerto rico", "guam", "us virgin islands", "american samoa",
];

// Countries that a guest is likely to type at the end of an address outside the US.
const COUNTRIES = [
  "canada", "mexico", "united kingdom", "uk", "england", "scotland", "wales", "ireland", "northern ireland", "france",
  "germany", "deutschland", "spain", "españa", "espana", "portugal", "italy", "italia", "netherlands", "holland", "belgium",
  "switzerland", "austria", "denmark", "sweden", "norway", "finland", "iceland", "poland", "czechia", "czech republic",
  "greece", "turkey", "israel", "india", "china", "japan", "korea", "south korea", "singapore", "hong kong", "taiwan",
  "australia", "new zealand", "brazil", "brasil", "argentina", "chile", "colombia", "peru", "costa rica", "south africa",
  "philippines", "thailand", "vietnam", "indonesia", "united arab emirates", "uae",
];

const ZIP = /^\d{5}(?:-?\d{4})?$/;
const words = (text) => ` ${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const has = (text, phrase) => words(text).includes(` ${phrase} `);

// A state code in capitals anywhere ("Ely MN, 55731"), or in any case at the end ("ely, mn 55731 usa").
function namesState(text) {
  const raw = String(text);
  if (raw.match(/\b[A-Z]{2}\b/g)?.some((code) => US_STATES.includes(code))) return true;
  const end = /\b([a-z]{2})\.?(?:[\s,]+\d{5}(?:-?\d{4})?)?(?:[\s,]+(?:usa|us|united states(?: of america)?))?[\s.]*$/i.exec(raw);
  if (end && US_STATES.includes(end[1].toUpperCase())) return true;
  return STATE_NAMES.some((name) => has(raw, name));
}

// Why an address is not a US mailing address, or null when it is one.
//   "not_us": a state, a ZIP, or a country from outside the US.
//   "no_state": an address typed by hand that names no US state, so we cannot tell where it goes.
// A picked address has a state and a ZIP. A typed address has only the street, with the rest of the address in it.
export function usAddressProblem({ street = "", city = "", state = "", zip = "" } = {}) {
  const st = String(state).trim();
  const code = st.toUpperCase().replace(/\./g, "");
  if (st && !US_STATES.includes(code) && !STATE_NAMES.includes(st.toLowerCase())) return "not_us";
  if (String(zip).trim() && !ZIP.test(String(zip).trim())) return "not_us";
  const text = `${street} ${city}`;
  if (COUNTRIES.some((country) => has(text, country))) return "not_us";
  if (!st && !namesState(text)) return "no_state";
  return null;
}

// What the hosts say about each problem.
export const US_LINES = {
  not_us: "Sorry, we can only mail cards inside the US.",
  no_state: "Add the city and state, like Ely, MN. We can only mail cards inside the US.",
};
