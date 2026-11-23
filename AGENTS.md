# AGENTS.md

The guide for agents who work on this repo. `CLAUDE.md` is a symlink to this file.

## What the site does

`hi.verynormal.dev` collects names and mailing addresses for Jesse and Jess's holiday cards.
The hosts ask one question at a time in a pixel-art dialog box. After a guest signs up, their family walks into a pixel-art winter party in our living room.
The room has hidden extras: a photo album, a dreidel game, a passing Waymo, a toast, plants that bloom, the presents, and more.

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
| `src/places.ts` | `GET /api/places` and `GET /api/place`: Google Places address suggestions and details, US only |
| `src/address.ts` | The mailing address in a request body, with the US-only check from `public/js/us.js` |
| `src/turnstile.ts` | The Turnstile check on `POST /api/submit` |
| `src/sheet.ts` | The Apps Script calls: add a Sheet row, and read or change the row of a family (`family_id`) |
| `src/party.ts` | D1: adds a family, reads the party, changes a sprite, the token check, the party version |
| `src/interactions.ts` | `POST /api/interaction`: the allow-list of egg names (`EGGS`), and the count for each family and egg |
| `src/invites.ts` | `POST /api/invite`, and the invite on `POST /api/submit`: a custom link for a friend (`pnpm invite`) |
| `src/album.ts` | `GET /album/list` and `GET /album/<hash>.jpg` from KV |

### Front end (`public/`)

No build step. The browser loads ES modules as they are.

| File | Owns |
|---|---|
| `public/index.html`, `public/style.css` | Markup and the main styles |
| `public/app.js` | The form steps, the party loop, the sprite editor, and the wiring of all modules. It names no hidden extra |
| `public/js/api.js` | Every call to the Worker |
| `public/js/us.js` | The US-only rule for a mailing address, and the host lines for it. The Worker and the scripts import it too |
| `public/js/dom.js`, `public/js/pixels.js`, `public/js/palette.js` | Shared helpers: `h()` for elements, `loadCss()`, the dialog plumbing; the text-grid pixel painter and the twinkle (`drawTwinkle`); the page colors |
| `public/js/masks.js`, `public/js/words.js` | Shared helpers for the extras: room-sized masks and the sky behind the window glass; the words that show on the room for a moment |
| `public/js/test-api.js` | The test API on `window.__hc`. `app.js` loads it only with `?test`. Each extra adds its own part (its `test`) |
| `public/js/room.js` | Every place in `room.png` that the code uses: the floor, the window, the fire, the menorah, the lamp, the book, the dreidels, the wine, the plants, the presents, and the tap boxes of the extras |
| `public/js/scene.js` | The room canvas, the frame loop, sprites, bubbles, names, the camera, taps, and the arrival from below the room. Layers (`addLayer`) draw over it, and `onFrame` listeners run each frame |
| `public/js/ambience.js` | The room's own motions: the snow in the window, the fire glow, and the candle flames |
| `public/js/hosts.js` | The hosts (`HOSTS`) and their lines (`HOST_LINES`): the thanks, and the hints from the extras |
| `public/js/idle.js` | The hosts speak on their own: a hint after about 20 quiet seconds, and the hint for a tap on the counter |
| `public/js/glint.js` | The gold star on the tap area of an extra that the guest has not found, from the moment the room shows, and the room's sparkle at the last find |
| `public/js/counter.js` | The counter in the corner of the room ("3 of 12 surprises"), from the moment the room shows, and the cheer at the last find |
| `public/js/registry.js` | The registry of the hidden extras: the shape of an extra, the tap areas (`HOTSPOTS`), the taps, the hints, and the test hooks |
| `public/js/found.js` | The extras this browser found, and the record of each interaction (`POST /api/interaction`) |
| `public/js/picker.js` | The look picker. Ages and looks come from `public/assets/looks.json` |
| `public/js/sound.js` | Sound effects with Web Audio, and the recorded sounds. `tone()` and the noise buffers are shared with `dreidel-sound.js` |
| `public/js/night.js`, `public/night.css` | The snowy night, roof, and greeting around the room on a tall screen. It runs on the scene's frames |
| `public/js/extras/index.js` | The list of the hidden extras. Its order is the draw order. See "Add a hidden extra" |
| `public/js/extras/album.js`, `album-art.js`, `public/album.css` | The photo album: a tap on the book on the sofa |
| `public/js/extras/lamp.js` | The floor lamp: a tap turns it off, and the room goes dark blue |
| `public/js/extras/waymo.js`, `cybertruck.js`, `road.js` | The cars that drive past the window. `road.js` is not an extra: it keeps one car on the road at a time, and a host calls out each car |
| `public/js/extras/star.js` | The shooting star: a tap on the window |
| `public/js/extras/menorah.js`, `hanukkah.js` | The menorah: a tap lights tonight's candles again. `hanukkah.js` gives the night of Hanukkah 2026 in the guest's own time |
| `public/js/extras/toast.js` | The toast: a tap on the wine, and the whole party raises a cup (wine for grown-ups, cocoa for kids). It draws a cup in each hand (`drawOn`) |
| `public/js/extras/plants.js` | The plants: a tap on a potted plant makes it bloom, and when every plant blooms, petals fall over the room |
| `public/js/extras/fire.js` | The fire: a tap on the fireplace gives a crackle, a flare, and a burst of sparks up the chimney |
| `public/js/extras/presents.js` | The presents: a tap, and Eddie, then Audrey, says a holiday message |
| `public/js/extras/dreidel.js`, `dreidel-art.js`, `dreidel-sound.js`, `public/dreidel.css` | The dreidel game: a tap on a dreidel on the sill |
| `public/js/extras/pets.js` | The pet reactions: a tap on a dog or a cat. A layer that draws the pet in its pose (`drawSprite`) |
| `public/js/extras/silly.js` | The silly looks: a guest dresses their own family in a silly look |
| `public/assets/` | `room.png`, `book.png`, `og.png`, `icon.png`, the look sprites in `looks/`, and the sounds in `sounds/` |

