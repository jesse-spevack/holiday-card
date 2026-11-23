#!/usr/bin/env bash
# Prints the newest rows of the error log, newest first. It only reads D1.
#   pnpm errors                 the last 50 rows of the production D1
#   pnpm errors 200             the last 200 rows
#   pnpm errors --local         the local D1 of pnpm dev
# The times are UTC. src/log.ts writes the rows. A row holds codes and flags only, no guest data.
set -euo pipefail
cd "$(dirname "$0")/.."

where="--remote"
limit=50
for arg in "$@"; do
  case "$arg" in
    --remote | --local) where="$arg" ;;
    *[!0-9]* | "") echo "errors: use a number of rows, --remote (the default), or --local." >&2; exit 1 ;;
    *) limit="$arg" ;;
  esac
done

pnpm exec wrangler d1 execute holiday-card "$where" --json --command "
  SELECT at, source, route, code, status, ua, country, family_id, version, detail FROM errors ORDER BY id DESC LIMIT $limit;" |
  node -e '
    let input = "";
    process.stdin.on("data", (c) => (input += c)).on("end", () => {
      const rows = JSON.parse(input)[0].results;
      if (!rows.length) return console.log("No errors yet.");
      const widths = [19, 6, 26, 22, 6, 22, 7, 8];
      const row = (cells) => cells.map((c, i) => String(c ?? "").slice(0, widths[i]).padEnd(widths[i])).join("  ").trimEnd();
      console.log(row(["at (UTC)", "source", "route or step", "code", "status", "browser", "country", "family"]));
      for (const r of rows) {
        console.log(row([r.at.slice(0, 19), r.source, r.route, r.code, r.status, r.ua, r.country, r.family_id?.slice(0, 8)]));
        const detail = (r.detail || "").split("\n")[0].trim();
        if (detail && detail !== "{}") console.log(`  ${detail.slice(0, 140)}${r.version ? `  (version ${r.version})` : ""}`);
      }
    });'
