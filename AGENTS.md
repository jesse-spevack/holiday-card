# AGENTS.md

The guide for agents who work on this repo. `CLAUDE.md` is a symlink to this file.

## What the site does

`hi.verynormal.dev` collects names and mailing addresses for Jesse and Jess's holiday cards.
The hosts ask one question at a time in a pixel-art dialog box. After a guest signs up, their family walks into a pixel-art winter party in our living room.
The room has hidden extras: a photo album, a dreidel game, a passing Waymo, and more.

- What guests see, and the hidden extras: `docs/scope.md`
- The form flow, its copy, and the API contract: `docs/form.md`
- The Apps Script on the contact Sheet: `apps-script/README.md`

The repo is public on GitHub. Anything you commit, anyone can read.

## Map

### Worker (`src/`)

One Cloudflare Worker serves the static files in `public/` and the API. `wrangler.jsonc` sends only `/api/*` and `/album/*` to the Worker first.

| File | Owns |
|---|---|
| `src/worker.ts` | The router and the handlers for each route |
| `src/http.ts` | `HttpError`, JSON replies, field checks, rate limits, and `callService` (one timeout and error shape for every outside service) |
| `src/household.ts` | `POST /api/household`: one OpenRouter call that turns "who lives at your house" into members |
| `src/places.ts` | `GET /api/places` and `GET /api/place`: Google Places address suggestions and details |
| `src/turnstile.ts` | The Turnstile check on `POST /api/submit` |
| `src/sheet.ts` | Sends the contact to the Apps Script, which adds a Sheet row |
| `src/party.ts` | D1: adds a family, reads the party, changes a sprite, the party version |
| `src/album.ts` | `GET /album/list` and `GET /album/<hash>.jpg` from KV |

### Front end (`public/`)

No build step. The browser loads ES modules as they are.

| File | Owns |
|---|---|
| `public/index.html`, `public/style.css` | Markup and the main styles |
| `public/app.js` | The form steps, the party loop, the sprite editor, and the wiring of all modules |
| `public/js/api.js` | Every call to the Worker |
| `public/js/scene.js` | The room canvas, sprites, hosts and their lines (`HOST_LINES`), the door arrival, and the tap areas (`HOTSPOTS`) |
| `public/js/picker.js` | The look picker. Ages and looks come from `public/assets/looks.json` |
| `public/js/pets.js` | Hidden pet reactions |
| `public/js/sound.js` | Sound effects with Web Audio, and the recorded sounds |
| `public/js/night.js`, `public/night.css` | The snowy night, roof, and greeting around the room on a tall screen |
| `public/js/eggs.js` | The Waymo, the shooting star, the menorah, and the floor lamp |
| `public/js/album.js`, `public/js/album-art.js`, `public/album.css` | The hidden photo album |
| `public/js/dreidel.js`, `public/js/dreidel-art.js`, `public/js/dreidel-sound.js`, `public/dreidel.css` | The hidden dreidel game |
| `public/assets/` | `room.png`, `book.png`, `og.png`, `icon.png`, the look sprites in `looks/`, and the sounds in `sounds/` |

### Art (`art/`)

Python scripts with Pillow, run from the repo root. The docstring at the top of each script gives its usage.

| Script | Makes |
|---|---|
| `art/scripts/looks.py` | The one look library: guest looks and host sprites, with the prompts and picks. `gen` asks PixelLab for variations, `add` puts the pick in `public/assets/looks/` and `looks.json`, and `sheet` makes a review sheet |
| `art/scripts/pixellab.py` | The PixelLab calls, the key lookup, and the sprite cleanup that `looks.py` and `props.py` share |
| `art/scripts/props.py` | Prop variations (presents, dreidel) to paint into `public/assets/room.png` by hand |
| `art/scripts/table_wine.py` | The wine bottle and glasses, drawn pixel by pixel on `public/assets/room.png` |
| `art/scripts/book.py` | The photo album sprite on the sofa, `public/assets/book.png` |
| `art/scripts/og.py` | The link preview, `public/assets/og.png`. Run it after each change to the room or the hosts |
| `art/scripts/album.py` | The album photos in KV. See "Data rules" |

`public/assets/` holds the only copy of each image that the site uses. `art/assets/` holds only source art that the site does not serve:
`art/assets/rooms/cabin.png` is the PixelLab style image, and `test/e2e.mjs` uses the sprites in `art/assets/characters/`.