### Art (`art/`)

Python scripts with Pillow, and one Node script, run from the repo root. The docstring at the top of each script gives its usage.

| Script | Makes |
|---|---|
| `art/scripts/looks.py` | The one look library: guest looks and host sprites, with the prompts and picks. `gen` asks PixelLab for variations, `add` puts the pick in `public/assets/looks/` and `looks.json`, and `sheet` makes a review sheet |
| `art/scripts/pixellab.py` | The PixelLab calls, the key lookup, and the sprite cleanup that `looks.py` and `props.py` share |
| `art/scripts/props.py` | Prop variations (presents, dreidel) to paint into `public/assets/room.png` by hand |
| `art/scripts/table_wine.py` | The wine bottle and glasses, drawn pixel by pixel on `public/assets/room.png` |
| `art/scripts/menorah.py` | The two end candles that make the menorah hold eight candles and the shamash, drawn pixel by pixel on `public/assets/room.png` |
| `art/scripts/book.py` | The photo album sprite on the sofa, `public/assets/book.png` |
| `art/scripts/og.mjs` | The link preview, `public/assets/og.png`, from the real page in Google Chrome. It also puts a new `?v=` hash in the `og:image` address in `public/index.html`. Run `pnpm og` after each change to the room, the hosts, or the extras |
| `art/scripts/album.py` | The album photos in KV. See "Data rules" |

`public/assets/` holds the only copy of each image that the site uses. `art/assets/` holds only source art that the site does not serve:
`art/assets/rooms/cabin.png` is the PixelLab style image, and the end-to-end tests use the sprites in `art/assets/characters/`.

### Other

- `migrations/`: the D1 schema. The tables are `families`, `members`, `party_version`, `interactions`, and `invites`.
- `apps-script/`: the Apps Script that adds, reads, and changes rows in the contact Sheet. Deploy it with `clasp`, see `apps-script/README.md`.
- `test/api.test.ts`: Worker tests in the Workers runtime, with fake outbound calls in `test/outbound.ts`.
  `test/extras.test.ts` checks that `EGGS` holds the name of each extra in `public/js/extras/index.js`, and no other name.
  `test/sheet-dupes.test.ts` checks the address rules of `pnpm sheet:dupes` (`scripts/dupes.ts`) with made-up rows.
  `test/invites.test.ts` checks the pure rules of `pnpm invite` (`scripts/invites.ts`) with made-up friends.
  `test/apps-script.test.mjs` runs `apps-script/Code.js` in Node against a fake Sheet. `pnpm test` runs it after Vitest.
