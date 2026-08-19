# TSA Brand Store Inventory

Updated: 2026-07-30

- Route: `/brand-store-analysis/inventory`
- Fiscal years run from August through the following July (for example, FY2026 is 2025-08 through 2026-07).
- One stocktake table is saved per fiscal year. Selecting a saved year reopens that table without replacing entered values or manually added/removed rows.
- A new fiscal-year table is generated from sales recorded within that fiscal year. Products without sales in that period are excluded.
- The existing FY2026 table was retained as-is and assigned to FY2026 so its prior edits remain intact.
- Selling price is prefilled; wholesale price, quantity, and note start blank.
- Manual products can be added, and every row can be removed from the current stocktake list.
- The page supports mobile entry, filtering, search, history, and CSV export.
- The access QR code is always visible in the stocktake page header.
- Stocktake rows now carry an editable tax mark: reduced-rate food at 8% and standard-rate goods at 10%. Food rows are sorted first.
- Wholesale price input is tax-exclusive. Each row, the summary, and the CSV show both tax-exclusive inventory value and tax-included reference value.
- Existing entered wholesale prices were backed up in `brand_store_inventory_wholesale_tax_backup`, then converted from tax-included values to tax-exclusive values with two-decimal precision. All 133 converted prices reproduce their original tax-included yen amount.
- Product-master imports retain AirREGI's `適用税率` when it is present. Existing rows were initialized from the source sales category and can be corrected directly with the tax mark.
- Selling price is explicitly labeled tax-exclusive. If a product is missing from the product master, generation uses the highest observed unit price in the fiscal period instead of the latest discounted average.
- Price-source audit on 2026-07-30: the FY2026 stocktake has 242 rows. 190 prices match the AirREGI-derived `product_master`, 43 non-manual rows have no matching master and use sales-derived fallback prices, and 9 rows are manually added.
- The stocktake header now imports the complete AirREGI product-edit CSV in Shift_JIS or UTF-8. It normalizes tax-included prices to tax-exclusive prices, uses the most frequent price for products with multiple variation rows, and synchronizes only the current draft stocktake while preserving wholesale price, quantity, and note. Past fiscal-year tables are not changed.
- The page shows an update alert when the product master has not been imported for three months. Import history is stored in `brand_store_product_master_imports`.
- Production import on 2026-07-30 used `商品一括編集_20260730131528.csv`: 1,351 products, 99 inserted, 1,196 updated, 358 price changes, and 159 current-stocktake rows synchronized. Verified examples include asparagus tea at tax-exclusive JPY 390, Okuyama Kenta-mame at JPY 390, Ryozen-zuke at JPY 520, and Odaka ichimi at tax-exclusive JPY 556.
- Manual stocktake rows now link to the AirREGI master when their normalized name has exactly one safe match; a cosmetic suffix such as `(green)` may be ignored for matching. Selling price and tax rate then follow AirREGI while wholesale price, quantity, note, and the manual display name remain unchanged.
- On 2026-07-30, three safe manual matches were repaired: Aizu mountain salt 30g was linked to product 215 and corrected to external-tax JPY 600; Aizu ginseng powder 70g and sake salt were also synchronized to their current master prices.
- Incomplete and completed filters now use the same compact row layout. Manual product name and selling-price edits are available from the pencil button instead of permanently expanding those rows.
- Stocktake unit price is no longer entered manually. Every row uses exactly 70% of the tax-exclusive selling price, rounded to two decimal places; a database trigger prevents manual or stale-client overrides.
- All 242 FY2026 rows were recalculated on 2026-07-30. The original manual values are retained in `brand_store_inventory_wholesale_rate_backup_20260730`.
- Stocktake completion now depends only on whether quantity has been entered. The production table currently shows 155 of 242 rows entered. Notes remain optional.
- The desktop and mobile UI show the calculated 70% unit price as read-only. CSV export uses the same value, and product-master or manual selling-price changes recalculate it automatically.
- AirREGI API review on 2026-07-30: AirREGI issues API keys/tokens for approved system integrations, but the officially documented data scope is transactions, cash movements, and settlements. No public endpoint for reading the current product master/list price was found, and API terms prohibit use by an unapproved integration provider. The preferred path is to ask Recruit to approve TSA and confirm product-master access. Until then, reliable automation requires a local connector that periodically downloads an official AirREGI product-edit or stocktake-detail CSV and synchronizes it to TSA; do not scrape AirREGI from Vercel.
- Production URL: `https://v0-tsa-19.vercel.app/brand-store-analysis/inventory`
