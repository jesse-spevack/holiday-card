import { HttpError } from "./http";

const BASE = "https://places.googleapis.com/v1";
const MAX_SUGGESTIONS = 5;

export type Suggestion = { id: string; main: string; secondary: string };
export type Address = { street: string; city: string; state: string; zip: string; formatted: string };

type Prediction = {
  placePrediction?: {
    placeId: string;
    text?: { text?: string };
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
      sessionToken: sessionToken || undefined,
      includedRegionCodes: ["us"],
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    }),
  });
  if (!response.ok) throw placesError(response.status, await response.text());

  const { suggestions = [] } = (await response.json()) as { suggestions?: Prediction[] };
  return suggestions
    .flatMap(({ placePrediction: p }) =>
      p
        ? [{ id: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }]
        : [],
    )
    .slice(0, MAX_SUGGESTIONS);
}

export async function lookUpAddress(env: Env, placeId: string, sessionToken: string): Promise<Address> {
  if (!/^[\w-]{1,300}$/.test(placeId)) throw new HttpError(400, "bad_place_id");
  const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const response = await fetch(`${BASE}/places/${placeId}${query}`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "addressComponents,formattedAddress" },
  });
  if (!response.ok) throw placesError(response.status, await response.text());

  const place = (await response.json()) as { addressComponents?: Component[]; formattedAddress?: string };
  return toAddress(place.addressComponents ?? [], place.formattedAddress ?? "");
}

export function toAddress(components: Component[], formatted: string): Address {
  const find = (type: string, form: "longText" | "shortText" = "longText") =>
    components.find((c) => c.types?.includes(type))?.[form] ?? "";
  const street = [find("street_number"), find("route", "shortText") || find("route")].filter(Boolean).join(" ");
  return {
    street: street || formatted.split(",")[0] || "",
    city: find("locality") || find("postal_town") || find("sublocality") || find("administrative_area_level_3"),
    state: find("administrative_area_level_1", "shortText"),
    zip: find("postal_code"),
    formatted,
  };
}

function placesError(status: number, body: string): HttpError {
  console.error("places_failed", status, body.slice(0, 300));
  return new HttpError(status === 429 ? 429 : 502, "places_failed");
}
