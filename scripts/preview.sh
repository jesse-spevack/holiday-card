#!/usr/bin/env bash
# Uploads the current checkout as a preview of the Worker and prints its URL.
# A preview never changes hi.verynormal.dev. It uses the production D1, KV, secrets, and Sheet.
set -euo pipefail
cd "$(dirname "$0")/.."

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "preview: HEAD is detached. Check out a branch first." >&2
  exit 1
fi

# The URL is <alias>-holiday-card.<subdomain>.workers.dev, and a DNS label holds at most 63 characters.
alias="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//')"
[[ "$alias" =~ ^[a-z] ]] || alias="b-$alias"
alias="$(printf '%s' "${alias:0:50}" | sed -E 's/-+$//')"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "preview: the preview includes changes that you did not commit." >&2
fi

sha="$(git rev-parse --short HEAD)"
log="$(mktemp)"
trap '/usr/bin/trash "$log" 2>/dev/null || true' EXIT

pnpm exec wrangler versions upload --preview-alias "$alias" --tag "$sha" --message "preview $branch at $sha" | tee "$log"

url="$(grep -Eo 'https://[^ ]+' "$log" | grep -E "^https://$alias-" | tail -1 || true)"
if [[ -z "$url" ]]; then
  echo "preview: wrangler printed no preview URL. Check that preview_urls is true in wrangler.jsonc and on the Worker." >&2
  exit 1
fi
echo
echo "Preview of $branch at $sha: $url"