- `test/e2e/`: the page in Google Chrome against a fake API. It needs no Cloudflare.
  `harness.mjs` holds the server, the fake API, the test looks, and the helpers. Each `*.test.mjs` file covers one feature.
  The tests read and drive the page's state only through `window.__hc`. After a change inside a page module, change `public/js/test-api.js`
  or the `test` of the extra, not the tests. A few checks also import the pure functions in `extras/pets.js`, `extras/hanukkah.js`, and `sound.js`.
- `scripts/`: `preview.sh`, `deploy.sh`, the deploy hook `no-direct-deploy.mjs`, `interactions.sh`,
  `sheet-dupes.mjs` with its pure rules in `dupes.ts`, and `invite.mjs` with its pure rules in `invites.ts`.
  Node runs each `.ts` file as it is, with no build step.

## Commands

```sh
pnpm install        # also runs pnpm types, which makes worker-configuration.d.ts
pnpm dev            # wrangler dev at http://localhost:8787, with local D1 and KV
pnpm test           # Worker tests. Must pass before a PR.
pnpm e2e            # the page in Google Chrome with a fake API, 4 files at a time. Screenshots go to build/e2e.
node --test test/e2e/album.test.mjs   # one feature only
E2E_SLOW=6 pnpm e2e # each page with a CPU 6 times slower, to find a test that depends on a fast machine
pnpm typecheck
pnpm og            # make the link preview again from the page, see art/scripts/og.mjs
pnpm preview        # upload this branch as a preview and print its URL
pnpm interactions   # read only: the hidden extras that each family played with, from the production D1. Add --local for pnpm dev
pnpm sheet:dupes    # read only: the guests with the same mailing address in the contact Sheet. Add --apply to delete the extra rows
pnpm invite friends.csv   # a custom link for each friend in the CSV. With no file, it asks in prompts. Only Jesse runs it
pnpm invite --list  # read only: each invite's envelope name and status, with no addresses
pnpm run deploy     # main only. See "Deploy".
```

`pnpm deploy` without `run` is a pnpm command, not our script. It does not deploy the site. Always type `pnpm run deploy`.

For `pnpm dev`, copy `.dev.vars.example` to `.dev.vars` and fill in the secrets. The Turnstile values in the example are Cloudflare's test values, which always pass.
To make the local D1 tables, run `pnpm exec wrangler d1 migrations apply holiday-card --local`.

## Add a hidden extra

A hidden extra is one module in `public/js/extras/` and one line in a list. No other page file names it.

1. Write `public/js/extras/<name>.js`. Its default export is `{ name, spots, hints, fits, setup }`.
   The shape is at the top of `public/js/registry.js`. `public/js/extras/presents.js` is a short example.
2. Import it in `public/js/extras/index.js` and add it to `EXTRAS`. The list order is the draw order of the layers.
3. Add the name to `EGGS` in `src/interactions.ts`. `pnpm test` fails until the two lists agree.
4. If the extra has a tap area, add its box to `public/js/room.js`, next to the other places in `room.png`.

What the registry does for an extra:

- Taps: a tap on one of its `spots` calls its `tap(id)`. A tap on a guest calls `tapSprite(sprite)`, and a new look calls `look(sprite, look)`.
- Tracking: the registry records each tap of a spot, and each `tapSprite` or `look` that returns true.
  For a thing with no tap, such as a car that drives past, the extra calls `ctx.found()` itself.
  A record goes to `POST /api/interaction` for the family that this browser signed up last (`found.js`).
  A browser with no family sends nothing. The page sends at most one call for each extra in 5 seconds. A failed call stays silent.
- Hints: each `{ host, text }` in `hints` becomes a line of that host (`HOST_LINES` in `hosts.js`).
  A host stops a hint after this browser finds the extra. `fits(ctx)` can hide the hints for a guest, for example with no pet at the party.