### Other

- `migrations/`: the D1 schema. The tables are `families`, `members`, and `party_version`.
- `apps-script/`: the Apps Script that adds a row to the contact Sheet. Deploy it with `clasp`, see `apps-script/README.md`.
- `test/api.test.ts`: Worker tests in the Workers runtime, with fake outbound calls in `test/outbound.ts`.
- `test/e2e.mjs`: the page in Google Chrome against a fake API. It needs no Cloudflare.
- `scripts/`: `preview.sh`, `deploy.sh`, and the deploy hook `no-direct-deploy.mjs`.

## Commands

```sh
pnpm install        # also runs pnpm types, which makes worker-configuration.d.ts
pnpm dev            # wrangler dev at http://localhost:8787, with local D1 and KV
pnpm test           # Worker tests. Must pass before a PR.
pnpm e2e            # the page in Google Chrome with a fake API. Screenshots go to build/e2e.
pnpm typecheck
pnpm preview        # upload this branch as a preview and print its URL
pnpm run deploy     # main only. See "Deploy".
```

`pnpm deploy` without `run` is a pnpm command, not our script. It does not deploy the site. Always type `pnpm run deploy`.

For `pnpm dev`, copy `.dev.vars.example` to `.dev.vars` and fill in the secrets. The Turnstile values in the example are Cloudflare's test values, which always pass.
To make the local D1 tables, run `pnpm exec wrangler d1 migrations apply holiday-card --local`.

## Check a branch: preview

`pnpm preview` uploads the current checkout as a new Worker version. It does not deploy it. The live site does not change.
The URL is `https://<branch>-holiday-card.jspevack.workers.dev`, with each run of characters other than letters and digits changed to `-`. A second run on the same branch moves the same URL to the new upload.

What a preview is:

- A preview uses the production D1, KV, secrets, and Sheet. It is not a sandbox. A change that a preview makes is a change to real data.
- A sign-up does not work on a preview. The Turnstile widget accepts only `hi.verynormal.dev`, so the widget shows an error on a `workers.dev` URL.
- Do not try to make sign-up work on a preview. A sign-up that works on a preview writes a real row to the Sheet and a real family to the party.
- The room, the party, the album, and the hidden extras work on a preview.
- A preview is public. Anyone with the URL can open it.
- A branch with a new migration cannot get its schema on a preview. Never apply a migration to the production D1 from a branch.

To check sign-up, use `pnpm dev` with the test keys, or `pnpm e2e`.

## Deploy

Only the orchestrator deploys, and only from main after a merge.

`pnpm run deploy` runs `scripts/deploy.sh`. It refuses unless all of these are true:

- The branch is `main`.
- `git status` is clean.
- HEAD equals `origin/main` after a fetch.
- The checkout has no merge conflict markers.
- `pnpm test` passes.

Never run `wrangler deploy`, `wrangler versions deploy`, or `wrangler triggers deploy` yourself. A deploy from a branch replaces the whole live site with that branch, and merged work from other agents disappears.
A Claude Code hook in `.claude/settings.json` stops these commands.

To apply a new migration after its PR merges, run `pnpm db:migrate` on main, before `pnpm run deploy`.

`wrangler secret put` fails when the newest uploaded version is not the deployed version, and a preview is such a version. Use `pnpm exec wrangler versions secret put <NAME>`, then deploy main.

## Data rules

- The Google Sheet holds only the contact list: name, household, and mailing address. Party data never goes to the Sheet.
- D1 holds the party: families, members, looks, and chat bubbles. The party API never returns an address or the household text.
- KV (`ALBUM`) holds the photo album: web copies of the photos and the page list.
- Photos and captions NEVER go in git. The repo is public, and the original photos hold GPS data.
  The originals and `captions.json` stay in `~/Pictures/holiday-card-album/`. `python3 art/scripts/album.py` strips the metadata and uploads them.
- Never commit a screenshot that shows a real guest's name, address, or family. Use `pnpm e2e` or `pnpm dev` data for screenshots.
- To hide a family or a chat bubble, set `families.hidden` or `members.bubble_hidden` to 1 in D1. There is no admin page yet.

## Secrets and bindings

Never write a secret value in a file in this repo. Names only.

