# Normalized JSON Contract

Write UTF-8 JSON with exactly these keys. Amounts are tax-inclusive JPY numbers. Local source paths must be absolute.

```json
{
  "channel": "amazon",
  "report_month": "2026-07",
  "period_start": "2026-07-01",
  "period_end": "2026-07-31",
  "report_basis": "transaction",
  "coverage_level": "complete",
  "gross_sales": 0,
  "refunds": 0,
  "platform_fees": 0,
  "payment_fees": 0,
  "seller_discounts": 0,
  "seller_coupons": 0,
  "seller_points": 0,
  "shipping_costs": 0,
  "other_costs": 0,
  "other_credits": 0,
  "net_payout": null,
  "excluded_marketplace_funded_discounts": 0,
  "excluded_ad_costs": 0,
  "notes": null,
  "source_files": ["C:\\absolute\\archive\\report.original.csv"]
}
```

Allowed `report_basis`: `order`, `transaction`, `settlement`, `mixed`.

Allowed `coverage_level`: `complete`, `partial`, `needs_review`.

Before finishing, calculate:

`gross_sales - refunds - platform_fees - payment_fees - seller_discounts - seller_coupons - seller_points - shipping_costs - other_costs + other_credits`

Compare it with `net_payout` when the source represents the same transaction basis. Explain reserves, carryovers, or timing differences in `notes`; never put them into a convenient category merely to make totals agree.

`excluded_marketplace_funded_discounts` is informational reimbursement/benefit revenue used for adjusted sales reconciliation. It is not a seller deduction and is not added to TSA profit when TSA sales already use the full saved unit price.
