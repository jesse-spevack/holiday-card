import { usAddressProblem } from "../public/js/us.js";
import { HttpError, field } from "./http";
import type { Address } from "./sheet";

// The mailing address in a request body. A picked address has a city, a state, and a ZIP.
// An address typed by hand has only the street, with the rest of the address in it.
// We mail cards inside the US only, so an address outside the US fails with 422 and the reason (public/js/us.js).
export function readAddress(raw: unknown): Address {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const address = {
    street: field(body, "street", { max: 300 }),
    unit: field(body, "unit", { max: 50, required: false }),
    city: field(body, "city", { max: 100, required: false }),
    state: field(body, "state", { max: 40, required: false }),
    zip: field(body, "zip", { max: 20, required: false }),
  };
  const problem = usAddressProblem(address);
  if (problem) throw new HttpError(422, problem);
  return address;
}
