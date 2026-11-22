#!/usr/bin/env bash
# Prints which hidden extras each family plays with, and a total for each extra. It only reads D1.
#   pnpm interactions            the production D1
#   pnpm interactions --local    the local D1 of pnpm dev
# The times are UTC.
set -euo pipefail
cd "$(dirname "$0")/.."

where="${1:---remote}"
if [[ "$where" != "--remote" && "$where" != "--local" ]]; then
  echo "interactions: use --remote (the default) or --local." >&2
  exit 1
fi

# Two SELECT statements in one call. wrangler prints one JSON result for each statement.
pnpm exec wrangler d1 execute holiday-card "$where" --json --command "
  SELECT f.id, f.household, i.egg, i.count, i.last_at FROM interactions i JOIN families f ON f.id = i.family_id
    ORDER BY f.household, f.id, i.count DESC, i.egg;
  SELECT egg, SUM(count) AS taps, COUNT(*) AS families, MAX(last_at) AS last_at FROM interactions
    GROUP BY egg ORDER BY taps DESC, egg;" |
  node -e '
    let input = "";
    process.stdin.on("data", (c) => (input += c)).on("end", () => {
      const [families, eggs] = JSON.parse(input).map((r) => r.results);
      const row = (cells, widths) => cells.map((c, i) => String(c).padEnd(widths[i])).join("  ").trimEnd();
      if (!families.length) return console.log("No interactions yet.");
      console.log("Each family (the name on the envelope), times in UTC:");
      let last = null;
      for (const r of families) {
        if (r.id !== last) console.log(`\n${r.household}`);
        last = r.id;
        console.log("  " + row([r.egg, r.count, r.last_at], [10, 6, 19]));
      }
      console.log("\nEach egg:");
      console.log("  " + row(["egg", "taps", "families", "last (UTC)"], [10, 6, 9, 19]));
      for (const r of eggs) console.log("  " + row([r.egg, r.taps, r.families, r.last_at], [10, 6, 9, 19]));
    });'
