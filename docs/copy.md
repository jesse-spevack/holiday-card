# Form copy

The page collects mailing addresses for holiday cards. The living room party is decoration and a thank-you.
It is not an invitation. The hosts speak as "Jesse & Jess".

## Steps

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

## After confirm

- Thank you. You mean a lot to us.
- Your family is at our party now. Tap them to change a look or say something. Then poke around the room. A few things in here might surprise you.

No card timing anywhere.

## Errors

- Blank answer: We need something here.
- No address match: We can't find that one. Type the full address and we'll use it as written.
- Save failed: Something went wrong. Try again?

## Timing behind the scenes

- The household text goes to the LLM right after step 2, while the guest types the address.
- "Yes, send it" starts the arrival animation at once. The Sheet write happens during it (about 2 seconds).
- Sprites come from a ready-made library, never generated at submit.
