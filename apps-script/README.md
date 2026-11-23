# Sheet Apps Script

The Apps Script on the "Holiday card addresses" Sheet. The Cloudflare function calls it with a POST and a shared secret.

- Sheet: https://docs.google.com/spreadsheets/d/1ArtjsZk8Gk1BMnC-1-LvWeRMQG1qYKZ1r1sUtqnx0OU
- Script: https://script.google.com/d/186qCXVQ7XmEplj9Gq-2NLRvWhd_qIsUDvtGD6THb1URaq3NWZzaXa2V_/edit

## Contract

POST a JSON body with `secret`, `name`, `household`, `street`, `unit`, `city`, `state`, and `zip`.
The script adds one row to the Contacts tab and returns `{"ok": true}`.
It returns `{"error": "..."}` when the secret is wrong or a field is missing.
The Sheet holds only the contact list. The party data lives elsewhere.

## Deploy

`Secret.js` holds `SHARED_SECRET` and git ignores it. Run `clasp pull` from the repo root to get it back.

```sh
clasp push -f
clasp deploy -i AKfycbweRjFcUK4fq9j8vZ5HBGFMBd1duKAya3Tq7nhEC8xm6dRWGRPnzKP-DpycDaQ5xgVMFA
```

Deploy with `-i` to keep the same web app URL.

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

- Two rows are duplicates when their address keys are equal. `scripts/dupes.ts` makes the key, and its comments give the rules.
  In short: case, spaces, punctuation, and accents do not count. Street words and directions use the USPS short forms.
  "Apt", "Unit", "Suite", and "#" are the same. A ZIP+4 counts as its first five digits.
- The newest row in a group stays (the latest `added_at`). The script prints a note when the names or the household names in a group differ.
- The script also prints one name at two or more addresses: a guest who moved, or a typo. It never deletes these rows. Fix them by hand.
- `--apply` first writes the rows to delete to a CSV in `~/Documents/holiday-card/backups/`, and prints the path.
  Then it reads the Sheet again, and stops if a row to delete changed. Then it deletes all the rows in one `batchUpdate`, from the bottom row up.
- To put a deleted row back, copy its line from the backup CSV into the Sheet. The `row` column gives its old row number.
