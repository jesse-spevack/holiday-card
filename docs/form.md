# The form

The guest form at `hi.verynormal.dev`. It collects mailing addresses for holiday cards.
The pixel-art living room party is decoration and a thank-you.

- Copy (every line, hints, errors): `docs/copy.md`
- Screenshots of the live form: `docs/form/*.png`

## Where the code is

| Part | File |
|---|---|
| Steps, address suggestions, confirm, send | `public/app.js` (`stepEnvelope`, `stepHousehold`, `stepAddress`, `stepUnit`, `stepConfirm`, `send`, `stepDone`) |
| API calls from the page | `public/js/api.js` |
| Room, sprites, door arrival, taps | `public/js/scene.js` |
| Look picker ("New look") | `public/js/picker.js`, with ages in `public/assets/looks.json` |
| Sound effects | `public/js/sound.js` |
| Hidden photo album (the book on the sofa) | `public/js/album.js`, `public/album.css`, `src/album.ts` |
| Hidden room extras (Waymo, shooting star, menorah, floor lamp) | `public/js/eggs.js`, with the tap areas in `HOTSPOTS` in `public/js/scene.js` |
| Markup and styles | `public/index.html`, `public/style.css` |
| Server (Cloudflare Worker) | `src/worker.ts` and the files next to it |
| Party database (D1) | `migrations/` |
| Contact list Sheet writer | `apps-script/Code.js` |
| Tests | `test/api.test.ts` (`pnpm test`), `test/e2e.mjs` (`pnpm e2e`, needs Google Chrome) |

## Flow

The hosts ("Jesse & Jess") ask one question at a time in a dialog box.

1. **Envelope name** (`f-envelope`), required. Example: The Garcia Family.
2. **Household** (`f-household`), required, free text. Example: Sofia, Dan, Mia, and Biscuit the corgi.
   On Next, the page calls `POST /api/household` in the background. The guest's sprites wait at the door while they type the address.
3. **Address** (`f-address`). Typing (3+ characters, 250 ms debounce) calls `GET /api/places`. Picking a suggestion calls `GET /api/place`.
   With no match (6+ characters), the page offers "Use what I typed".
   3b. **Apartment or unit** (`f-unit`), optional, with Skip.
4. **Confirm**: the envelope name, street plus unit, and city, state and ZIP. "Fix it" goes back to step 3.
   "Yes, send it" starts the door arrival at once and calls `POST /api/submit` during it. On failure, the button works again.
5. **Done**: the browser saves `{id, token, name, members, bubbles}` in localStorage key `hc.families`. A return visit goes straight to the party.
   After 7 seconds, the thank-you slides away and the camera shows the whole room. "Add another address" in the top bar brings back step 1.

To see the site as a new guest, open `/?new`. It clears `hc.families` in this browser, keeps the sound setting, and starts at step 1.

After that, a tap on one of your own sprites opens a small editor. "Say something" sets a speech bubble.
"New look" opens the look picker (`docs/form/look-picker-*.png`). A person sees every person look, from the oldest to the youngest, then the silly looks.
A pet sees the dogs, then the cats, then the silly pets. Each person look in `looks.json` has an `age`: `older`, `adult`, `teen`, `kid`, or `baby`.

## API contract

All under `/api/`, JSON, handled by `src/worker.ts`.

| Call | Request | Response |
|---|---|---|
| `GET /api/config` | | `{ "turnstileSiteKey": "..." }` |
| `POST /api/household` | `{ "text": "Sofia, Dan, Mia, and Biscuit the corgi" }` | `{ "members": [{"type":"adult"}, ...] }` (types: adult, kid, baby, dog, cat; 1 to 12) |
| `GET /api/places?q=...&session=<uuid>` | | `{ "suggestions": [{ "id", "main", "secondary" }] }` (US only, at most 5) |
| `GET /api/place?id=<placeId>&session=<uuid>` | | `{ "address": { "street", "city", "state", "zip", "formatted" } }` |
| `POST /api/submit` | see below | `201 { "id", "token" }` |
| `POST /api/sprite` | `{ "id", "token", "index", "look"?, "bubble"? }` (bubble at most 40 characters) | `{ "ok": true }` |
| `GET /api/party` | | `{ "families": [{ "id", "name", "members": [{"type","look"}], "bubbles": ["..."] }] }` |

`POST /api/submit` body:

```json
{
  "envelope": "The Garcia Family",
  "household": "Sofia, Dan, Mia, and Biscuit the corgi",
  "members": [{ "type": "adult", "look": "adult-03" }, { "type": "dog", "look": "dog-06" }],
  "address": { "street": "1428 Maple Ave", "unit": "Apt 2B", "city": "Evanston", "state": "IL", "zip": "60201", "formatted": "..." },
  "turnstileToken": "..."
}
```

A typed address with no match sends `street` as typed, with empty `city`, `state` and `zip`.
The Worker checks Turnstile, then writes the contact to the Sheet, then writes the family to D1.

## Where the data goes

- **Sheet** (contact list only), tab `Contacts`: `added_at, name, household, street, unit, city, state, zip`.
  `household` holds the envelope name. `name` holds who lives there, as the guest wrote it.
- **D1** (the party): `families` (envelope name, household text, edit token hash, `hidden`) and `members`
  (type, look id, bubble, `bubble_hidden`). The party never returns addresses or the household text.
- To hide a bubble or a family until the admin page exists, set `bubble_hidden` or `hidden` to 1 in D1.
- `/api/party` reads one version row on each call. The edge caches the full party per version, so a change shows at once.

## Secrets

`OPENROUTER_API_KEY`, `GOOGLE_PLACES_KEY`, `SHEET_SECRET`, `TURNSTILE_SECRET` (Cloudflare secrets, or `.dev.vars` locally).
The model is the `OPENROUTER_MODEL` var in `wrangler.jsonc`. The Sheet URL is the `SHEET_URL` var.