| Name | Kind | Where the value lives |
|---|---|---|
| `OPENROUTER_API_KEY` | Worker secret | 1Password vault `keys`, item `Holiday card`, field `credential` |
| `TURNSTILE_SECRET` | Worker secret | 1Password vault `keys`, item `Holiday card`, field `TURNSTILE_SECRET` |
| `GOOGLE_PLACES_KEY` | Worker secret | Google Cloud project `very-normal`, API key `holiday-card-places` |
| `SHEET_SECRET` | Worker secret | Also `SHARED_SECRET` in `apps-script/Secret.js`, which git ignores. `clasp pull` gets it back. |
| `OPENROUTER_MODEL`, `SHEET_URL`, `TURNSTILE_SITE_KEY` | Vars in `wrangler.jsonc` | Public values |
| `DB` | D1 binding | Database `holiday-card` |
| `ALBUM` | KV binding | Namespace `holiday-card-album` |
| `PLACES_LIMIT`, `WRITE_LIMIT`, `HOUSEHOLD_LIMIT`, `SPRITE_LIMIT` | Rate limit bindings | `wrangler.jsonc` |
| `PIXELLAB_KEY` | Env var for the art scripts | 1Password vault `keys`, item `CozyChat`, field `PIXEL_LAB_KEY`. `pixellab.py` reads it with `op read` when the env var is not set |
| Retro Diffusion key | No script uses it now | 1Password vault `keys`, item `CozyChat`, field `RETRO_DIFFUSION_KEY` |

Google Cloud caps Places at 500 suggestions and 200 address lookups a day. A preview and `pnpm dev` with a real key use the same quota.

`worker-configuration.d.ts` is generated, and git ignores it. `pnpm types` makes it again after a change to `wrangler.jsonc`.
A new secret goes in `secrets.required` in `wrangler.jsonc`, in `.dev.vars.example`, and in the table above.

## Working rules

- Make a worktree for each change: `git worktree add -b <type>/<name> ~/code/holiday-card-<name> origin/main`. Never commit to main.
- One branch, one PR, squash merge. Do not merge your own PR unless the orchestrator tells you to.
- Commits use semantic prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- There are no GitHub Actions. You run the checks: `pnpm test`, and `pnpm e2e` for a page change.
- Check a branch with `pnpm preview`. Never deploy a branch.
- Delete files with `/usr/bin/trash`. Never use `rm -rf`.
- Remove your worktree with `git worktree remove` after the PR merges.
- Write in ASD-STE100 Simplified Technical English: active voice, short sentences, one idea in a sentence. This applies to code comments, commits, PRs, and docs.
- Never use an em dash. Use a plain dash "-".
- No attribution lines: no Co-Authored-By, no session links, no "Generated with" footers.

### PR body

Title: `Type - a clause that says what guests can do now`, for example `Fix - the snowy roof stays put on a tall phone`.

Sections, in this order:

1. **Summary**: what was wrong or missing, and what is true now. One to three sentences.
2. **Background**: one sentence on the old behavior and why.
3. **New**: one sentence on the new behavior. Then a mermaid diagram of 5 to 10 nodes that marks the changed node. Then a short technical description that names the one or two files that matter.
4. **Decisions**: bullets, the one that most needs review first. Each bullet says the decision, the alternative, and why.
5. **Screenshots**: for a UI change, a Before and After table at 1440 and 400 wide. Say which commit and which server each side came from.
6. **AGENTS**: what a future agent needs: the test that proves it, traps, the risk, and the tests that catch a regression.

### Screenshots in a PR

Do not commit screenshots to your branch. A squash merge puts them on main for good.
Push them to the `screenshots` branch, in a folder with your branch name, and link to the raw file:

```sh
git fetch origin screenshots
git worktree add ~/code/holiday-card-shots screenshots
# Copy the PNG files into ~/code/holiday-card-shots/<your-branch>/, then:
git -C ~/code/holiday-card-shots add -A
git -C ~/code/holiday-card-shots commit -m "docs: screenshots for <your-branch>"
git -C ~/code/holiday-card-shots push origin screenshots
git worktree remove ~/code/holiday-card-shots
```

`https://raw.githubusercontent.com/jesse-spevack/holiday-card/screenshots/<your-branch>/<file>.png`

Never delete the `screenshots` branch. Old PRs link to it.
