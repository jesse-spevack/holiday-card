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
