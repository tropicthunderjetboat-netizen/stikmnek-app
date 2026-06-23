# Fixing the Bislama translations

All the Bislama (and English / French) text in the app can be exported to one
spreadsheet, corrected by hand, and loaded back in. You never have to touch the
code.

## 1. Get the text out

```bash
npm run i18n:export
```

This creates **`i18n/bislama-review.csv`** with one row per phrase:

| column   | meaning                                              |
| -------- | ---------------------------------------------------- |
| id       | leave this alone (used to put the text back)         |
| english  | the English wording (reference only — don't edit)    |
| french   | the French wording (reference only — don't edit)     |
| bislama  | **edit this** — the Bislama wording to correct       |
| where    | where it appears in the app (reference only)         |

## 2. Correct it

Open `bislama-review.csv` in **Excel** or **Google Sheets**. Fix the wording in
the **`bislama`** column only. Use the English and French columns to understand
the meaning. Then **Save as CSV** (keep the same file name).

> Tip: send this CSV to a fluent Bislama speaker — they only need to read the
> English column and rewrite the Bislama column.

## 3. Put the text back

```bash
npm run i18n:import
```

This writes your corrected Bislama straight back into the app. Only phrases you
actually changed are touched, and each change is double-checked before it's
applied, so nothing else can be damaged.

That's it — rebuild/redeploy and the new Bislama is live.

---

### Notes

- `bislama-map.json` is generated automatically. **Don't edit it** — it's how the
  importer knows where each phrase lives.
- If you change the app's code between an export and an import, just run
  `npm run i18n:export` again before editing, so the spreadsheet stays in sync.
- The export covers both the central translation table and the text written
  directly inside the onboarding screens, so the wizard wording is included.
