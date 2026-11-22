#!/usr/bin/env bash
# Deploys main to hi.verynormal.dev. It refuses unless the checkout is exactly origin/main and the tests pass.
# Use pnpm preview to check a branch. Never deploy a branch.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "deploy: $1" >&2
  exit 1
}

[[ "$(git branch --show-current)" == "main" ]] || fail "the branch is not main. Use pnpm preview to check a branch."
[[ -z "$(git status --porcelain)" ]] || fail "git status is not clean. Commit or remove the changes first."
git fetch --quiet origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "HEAD is not origin/main. Run git pull --ff-only first."
if git grep -nE '^(<<<<<<<|>>>>>>>)( |$)' -- . >/dev/null; then
  fail "the checkout has merge conflict markers."
fi
pnpm test || fail "pnpm test failed."

pnpm exec wrangler deploy --message "main at $(git rev-parse --short HEAD)"
