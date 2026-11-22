# holiday-card

Collects names and addresses for holiday cards at `hi.verynormal.dev`. Each family that signs up
joins a pixel-art winter holiday party in our living room.

- Scope: `docs/scope.md`
- The form and its API contract: `docs/form.md`. Copy: `docs/copy.md`.
- The Worker: `src/`. The page: `public/`. The party database: `migrations/`.
- The contact list Sheet and its Apps Script: `apps-script/`
- Art and the scripts that make it: `art/`

## Work on it

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the secrets
pnpm test
pnpm e2e        # needs Google Chrome
pnpm typecheck
pnpm deploy
```

Secrets in production: `OPENROUTER_API_KEY`, `GOOGLE_PLACES_KEY`, `SHEET_SECRET`, `TURNSTILE_SECRET`.
Set them with `wrangler secret put`.
