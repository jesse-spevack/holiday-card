# Holiday card party: what guests see

A site at `hi.verynormal.dev` that collects names and mailing addresses for our holiday cards.
After a guest submits, their family arrives as pixel sprites at a cozy winter holiday party in our living room.
The code map, the data rules, and the commands are in `AGENTS.md`.

## Guest flow

1. The guest opens one shared link. There is no passcode and no per-person link.
2. The hosts ask one question at a time (see `docs/form.md`):
   - The name for the envelope, for example "The Garcia Family"
   - "Who lives at your house?" as free text, for example "Sofia, Dan, Mia, and Biscuit the corgi"
   - Mailing address (US only). Street suggestions come from Google Places. Apartment or unit is a separate step.
   - A confirm step before the address is sent
3. One LLM call through OpenRouter turns the family text into members (adult, kid, baby, dog, cat). There is no fallback.
4. Arrival moment: the family walks in through the front door, with a sound effect.
5. The party: every family that has joined mills around the living room. Jesse, Jess, and their kids are always there as hosts.
   The hosts walk around too. Jesse and Jess go between the table, the rug, the fireplace, and the guests.
   Audrey and Eddie walk together. Each host goes back home now and then. With reduced motion, the hosts stay at home.
6. Surprise: tapping your own sprite lets you change its look or give it a chat bubble (about 40 characters, no filter).
   The browser remembers which sprites are yours.

## Photo album (a hidden extra)

- A small red book lies on the sofa. Nothing points to it. A tap opens it over the whole screen, with one photo from our year on each page.
- A tap on the left half goes back, and a tap on the right half goes forward. Arrow keys, Escape, and a swipe work too.
- Phones show one page at a time. Wide screens show two pages, after a title page.
- Code: `public/js/album.js` and `public/album.css`. The book sprite: `art/scripts/book.py`.
  The open book is pixel art that `public/js/album-art.js` draws at runtime. The photos stay smooth.
- The book makes real paper sounds: a page flip for each turn, and a sound when the cover opens and closes.
  The recordings come from Kenney's "RPG Audio" pack (CC0, no credit required): `public/assets/sounds/` and its `LICENSE.txt`.
  They load after the first tap. Until they load, or if they fail, the book plays a synthesized swish.
- The photos and the captions live in Workers KV (namespace `holiday-card-album`, binding `ALBUM`). The Worker serves them at `/album/list` and `/album/<hash>.jpg`.
- Photos and captions never go in git. The repo is public, and the originals hold GPS data.
  The originals and `captions.json` stay in `~/Pictures/holiday-card-album/`.
- To change the album, edit `captions.json` and run `python3 art/scripts/album.py`. It makes web copies with no metadata, uploads them, and removes old ones.
  The pages go in photo date order. A `date` in `captions.json` places a photo that has no date.

## Room extras (hidden)

Nothing on screen points to these.

- Now and then (every 40 to 90 seconds), a small Waymo drives past outside the window, behind the frame and the menorah.
- Now and then (every 60 to 120 seconds), a steel Cybertruck drives past on the same road, and Eddie says "Cybertruck!" in a bubble for 4 seconds.
  If Eddie talks already, he says it after his line, while the truck still shows. Only one car is on the road at a time.
  A car that comes while the other car drives waits until the road is clear, then 3 seconds more.
- A tap on the window sends a shooting star across the night sky, and "Make a wish" shows high on the window glass for about 2 seconds.
- A tap on the menorah puts the flames out. Then the candles light one by one, the shamash first, with a chime that goes up each time.
  After the last candle, "What miracles are you grateful for?" shows under the sill for about 3.5 seconds.
  Only one of these two lines shows at a time. A new line replaces the old line.
- A tap on the floor lamp turns it off. The room goes dark blue, and the fire and the candles glow. A second tap turns it on.
- With reduced motion, the Waymo and the Cybertruck stop in the window for a few seconds, and the star does not move.
  The Cybertruck is longer than a pane, so it stops with its nose and its light bar in a side pane.
- Code: `public/js/eggs.js`. The tap areas are `HOTSPOTS` in `public/js/room.js`.

## The toast (a hidden extra)

- A tap on the wine on the dining table (the two glasses or the bottle) starts a toast.
- Each person at the party lifts a cup in one hand and hops once. The hosts and every guest family do this. The pets do not.
  The grown-ups hold a small red wine glass. The kids and the babies, Audrey and Eddie too, hold a mug of cocoa with a wisp of steam.
- The glasses clink: 3 to 5 bright clinks close together, more for a bigger party. The sound button mutes them.
- Jess or Jesse says a toast in a bubble: "To 2027!", "To all of you!", "To friends near and far!", "Cheers to another year together!",
  "To old friends and new ones!", or "To the people we love!". The same line never comes twice in a row.
- After about 2 seconds, everyone lowers the cup, and the cups go away. A tap during the toast, or for 0.6 seconds after it, does nothing.
- With reduced motion, the cups, the clinks, and the bubble stay, but nobody hops, the cups do not move, and the steam holds still.
- The glass is 5 by 7 room pixels, and the mug is 6 by 6. Each has a dark outline, so it shows on the floor, the rug, and clothes.
  The code finds the hand in each sprite image: the arm that reaches out the farthest between the waist and the hips.
- Code: `public/js/toast.js`. The clinks are `cheers()` in `public/js/sound.js`.

## Tap areas

- Each box in `HOTSPOTS` is the thing as drawn. A tap finds a thing from a little way off: on a touch screen, each thing gets
  44 CSS pixels in each direction where the room allows. A mouse gets 20.
