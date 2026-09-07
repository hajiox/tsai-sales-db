---
name: tsa-carrier-shipment-csv
description: Download, name, validate, archive, and import the previous month's Yamato B2 and Sagawa eHiden III shipment-history CSV files into the local TSA carrier analytics app. Use for monthly carrier CSV collection, missing shipment archive recovery, Yamato/Sagawa import preparation, or verification of files named `【抽出前】YYYY年M月A.csv` from logged-in Chrome sessions.
---

# TSA Carrier Shipment CSV

Run the monthly carrier export as a lossless, local-first workflow. Keep customer data on this PC and the approved network archive.

## Guardrails

- Target the previous calendar month in Japan time unless the user explicitly supplies another period.
- Reuse a complete, validated archive before opening either carrier site.
- Use the logged-in Chrome session only for navigation and downloads. Never inspect or record cookies, tokens, signed URLs, credentials, or customer rows.
- Stop in an operator-waiting state for login, account selection, MFA, CAPTCHA, permission prompts, or an ambiguous export mapping. Do not retry these conditions in a loop.
- Never print names, addresses, phone numbers, tracking numbers, order numbers, or CSV row contents.
- Do not upload raw CSV files to TSA/Vercel or any external service. Import only into `C:\作業用\yamato-analytics` through its local endpoint.
- Do not silently accept a truncated export. Yamato chunks must contain at most 1000 data rows; Sagawa chunks must contain at most 2000 data rows.

## Workflow

1. Read [references/monthly-workflow.md](references/monthly-workflow.md) before controlling Chrome.
2. Locate files for the target carrier and month in the approved archive.
3. Run `scripts/validate_carrier_csv.py`. If all expected chunks pass, skip the external download and reuse them.
4. If files are missing or invalid, download only the missing period from the logged-in carrier site. Split the date range until every result is within the carrier limit.
5. Name chunks contiguously as `【抽出前】YYYY年M月A.csv`, `B.csv`, and so on. Do not zero-pad the month.
6. Run the validator again. Do not import when validation fails.
7. Run `scripts/import_validated.py`. It revalidates, sends only the carrier and target month to the local import endpoint, and reports aggregate counts only. The endpoint reads only its two allow-listed archive folders.
8. Verify the local dashboard for the target month and carrier. The importer must handle exactly the validator's `importable` count; `rows - excluded = importable`. Report any difference without exposing row data.

## Commands

Validation defaults to the previous month:

```powershell
python scripts/validate_carrier_csv.py --carrier yamato --directory "<Yamato archive>"
python scripts/validate_carrier_csv.py --carrier sagawa --directory "<Sagawa archive>"
```

Use an explicit period when repairing older data:

```powershell
python scripts/validate_carrier_csv.py --carrier yamato --directory "<archive>" --year 2026 --month 7
```

Import only after validation passes:

```powershell
python scripts/import_validated.py --carrier yamato --directory "<archive>" --endpoint http://127.0.0.1:3003/api/import
```

The scripts deliberately emit filenames, hashes, schema counts, date ranges, and aggregate result counts only.

## Bridge Input Contract

Use the compact Bridge job input as complete. Run a fresh, non-resumed `codex exec` only for missing downloads. Never open, read, search, or reuse app Chats, previous tasks, saved sessions, or development history. The TSA interactive Bridge owns the CLI process and runs this task serially with its other browser jobs. Use Astra (gpt-6-astra), medium reasoning. The local carrier application owns archive validation, SQLite import, locking and alerts; do not duplicate these actions inside the AI phase.

The local page has one month selector and one 実行 button. It enqueues a local request; it does not launch another CLI worker or console. Wait for operator action after any login, MFA, CAPTCHA or permission issue; report the observed condition without inferring an unverified cause.
