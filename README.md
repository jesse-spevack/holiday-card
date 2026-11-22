# holiday-card

Collects names and addresses for holiday cards at `hi.verynormal.dev`. Each family that signs up
joins a pixel-art winter + Hanukkah cabin party.

- Scope: `docs/scope.md`
- The Worker and its API: `src/`. The page: `public/`. The party database: `migrations/`.
- The contact list Sheet and its Apps Script: `apps-script/`
- Art and the scripts that make it: `art/`

## Work on it

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the secrets
pnpm test
pnpm typecheck
pnpm deploy
```

Secrets in production: `OPENROUTER_API_KEY`, `GOOGLE_PLACES_KEY`, `SHEET_SECRET`, `TURNSTILE_SECRET`.
Set them with `wrangler secret put`.
