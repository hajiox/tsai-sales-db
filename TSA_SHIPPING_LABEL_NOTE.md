# TSA Shipping Label Note

- 2026-08-02: Added persistent import and export history. Each Amazon/Yahoo order import now stores the parsed source rows, sender settings, and conversion snapshot in `shipping_label_imports`; every Yamato/Sagawa download stores the exact generated CSV in `shipping_label_exports`.
- The shipping-label screen now lists the latest 50 imports, can restore an imported order set, re-download the exact CSV that was previously output, and delete an import together with its exports. Customer addresses and phone numbers remain behind the existing administrator-only API, with RLS and public grants closed on both history tables.
- 2026-07-27: Investigated a Rakuten RMS adapter without changing production settings or downloading customer order data. The store has the current R-Backoffice normal-order CSV download service available, and its selectable fields are sufficient to generate the same Yamato B2 and Sagawa Smart Club outputs as the Amazon and Yahoo adapters.
- Rakuten rows must be grouped by both order number and destination ID. Grouping only by order number would incorrectly merge orders that use Rakuten's multiple-destination feature.
- Product matching should prefer system-integration SKU, then SKU management number, product management number, and product number. RMS delivery category should validate or fall back from the TSA mapping; a disagreement must be shown as a warning instead of silently changing the carrier or temperature class.
- The local Rakuten sales data contains 108 unique product codes. Against the current 216 shipping mappings, 60 are direct unique code matches and 25 more have a unique name candidate; at least 23 require manual confirmation.
- The current parser already supports Shift-JIS, item-detail rows, gift detection, and the common order-level Yamato/Sagawa rules. Rakuten needs a source adapter, shared mapping columns, multiple-destination handling, requested delivery date/time fields, and a Rakuten sender name.
- No RMS Web API credentials are configured in TSA. The recommended first release is CSV drag-and-drop; automatic order retrieval and shipment-result return can be a separate RMS Web API phase.

- 2026-07-26: Amazon TXT/CSV and Yahoo CSV now preserve address fragments as text so lot numbers such as `2307-8` and `5-7-63` are not converted into dates. Address cells already date-formatted in Excel are restored before carrier CSV generation.
- 2026-07-12: Amazon shipping-label conversion now applies order-level carrier rules.
- If one order contains 3 or more Nekopos units, it is output as one Yamato normal label.
- If one order contains normal and cold/frozen items, normal lines stay on one Yamato normal label and cold lines are output as separate Yamato frozen/chilled labels.
- 2026-07-14: Added gift-order detection using Amazon `buyer-name` and `recipient-name`. Width, whitespace, and trailing honorific differences are ignored; different names produce `<buyer-name>ご依頼分`.
- Gift notes are exported to Yamato B2 `記事` and Sagawa Smart Club `品名５`, including every label created when an order is split. The conversion result table also shows the gift note before download.
- Verified with the source Amazon workbook and synthetic Yamato/Sagawa/mixed-temperature cases. `npm run predeploy` passed and production was deployed to `https://tsa-kvms3k8z2-hajioxs-projects.vercel.app` (alias `https://v0-tsa-19.vercel.app`).
- 2026-07-20: Added Amazon / Yahoo! Shopping tabs. Yahoo's `L1=...&L2=...` item, title, and quantity fields are expanded and then passed through the same order-level Yamato/Sagawa rules.
- The mapping table now stores Amazon SKU and Yahoo ItemId on one shared product row. Missing products can reuse the opposite channel's label name and delivery pattern, while channel-only products remain editable in the same table.
- Imported `変換表_yahoo.xlsx`: 141 Yahoo codes, 104 linked to existing Amazon rows, 37 Yahoo-only rows, and no unresolved delivery patterns. The current 28-row Yahoo sample produced all 28 orders with no missing mapping, skipped row, or invalid phone number.
- Added CP932 Yahoo CSV detection and recovery of leading Japanese phone zeroes for CSV files that were resaved through Excel.
- 2026-07-24: Yahoo! Shopping exports now use `会津ブランド館ヤフー店` as the sender name in both Yamato B2 and Sagawa Smart Club files. Amazon exports continue to use the Amazon shop sender name.
