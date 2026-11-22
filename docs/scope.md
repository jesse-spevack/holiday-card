# Holiday card party: scope

A site at `hi.verynormal.dev` that collects names and mailing addresses for our holiday cards.
After a guest submits, their family arrives as pixel sprites at a cozy winter holiday party in our living room.

## Guest flow

1. The guest opens one shared link. There is no passcode and no per-person link.
2. The hosts ask one question at a time (see `docs/form.md` and `docs/copy.md`):
   - The name for the envelope, for example "The Garcia Family"
   - "Who lives at your house?" as free text, for example "Sofia, Dan, Mia, and Biscuit the corgi"
   - Mailing address (US only). Street suggestions come from Google Places. Apartment or unit is a separate step.
   - A confirm step before the address is sent
3. One LLM call through OpenRouter turns the family text into members (adult, kid, baby, dog, cat). There is no fallback.
4. Arrival moment: the family walks in through the front door, with a sound effect.
5. The party: every family that has joined mills around the living room. Jesse, Jessica, and their kids are always there as hosts.
6. Surprise: tapping your own sprite lets you change its look or give it a chat bubble (about 40 characters, no filter).
   The browser remembers which sprites are yours.

## Privacy

- The party shows the household name only.
- Addresses and family member names are never shown.
- Jesse can hide any chat bubble. Until the admin page exists, Claude sets `bubble_hidden` in D1.

## Data

- The Google Sheet is the contact list only: name, household, and mailing address.
  An Apps Script on the Sheet adds one row for each sign-up. See `apps-script/`.
- Party data (family members, sprite looks, chat bubbles) lives in Cloudflare D1, not in the Sheet.
- Later: an admin page at `hi.verynormal.dev/admin` to view and change the data.
- Duplicates are kept. Jesse cleans them up.

## Look

- A bright, cheerful 16-bit handheld RPG look, with original art only. No copied assets from any real game.
- The room fills the screen, and the hosts talk in a pixel-art dialog box under it, like a handheld RPG.
- The theme is cozy winter holidays with a feeling of gratitude. The hosts say things like "Happy holidays!",
  "Happy New Year!", and "We're so glad you're in our lives." No Hanukkah lines.
- Details in the room: a menorah and dreidels on the window sill, wrapped presents under the window, latkes and cocoa,
  snow, blue and white bunting. No Christmas imagery.
- Hovering over a family shows its envelope name. Hovering over the hosts shows Eddie, Audrey, Jess, and Jesse.
  A tap shows them for a few seconds.
- Extras: sound effects, and ambient details such as falling snow, a fire, and flickering candles. No music.
- Phones first.

## Stack

- A Cloudflare Worker serves the static page and the API at `hi.verynormal.dev`. It holds the OpenRouter,
  Google, Sheet, and Turnstile secrets. It calls the LLM and Places, writes contacts to the Sheet, and keeps the party in D1.
- The party page checks for changes every 5 seconds. It reads one version row and fetches the full party only when the version moves.
- Turnstile protects the sign-up form.
- Art comes from PixelLab (characters, with 4 directions and animations) and Retro Diffusion (rooms and props).
  `art/scripts/generate.py` holds the prompts and settings.

## Art style settings (style B, chosen in a bake-off)

- Characters: PixelLab `generate-image-v2`, with a crop of the cabin as `style_image`. This makes the
  figures match the room's warm light, soft shading and brown outline. Big heads, about 2 heads tall.
  Frame sizes: adults 48px (about 36px tall), kids 40px (about 29px), small pets 24px (about 21px).
  One call returns 25 variations. `art/scripts/characters.py` has the prompts.
- Each figure gets a small drop shadow, and figures stand in groups, not in rows (`art/scripts/scene.py`).
- Room: a cozy modern living room (cream walls, light oak floor, white fireplace, navy sofa and armchairs,
  snowy window with the menorah, latke table on the right, rug in the middle, front door at the bottom).
  Retro Diffusion `rd_pro__topdown`, 256x192. `art/assets/rooms/living-room.png`.
- Rejected rooms: log cabins (too rustic), and a layout with a bookshelf along the bottom wall.
- Rejected: PixelLab template characters (blank faces, sticker look), PixelLab Pro (muddy),
  Retro Diffusion characters (too large and orange).

## Setup

- Done: the Worker, D1, the `hi` custom domain, the secrets, the Sheet, and Places with a key limited to Places.
- Places has hard daily limits in Google Cloud: 500 suggestions and 200 address lookups.
- Jesse: make a Turnstile widget for `hi.verynormal.dev`. The site uses Cloudflare's test key until then.

## Out of scope

- Chat bubble moderation
- A fallback when the LLM call fails
- Midjourney (it has no official API)
- Music
