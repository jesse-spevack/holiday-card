# The form

The guest form at `hi.verynormal.dev`. It collects mailing addresses for holiday cards.
The pixel-art living room party is decoration and a thank-you.

The code map is in `AGENTS.md`. The form steps are in `public/app.js`, and the API is in `src/worker.ts`.

## Flow

The hosts ("Jesse, Jess, Eddie & Audrey Spevack") ask one question at a time in a dialog box.

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
   Then the hosts start to give hints on their own. The glint and the counter help each visitor from the first step. See "Look" in `docs/scope.md`.
   On a tall screen, the room then sits under a snowy roof in a night sky, with "Happy holidays from Jesse, Jess, Eddie & Audrey Spevack" below it.

6. **My address**: after the thank-you, "My address" in the top bar shows the address on file for this browser's family, from the Sheet.
   "Yes, all good" closes it. "Change it" goes through step 1 (the envelope name), step 3, step 3b, and step 4, with no household step.
   Step 3 offers "Same address" to keep the address and change only the envelope name. "Yes, save it" calls `POST /api/address/change`.
   A browser with two or more families first picks one ("Which address?"). A family with no row in the Sheet tells the address again.

To see the site as a new guest, open `/?new`. It clears `hc.families` in this browser, keeps the sound setting, and starts at step 1.

After that, a tap on one of your own sprites opens a small editor. "Say something" sets a speech bubble.
"New look" opens the look picker. A person sees every person look, from the oldest to the youngest, then the silly looks.
A pet sees the dogs, then the cats, then the silly pets. Each person look in `looks.json` has an `age`: `older`, `adult`, `teen`, `kid`, or `baby`.

## API contract

JSON calls under `/api/`, and the album under `/album/`. `src/worker.ts` handles all of them.

| Call | Request | Response |
|---|---|---|
| `GET /api/config` | | `{ "turnstileSiteKey": "..." }` |
| `POST /api/household` | `{ "text": "Sofia, Dan, Mia, and Biscuit the corgi" }` | `{ "members": [{"type":"adult"}, ...] }` (types: adult, kid, baby, dog, cat; 1 to 12) |
| `GET /api/places?q=...&session=<uuid>` | | `{ "suggestions": [{ "id", "main", "secondary" }] }` (US only, at most 5) |
| `GET /api/place?id=<placeId>&session=<uuid>` | | `{ "address": { "street", "city", "state", "zip", "formatted" } }` |
| `POST /api/submit` | see below | `201 { "id", "token" }` |
| `POST /api/sprite` | `{ "id", "token", "index", "look"?, "bubble"? }` (bubble at most 40 characters) | `{ "ok": true }` |
| `POST /api/interaction` | `{ "id", "token", "egg" }` (egg from `EGGS` in `src/interactions.ts`) | `204` with no body |
| `POST /api/address/read` | `{ "id", "token" }` | `{ "envelope", "address": { "street", "unit", "city", "state", "zip" } }`, or `"address": null` with no Sheet row |
| `POST /api/address/change` | `{ "id", "token", "envelope", "address": { "street", "unit", "city", "state", "zip" } }` | `{ "ok": true, "name" }` |
| `GET /api/party` | | `{ "families": [{ "id", "name", "members": [{"type","look"}], "bubbles": ["..."] }] }` |
| `GET /album/list` | | The album pages and captions, from KV |
| `GET /album/<hash>.jpg` | | One album photo, from KV |

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
The Worker picks the family id, checks Turnstile, then writes the contact with the family id to the Sheet, then writes the family to D1.

We mail cards inside the US only (`public/js/us.js`). An address outside the US fails with `422` and one of these codes:

- `not_us`: a state, a ZIP, or a country from outside the US. `GET /api/place` also refuses a place outside the US with this code.
- `no_state`: a typed address that names no US state, so nobody can tell where it goes.

The page checks the same rule before it calls the Worker, so the guest sees the host line on the address step.

The address calls need the family's own token. They call the Apps Script, so they share one rate limit (`ADDRESS_LIMIT`).
The change writes the Sheet row first. A new envelope name then also changes the name at the party.

## Where the data goes

- **Sheet** (contact list only), tab `Contacts`: `added_at, name, household, street, unit, city, state, zip, family_id, updated_at`.
  `household` holds the envelope name. `name` holds who lives there, as the guest wrote it.
- **D1** (the party): `families` (envelope name, household text, edit token hash, `hidden`) and `members`
  (type, look id, bubble, `bubble_hidden`). The party never returns addresses or the household text.
- To hide a bubble or a family until the admin page exists, set `bubble_hidden` or `hidden` to 1 in D1.
- `/api/party` reads one version row on each call. The edge caches the full party per version, so a change shows at once.

## Copy

The party is not an invitation. The hosts speak as "Jesse, Jess, Eddie & Audrey Spevack".

### Steps

| Step | Host asks | Typing hint | Button |
|---|---|---|---|
| 1. Envelope name | We're sending holiday cards! Whose name goes on the envelope? | The Garcia Family | Next ▸ |
| 2. Household | Who lives at your house? | Sofia, Dan, Mia, and Biscuit the corgi | Next ▸ |
| 3. Address | Where should we mail your card? | Start typing your street | (pick a suggestion) |
| 3b. Unit | Apartment or unit? | Apt 2B | Skip / Next ▸ |
| 4. Confirm | We'll mail your card to: *[full address]*. Look right? | | Yes, send it ▸ / Fix it |

Hints under the answer line:

- Step 1: Write it how you'd like it on the envelope.
- Step 2: Pets count. I guess.

### My address

| Step | Host says | Buttons |
|---|---|---|
| Pick a family (two or more) | Which address? | (one per family) / Close |
| Loading | Let me find your address... | Close |
| On file | We'll mail your card to: *[full address]*. Still right? | Change it / Yes, all good ▸ |
| No row | Hmm, we can't find your address. Can you tell us again? | Close / Next ▸ |
| Sheet down | We can't reach our address book right now. (hint: Your card is safe. Try again in a minute?) | Close / Try again |
| Confirm | We'll mail your card to: *[full address]*. Look right? | Fix it / Yes, save it ▸ |
| Saved | Got it. Thank you for telling us! (hint: We'll mail your card to your new address.) | (tucks away after 4 seconds) |

### After confirm

- Thank you. You mean a lot to us.
- Your family is at our party now. Tap them to change a look or say something.
- Tap around the room. We hid some surprises. (in gold, on its own line)

No card timing anywhere.

### Errors

- Blank answer: We need something here.
- No address match: We can't find that one. Type the full address and we'll use it as written.
- Outside the US (`not_us`): Sorry, we can only mail cards inside the US.
- Typed with no state (`no_state`): Add the city and state, like Ely, MN. We can only mail cards inside the US.
- Save failed: Something went wrong. Try again?

### Timing behind the scenes

- The household text goes to the LLM right after step 2, while the guest types the address.
- "Yes, send it" starts the arrival animation at once. The Sheet write happens during it (about 2 seconds).
- Sprites come from a ready-made library, never generated at submit.
