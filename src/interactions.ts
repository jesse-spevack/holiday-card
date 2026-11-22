import { HttpError } from "./http";
import { checkToken } from "./party";

// The hidden extras that the page reports. A name that is not here gets a 400.
// "presents" and "plants" are for the extras that come next.
export const EGGS = ["album", "cybertruck", "dreidel", "lamp", "menorah", "pets", "plants", "presents", "silly", "star", "toast", "waymo"] as const;
export type Egg = (typeof EGGS)[number];

export function isEgg(value: unknown): value is Egg {
  return typeof value === "string" && (EGGS as readonly string[]).includes(value);
}

// The first interaction adds a row with count 1. Each next one adds 1 and moves last_at.
export async function recordInteraction(db: D1Database, familyId: string, token: string, egg: Egg) {
  await checkToken(db, familyId, token);
  await db
    .prepare(
      `INSERT INTO interactions (family_id, egg, count) VALUES (?, ?, 1)
       ON CONFLICT (family_id, egg) DO UPDATE SET count = count + 1, last_at = datetime('now')`,
    )
    .bind(familyId, egg)
    .run();
}

export function readEgg(body: Record<string, unknown>): Egg {
  if (!isEgg(body.egg)) throw new HttpError(400, "bad_egg");
  return body.egg;
}