- Layers: the `layer` from `setup` goes on the scene. Its hooks are in `Scene.addLayer` in `scene.js`.
- Other extras: `ctx.extra(name)` gives the runtime of an extra earlier in the list, for example `ctx.extra("lamp").dark`.
- Help to find it: from the moment the room shows, also on the form, the glint visits its `spots` and the counter counts it while `fits(ctx)` is true.
  After the thank-you, for a guest with a family, the hosts also hint at it on their own.
  The registry gives these modules the extras that fit with `fitting()`.
  An extra that opens a window over the room gives `covers` in its runtime. While it is true, the hosts stay quiet and the cheer at the last find waits.

To test an extra:

- Give the runtime a `test(helpers)` that returns its functions for `window.__hc`, for example `fire: () => fire.state()`.
  `eggs`, `constants`, and `loaded` join the objects of every extra.
- Add `test/e2e/<name>.test.mjs`. Find its tap area with `hc.spotCenter(id)` and tap with `tapRoom`.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm e2e`.

## Write a stable e2e test

`pnpm e2e` runs 4 files at a time, and the pages of a file run at the same time. On a busy machine, one frame can take 100 ms or more.
A test must give the same result on a slow machine.

The page has two clocks:

- The scene clock (`hc.time()`) moves everything in the room: the walks, the sparks, the toast, the cars, and the camera.
  A frame adds 0.05 seconds or less, so on a slow machine the scene clock is slower than the wall clock.
- The wall clock runs the bubbles, the words on the room, the tuck of the thank-you, the dreidel spin, and the CSS animations.

The rules:

- Do not wait for a fixed time (`waitForTimeout`). Wait for a state.
- For a thing on the scene clock, stop the clock with `hc.pause()` before the tap. Then move it with `hc.advance(seconds)` or `advanceUntil(page, check)`.
  A stopped clock keeps a short state until the test reads it, for example the corners of a tap (0.45 seconds) or a hop.
- Do not give a wall-clock time limit to a wait for a scene-clock state. Use `advanceUntil`, or `sceneWait` while the clock runs.
- To see a short state while the clock runs, watch it in the page with `requestAnimationFrame`. Start the watch before the action.
- Do not sleep until a call reaches the fake API. `interactions(page, calls)` waits for each interaction call that the page sent. `until(cond)` waits for other state in Node.
- Measure a wall-clock time in the page with `performance.now()`. The test sees each change late, so `Date.now()` in the test is wrong.
- Take a screenshot of a moving thing on a stopped clock. To hold a CSS animation, pause it and set its `currentTime`.
- Use `tuckNow(page)` when a test needs only the party after the thank-you. It skips the 7-second wait and settles the camera.
  Use `assertTucks` only to check the real wait.
- `hc.pointOn` fails when other sprites cover a sprite. Call `stillHosts` or `place` first, or move the stopped clock until the sprite shows.
- A host says a random line. To check a hint, tap until the host says it, with `hearLine`. A fixed number of taps can miss it.
- After `page.reload()` on a return visit, the camera zooms in on the family. Call `tuckNow` before a tap on the room.
- The glint draws on the room from the start, also on the form (`glint.js`). After the thank-you, a host speaks on their own after 20 quiet scene seconds (`idle.js`).
  A test that moves the stopped clock far sees these lines. Read them with `hc.idle()`, and wait for a line of an extra, not for any bubble.
- A bubble lasts on the wall clock. When a test moves the stopped clock far, an old bubble stays and can block a new host line.
- Before a PR that adds or changes an e2e test, run each test file that the change touches with `E2E_SLOW=6`,
  for example `E2E_SLOW=6 node --test test/e2e/glint.test.mjs`.
  Run `E2E_SLOW=6 pnpm e2e` on all files only after a change to the scene clock, `scene.js`, `test-api.js`, or `harness.mjs`.

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
  Each row also holds the `family_id` of its family in D1, and `updated_at` when the guest last changed the address ("My address").
  `status` is `invited` for a row from `pnpm invite` that its friend has not confirmed, and `confirmed` for the rest.
  The address lives only in the Sheet. The Worker reads it from the Sheet for "My address" and never stores it.
  We mail cards inside the US only. `public/js/us.js` holds the rule, and the page, the Worker, and the scripts use it.
  Each household must show once, because Jesse sends the Sheet to the card printer. `pnpm sheet:dupes` finds the duplicates.
  Only Jesse runs `--apply`. It writes a CSV backup of the deleted rows to `~/Documents/holiday-card/backups/`, outside the repo.
  Never write a test row to the real Sheet. The tests use made-up rows.
- An invite link (`pnpm invite`) adds the friend's Sheet row at once, with status `invited`. D1 `invites` holds the invite id
  (also the `family_id` of the row, and of the family after the confirm), the hash of the link token, the envelope name, and the family link.
  It holds no address. The link token is also the family's token, so anyone with the link opens the party as that family and can read its address.
  `pnpm invite` writes D1 with `wrangler d1 execute --remote --file` and the Sheet with the service account, both as Jesse. Never run it from an agent.
- D1 holds the party: families, members, looks, and chat bubbles. The party API never returns an address or the household text.
- D1 also holds `interactions`: for each family and egg, a count, the first time, and the last time. It holds no IP and no user agent.
  The party API never returns it, and it has no `party_version` trigger, so a tap does not make each page fetch the party again. `pnpm interactions` reads it.
- KV (`ALBUM`) holds the photo album: web copies of the photos and the page list.
- Photos and captions NEVER go in git. The repo is public, and the original photos hold GPS data.
  The originals and `captions.json` stay in `~/Pictures/holiday-card-album/`. `python3 art/scripts/album.py` strips the metadata and uploads them.
- Never commit a screenshot that shows a real guest's name, address, or family. Use `pnpm e2e` or `pnpm dev` data for screenshots.
- To hide a family or a chat bubble, set `families.hidden` or `members.bubble_hidden` to 1 in D1. There is no admin page yet.
- To read, fix, or delete a row in the contact Sheet, use the service account in `apps-script/README.md` ("Maintain the Sheet"). Do not change the Apps Script for this.

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
| `PLACES_LIMIT`, `WRITE_LIMIT`, `HOUSEHOLD_LIMIT`, `SPRITE_LIMIT`, `INTERACTION_LIMIT`, `ADDRESS_LIMIT`, `INVITE_LIMIT` | Rate limit bindings | `wrangler.jsonc` |
| `PIXELLAB_KEY` | Env var for the art scripts | 1Password vault `keys`, item `CozyChat`, field `PIXEL_LAB_KEY`. `pixellab.py` reads it with `op read` when the env var is not set |
| Retro Diffusion key | No script uses it now | 1Password vault `keys`, item `CozyChat`, field `RETRO_DIFFUSION_KEY` |

Google Cloud caps Places at 500 suggestions and 200 address lookups a day. A preview and `pnpm dev` with a real key use the same quota.

`worker-configuration.d.ts` is generated, and git ignores it. `pnpm types` makes it again after a change to `wrangler.jsonc`.
A new secret goes in `secrets.required` in `wrangler.jsonc`, in `.dev.vars.example`, and in the table above.

## Working rules

- Make a worktree for each change: `git worktree add -b <type>/<name> ~/code/holiday-card-<name> origin/main`. Never commit to main.
- One branch, one PR, squash merge. Do not merge your own PR unless the orchestrator tells you to.
- The squash commit subject uses a semantic prefix and the PR number, for example `feat: a tap on the fire makes it crackle (#41)`. Pass it with `gh pr merge --squash --subject`. Do not keep the PR title as the subject.
- Commits use semantic prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- There are no GitHub Actions. You run the checks: `pnpm test`, and `pnpm e2e` for a page change.
- Check a branch with `pnpm preview`. Never deploy a branch.
- Delete files with `/usr/bin/trash`. Never use `rm -rf`.
- Several agents often work at the same time on this machine. Put your temporary files in a subfolder with your own name, never straight in a shared scratch folder.
- Stop only the processes that you started. Never use a broad `pkill`, for example on `node --test`, because it can stop another agent's tests.
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

A small change uses a short body: **Summary** and **AGENTS** only, and one After screenshot at 400 wide for a UI change.
A small change is copy, a time, a size, or a color in one feature, with no new module and no new test file.

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
