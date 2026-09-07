# Monthly Carrier CSV Workflow

## Scope

Collect the previous month's shipment-history CSV files from Yamato B2 and Sagawa eHiden III, preserve them in the approved archives, validate them locally, and import them into `C:\作業用\yamato-analytics`.

Approved archives:

- Yamato: `\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\ヤマト出荷データ`
- Sagawa: `\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\佐川出荷データ`

Raw files contain personal information. Do not display rows, paste contents into chat, commit them, upload them, or save them in the Skill.

## Preflight And Archive Reuse

1. Calculate the previous calendar month in Japan time.
2. Check the carrier archive for files matching `【抽出前】YYYY年M月*.csv`.
3. Run the bundled validator with the carrier, archive directory, year, and month.
4. Reuse the archived files when validation passes and the archive covers the full export plan.
5. If the archive is partial, retain valid chunks and download only missing, non-overlapping date ranges. Renumber chunks contiguously only after confirming no overlap or gap in the export plan.
6. Prefer a previously verified archived source over downloading the same carrier and period again.

The validator checks encoding, CSV shape, filename sequence, per-file limit, target-month dates, scientific-notation damage, exact duplicate rows, Sagawa deletion exclusions, and file hashes without logging row values.

## Browser Boundary

Use the Chrome control Skill and the user's existing signed-in Chrome tabs. Start from the carrier's normal menu rather than storing a deep or signed URL.

Stop and clearly ask the operator to continue when any of these appears:

- login or password entry
- account or contract selection that is not already established
- MFA or one-time code
- CAPTCHA
- access-denied or permission confirmation
- a changed export screen where date or file mapping is uncertain

Do not inspect cookies, local storage, request authorization headers, or signed download links. Do not put those values in notes or logs.

## Yamato B2

1. Open the logged-in Yamato B2 tab.
2. Navigate through the normal menu to the issued-shipment/history search used for CSV output.
3. Set a non-overlapping date range within the target month and search.
4. Check the result count before export.
5. If the result exceeds 1000, reduce the date range and search again. Continue splitting by date until every chunk is 1000 or fewer.
6. Select the complete result set, use file output, and download the CSV.
7. Move the download immediately into the Yamato archive and name it `【抽出前】YYYY年M月A.csv`, then `B`, `C`, in date-range order.
8. Record only the date range, result count, and destination filename in the run summary. Do not record shipment details.

If a single day exceeds 1000 and the UI has no verified lossless subdivision, stop. Do not export only the visible first 1000 records.

## Sagawa eHiden III

1. Open the logged-in Sagawa Smart Club/eHiden III tab.
2. Navigate through the normal menu to the shipment-history list.
3. Set a non-overlapping date range within the target month and search.
4. Check the result count before export.
5. eHiden III displays at most 2000 results. If the result reaches or exceeds 2000, reduce the date range and search again until every chunk is below the display ceiling and demonstrably complete.
6. Use the shipment-history data output for the complete filtered result.
7. Move the download immediately into the Sagawa archive and use the same contiguous naming rule, starting with `A`.
8. Record only the date range, result count, and destination filename.

If a single day reaches the 2000 display ceiling and no verified lossless subdivision is available, stop and request operator guidance.

## Naming And File Handling

- Required pattern: `【抽出前】YYYY年M月A.csv`
- Month is not zero-padded.
- Chunk labels are uppercase and contiguous: `A`, `B`, ..., `Z`, `AA`, and so on.
- Keep Yamato and Sagawa files in their separate archive folders.
- Do not open and resave CSV files in Excel. This can damage tracking/order numbers through scientific notation.
- Remove or isolate accidental overlapping downloads before validation and import.

## Validate And Import

From the Skill directory, validate first:

```powershell
python scripts/validate_carrier_csv.py --carrier yamato --directory "\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\ヤマト出荷データ" --year YYYY --month M
```

Then import:

```powershell
python scripts/import_validated.py --carrier yamato --directory "<archive>" --year YYYY --month M --endpoint http://127.0.0.1:3003/api/import
```

Repeat with `--carrier sagawa` and the Sagawa archive. The importer sends only the validated carrier/month to the local app; the app reads matching files from its allow-listed network archive.

## Completion Checks

1. Confirm the validator reports `PASS` for both carriers.
2. Confirm the local import reports the expected number of files and no file-level errors.
3. Open `http://127.0.0.1:3003/` or the LAN alias and select the target month.
4. Confirm both carriers appear and the API handled row count equals the validator's `importable` count. Sagawa rows with `削除区分=2` are reported under `excluded` and are not imported.
5. Keep the browser tabs only when the operator still needs them; otherwise return them to a normal menu or close task-created tabs.
6. Update the relevant local operation note with the date, period, file counts, aggregate row counts, validation result, import result, and any limitation. Do not include personal information.
