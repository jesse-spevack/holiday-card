# Holiday card party: scope

A site at `hi.verynormal.dev` that collects names and mailing addresses for our holiday cards.
After a guest submits, their family arrives as pixel sprites at a cozy winter + Hanukkah cabin party.

## Guest flow

1. The guest opens one shared link. There is no passcode and no per-person link.
2. They fill in the form:
   - Their name
   - Household name for the envelope, for example "The Garcias"
   - Mailing address (US only). Street suggestions come from Google Places, like Stripe Checkout. Apartment or unit is a separate field.
   - "Who's in your family?" as free text, for example "Me, Dana, our kids Mia and Leo, and Biscuit the corgi"
3. One LLM call through OpenRouter turns the family text into members (adult, kid, baby, dog, cat). There is no fallback.
4. Arrival moment: the family walks in through the cabin's front door, with a sound effect.
5. The party: every family that has joined mills around the cabin.
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
- The page around the scene uses Stripe Press-style typography and polish.
- The theme is cozy winter + Hanukkah: menorah, dreidels, latkes, cocoa, snow, blue and white bunting. No Christmas imagery.
- Extras: sound effects, and ambient details such as falling snow, a fire, and flickering candles. No music.
- Phones first.

## Stack

- A Cloudflare Worker serves the static page and the API at `hi.verynormal.dev`. It holds the OpenRouter,
  Google, Sheet, and Turnstile secrets. It calls the LLM and Places, writes contacts to the Sheet, and keeps the party in D1.
- The party page checks for changes every 5 seconds. It reads one version row and fetches the full party only when the version moves.
- Turnstile protects the sign-up form.
- Art comes from PixelLab (characters, with 4 directions and animations) and Retro Diffusion (rooms and props).
  `art/scripts/generate.py` holds the prompts and settings.

## Art style settings (locked after round 3)

- Characters: PixelLab `create-character-with-4-directions`, 32px, `chibi` proportions,
  `low top-down` view, single color black outline, basic shading, medium detail.
- Room: Retro Diffusion `rd_pro__topdown`, 256x192, front door in the middle of the bottom wall.

## Setup

- Done: the Worker, D1, the `hi` custom domain, the secrets, the Sheet, and Places with a key limited to Places.
- Places has hard daily limits in Google Cloud: 500 suggestions and 200 address lookups.
- Jesse: make a Turnstile widget for `hi.verynormal.dev`. The site uses Cloudflare's test key until then.

## Out of scope

- Chat bubble moderation
- A fallback when the LLM call fails
- Midjourney (it has no official API)
- Music
