import { HttpError } from "./http";

const BASE = "https://places.googleapis.com/v1";

export type Suggestion = { placeId: string; main: string; secondary: string };
export type Address = { street: string; unit: string; city: string; state: string; zip: string };

type Prediction = {
  placePrediction?: {
    placeId: string;
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
};

type Component = { longText?: string; shortText?: string; types?: string[] };

export async function suggestAddresses(env: Env, input: string, sessionToken: string): Promise<Suggestion[]> {
  const response = await fetch(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["us"],
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    }),
  });
  if (!response.ok) throw placesError(response.status, await response.text());

  const { suggestions = [] } = (await response.json()) as { suggestions?: Prediction[] };
  return suggestions.flatMap(({ placePrediction: p }) =>
    p ? [{ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }] : [],
  );
}

export async function lookUpAddress(env: Env, placeId: string, sessionToken: string): Promise<Address> {
  if (!/^[\w-]{1,300}$/.test(placeId)) throw new HttpError(400, "bad_place_id");
  const url = `${BASE}/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const response = await fetch(url, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "addressComponents" },
  });
  if (!response.ok) throw placesError(response.status, await response.text());

  const { addressComponents = [] } = (await response.json()) as { addressComponents?: Component[] };
  return toAddress(addressComponents);
}

export function toAddress(components: Component[]): Address {
  const find = (type: string, form: "longText" | "shortText" = "longText") =>
    components.find((c) => c.types?.includes(type))?.[form] ?? "";
  return {
    street: [find("street_number"), find("route")].filter(Boolean).join(" "),
    unit: find("subpremise"),
    city: find("locality") || find("sublocality") || find("neighborhood") || find("postal_town"),
    state: find("administrative_area_level_1", "shortText"),
    zip: find("postal_code"),
  };
}

function placesError(status: number, body: string): HttpError {
  console.error("places_failed", status, body.slice(0, 300));
  return new HttpError(status === 429 ? 429 : 502, "places_failed");
}
