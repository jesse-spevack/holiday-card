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
   On a tall screen, the room then sits under a snowy roof in a night sky, with "Happy holidays from Jesse, Jess, Eddie & Audrey Spevack" below it.

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
The Worker checks Turnstile, then writes the contact to the Sheet, then writes the family to D1.

## Where the data goes

- **Sheet** (contact list only), tab `Contacts`: `added_at, name, household, street, unit, city, state, zip`.
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

### After confirm

- Thank you. You mean a lot to us.
- Your family is at our party now. Tap them to change a look or say something. Then poke around the room. A few things in here might surprise you.

No card timing anywhere.

### Errors

- Blank answer: We need something here.
- No address match: We can't find that one. Type the full address and we'll use it as written.
- Save failed: Something went wrong. Try again?

### Timing behind the scenes

- The household text goes to the LLM right after step 2, while the guest types the address.
- "Yes, send it" starts the arrival animation at once. The Sheet write happens during it (about 2 seconds).
- Sprites come from a ready-made library, never generated at submit.
