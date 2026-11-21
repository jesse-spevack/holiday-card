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
- Jesse can hide any chat bubble from the Sheet.

## Data

- Each entry goes into a Google Sheet through an Apps Script on that Sheet.
- Duplicates are kept. Jesse cleans them up.

## Look

- A bright, cheerful 16-bit handheld RPG look, with original art only. No copied assets from any real game.
- The page around the scene uses Stripe Press-style typography and polish.
- The theme is cozy winter + Hanukkah: menorah, dreidels, latkes, cocoa, snow, blue and white bunting. No Christmas imagery.
- Extras: sound effects, and ambient details such as falling snow, a fire, and flickering candles. No music.
- Phones first.

## Stack

- Cloudflare hosts the static page and a function. The function holds the OpenRouter and Google keys,
  calls the LLM and Places, and reads and writes the Sheet through Apps Script.
- Art comes from PixelLab (characters, with 4 directions and animations) and Retro Diffusion (rooms and props).
  `art/scripts/generate.py` holds the prompts and settings.

## Art style settings (locked after round 3)

- Characters: PixelLab `create-character-with-4-directions`, 32px, `chibi` proportions,
  `low top-down` view, single color black outline, basic shading, medium detail.
- Room: Retro Diffusion `rd_pro__topdown`, 256x192, front door in the middle of the bottom wall.

## Setup tasks for Jesse

1. Cloudflare: create a project and point the `hi` subdomain at it.
2. Google Sheet: create it, then paste in the Apps Script.
3. Google Cloud: turn on billing with a budget alert, turn on Places API (New), and create a key limited to that API.
4. Cloudflare secrets: add the OpenRouter key and the Google key.

## Out of scope

- Chat bubble moderation
- A fallback when the LLM call fails
- Midjourney (it has no official API)
- Music
