# Sheet Apps Script

The Apps Script on the "Holiday card addresses" Sheet. The Cloudflare function calls it with a POST and a shared secret.

- Sheet: https://docs.google.com/spreadsheets/d/1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU
- Script: https://script.google.com/d/186qCXVQ7XmEplj9Gq-2NLRvWhd_qIsUDvtGD6THb1URaq3NWZzaXa2V_/edit

## Contract

The Contacts tab has the columns `added_at, name, household, street, unit, city, state, zip, family_id, updated_at, status`.
`name` holds who lives there, and `household` holds the envelope name. `family_id` is the id of the family in D1.
`status` is `invited` for a row from `pnpm invite` that its friend has not confirmed yet, and `confirmed` for the rest.
The Sheet holds only the contact list. The party data lives elsewhere.

POST a JSON body with `secret` and an `action`:

| `action` | Other fields | What the script does | Reply |
|---|---|---|---|
| `add`, or no action | `name`, `household`, `street`, `unit`, `city`, `state`, `zip`, `family_id`, and `status` (`invited` or `confirmed`, the default) | Adds one row | `{"ok": true, "row": "added"}` |
| `read` | `family_id` | Finds the newest row of the family | `{"ok": true, "contact": {name, household, street, ...}}`, or `"contact": null` |
| `update` | the same fields as `add` | Changes `household` to `zip`, `updated_at`, and `status` (`confirmed`) in the newest row of the family. With no row, it adds one | `{"ok": true, "row": "updated"}` or `"added"` |
| `confirm` | the same fields as `add` | As `update`, and it also changes `name`. A friend confirms an invite with it | as `update` |

- A call with no action adds a row with no `family_id`. The first Worker sent this, so an older Worker still works with this script.
- The newest row of a family is the lowest one, because rows go on at the bottom.
- `update` keeps `added_at`, `name`, and `family_id` as they were, so a hand fix of the name stays. `confirm` keeps `added_at` and `family_id`.
- `pnpm invite` adds the invited rows with the service account, not with this script, so it needs no shared secret on Jesse's machine.
  It writes each value with a leading quote, as this script does.
- The script returns `{"error": "..."}` when the secret is wrong, a field is missing, or the action is unknown.
- Each write waits for the script lock. A tab with the 8 older columns gets the header cells of the newer columns on its first call.
- `test/apps-script.test.mjs` runs the script against a fake Sheet. It never calls Google.

## Deploy

`Secret.js` holds `SHARED_SECRET` and git ignores it. Run `clasp pull` from the repo root to get it back.

```sh
clasp push -f
clasp deploy -i AKfycbweRjFcUK4fq9j8vZ5HBGFMBd1duKAya3Tq7nhEC8xm6dRWGRPnzKP-DpycDaQ5xgVMFA
```

Deploy with `-i` to keep the same web app URL.

`clasp push` changes only the script's HEAD. The live web app runs the deployed version until `clasp deploy -i`.
Deploy a new script before the Worker that uses it, and keep each script change able to serve the Worker that is live now.

## Maintain the Sheet

The service account `holiday-card-sheet@very-normal.iam.gserviceaccount.com` has Editor access to the Sheet.
It has no key. Get a short-lived token as Jesse:

```sh
gcloud auth print-access-token \
  --impersonate-service-account=holiday-card-sheet@very-normal.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/spreadsheets
```

Use the token with the Sheets API to read rows, fix rows, or delete rows.

## Find duplicate guests

A guest can sign up twice, and two people of one household can each sign up. The card printer must get each household once.

```sh
pnpm sheet:dupes            # read only: each group of rows with the same mailing address, and the row that stays
pnpm sheet:dupes --apply    # also delete the extra rows
```

The script gets the token above with `gcloud`, so run it as Jesse.

- Two rows are duplicates when their address keys are equal, or when they have the same `family_id`.
  A family that changed its address can have rows at two addresses. Rows that share an address or a family go in one group.
  `scripts/dupes.ts` makes the key, and its comments give the rules.
  In short: case, spaces, punctuation, and accents do not count. Street words and directions use the USPS short forms.
  "Apt", "Unit", "Suite", and "#" are the same. A ZIP+4 counts as its first five digits.
- A `confirmed` row (or a row with no status, from before the column) wins over an `invited` row: the guest checked it.
  Then the newest row in a group stays: the latest `added_at`, or `updated_at` for a row that its guest changed. The script prints a note when the names or the household names in a group differ.
- The script also prints one name at two or more addresses: a guest who moved, or a typo. It never deletes these rows. Fix them by hand.
- `--apply` first writes the rows to delete to a CSV in `~/Documents/holiday-card/backups/`, and prints the path.
  Then it reads the Sheet again, and stops if a row to delete changed. Then it deletes all the rows in one `batchUpdate`, from the bottom row up.
- To put a deleted row back, copy its line from the backup CSV into the Sheet. The `row` column gives its old row number.
