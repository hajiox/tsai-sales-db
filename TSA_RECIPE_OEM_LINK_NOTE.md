# TSA Recipe OEM Link Note

- 2026-07-07: OEM tab inline link now supports "+ new product" creation.
- New OEM products are created in `wholesale_products` with `product_type = "OEM"` and immediately linked to the recipe.
- A matching `oem_products` mirror row is also created/updated for the OEM sales input flow.
- 2026-07-08: OEM sales input now searches `wholesale_products` OEM master data first, because recipe-linked OEM products live there. Legacy `oem_products` remains as a fallback for old sales display.
- 2026-07-08: OEM dashboard calculations use the current OEM product master price whenever available. Saved historical `unit_price` remains stored for audit/history, but is not used for current dashboard totals.