- Where two areas overlap, the nearer thing wins. The window is a back area: it takes only the taps that no small thing takes.
- The things on the sill stand closer than a finger, so each one gets a full finger of height and about 30 CSS pixels of width on a phone.
- A sprite that a tap hits wins over everything. A near miss on a touch screen finds the nearest sprite.
- Gold pixel corners show around the thing under a finger or a mouse, and they stay for a moment after the tap.

## Dreidel game (a hidden extra)

- Two small dreidels stand on the window sill, beside the menorah. A tap on either one grows it to fill the screen.
- A tap on the dreidel, Space, or Enter spins it. It whirrs, slows, wobbles with wooden ticks, and falls on one side with a clack.
  Each side has the same chance.
- The words under it show the letter, its name, and its meaning: Nun "Nothing happens", Gimel "Take it all!", Hei "Take half", Shin "Put one in".
- A pot and the guest's pile of gelt change with each result. The gelt is pretend. Nun changes nothing, Gimel takes the pot, Hei takes half (rounded up), and Shin puts one in.
  After a result, a gold +n or -n shows next to each count that changed.
- Before a spin, an empty pot gets 2 gelt, and a guest with no gelt gets 5. A short line says so, for example "The pot refills with two gelt.".
- The close button, Escape, or a tap outside the game closes it, and the dreidel shrinks back to the sill.
- With reduced motion, the game fades in, and a spin fades to the result with no whirr.
- The dreidel is a small 3D model drawn pixel by pixel in code at 88x72, then scaled by a whole number. The letters are 12-pixel bitmaps.
- Code: `public/js/dreidel.js` (the game), `public/js/dreidel-art.js` (the pixels), `public/js/dreidel-sound.js` (the sounds), `public/dreidel.css`.
  The gelt coin sounds are `gelt-pile` and `gelt-few` in `public/assets/sounds/`, from the same Kenney pack.
- For a test, `?test` exposes the game as `window.__hc.dreidel`. Set `rig = { face: "gimel", speed: 6 }` to choose the side and run the clock faster.

## Privacy

- The party shows the household name only.
- Addresses and family member names are never shown.
- Jesse can hide any chat bubble. Until the admin page exists, Claude sets `bubble_hidden` in D1.
- Duplicate sign-ups stay. Jesse cleans them up in the Sheet.

## Look

- A bright, cheerful 16-bit handheld RPG look, with original art only. No copied assets from any real game.
- The room fills the screen, and the hosts talk in a pixel-art dialog box under it, like a handheld RPG.
- The theme is cozy winter holidays with a feeling of gratitude. The hosts say things like "Happy holidays!",
  "Happy New Year!", and "We're so glad you're in our lives." No Hanukkah greetings.
- About half of the host lines hint at a hidden extra, in the voice of that host (`HOST_LINES` in `public/js/scene.js`).
  A hint stops after this browser finds its extra (`hc.found` in local storage). A host never says the same line twice in a row.
- Details in the room: a menorah and dreidels on the window sill, wrapped presents under the window, latkes and cocoa,
  snow, blue and white bunting. No Christmas imagery.
- Hovering over a family shows its envelope name. Hovering over the hosts shows Eddie, Audrey, Jess, and Jesse.
  A tap shows them for a few seconds.
- Extras: sound effects, and ambient details such as falling snow, a fire, and flickering candles. No music.
- On a tall screen, the bands above and below the room show a snowy night. A roof with an attic window, a smoking chimney,
  and string lights sits on the room. Snow falls below it, and a greeting shows there after the thank-you hides.
  A short band gets a smaller roof or a flat snowy eave. A wide desktop has no bands, so it shows the room only.
- Phones first.
- The party page asks for the party every 30 seconds while its tab shows. The Worker reads one version number and serves a cached party until the version moves.

## Art style settings (style B, chosen in a bake-off)

- Art comes from PixelLab (figures and props) and Retro Diffusion (the room). Later room changes are drawn by hand,
  pixel by pixel (`art/scripts/book.py`, `art/scripts/table_wine.py`).
- Characters: PixelLab `generate-image-v2`, with a crop of the cabin as `style_image`. This makes the
  figures match the room's warm light, soft shading and brown outline. Big heads, about 2 heads tall.
  Frame sizes: adults 48px (about 36px tall), kids 40px (about 29px), small pets 24px (about 21px).
  One call returns 25 variations. `art/scripts/looks.py` has the prompts and the picks.
- Each figure gets a small drop shadow, and figures stand in groups, not in rows (`art/scripts/og.py` draws the link preview this way).
- Room: a cozy modern living room (cream walls, light oak floor, white fireplace, navy sofa and armchairs,
  snowy window with the menorah, latke table on the right, rug in the middle, front door at the bottom).
  Retro Diffusion `rd_pro__topdown`, 256x192. `public/assets/room.png` is the only copy. The first room prompt is in git history (`art/scripts/generate.py` at 16e0ec2).
- Rejected rooms: log cabins (too rustic), and a layout with a bookshelf along the bottom wall.
- Rejected: PixelLab template characters (blank faces, sticker look), PixelLab Pro (muddy),
  Retro Diffusion characters (too large and orange).
- The art scripts are listed in `AGENTS.md`.

## Out of scope

- Chat bubble moderation
- An admin page (later, at `hi.verynormal.dev/admin`)
- A fallback when the LLM call fails
- Midjourney (it has no official API)
- Music
