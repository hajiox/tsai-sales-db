# Yahoo cost classification, 2026-09-06

August had PR option and promotion package costs in EC deductions, while previous months classified them as advertising. The import endpoint now derives Yahoo categories from exact official statement item totals, including advertising cancellation credits. Missing ledgers, unknown names, duplicate item names and inconsistent payouts are rejected before data mutation. Other channels keep their existing import contract.

The dedicated Skill now supplies grouped billing and receipt items. Old normalized Yahoo JSON without the statement is not sufficient for a new import; regroup archived originals using the updated Skill. No extra download is required for complete archived sources.

Verified August sources: three CP932 billing CSVs (11,498 rows), one receipt CSV (3,066 rows). Billing 947,527 JPY, receipts 3,861,192 JPY, payout 2,913,665 JPY. PR/package charges 247,287 JPY less advertising refunds 233 JPY move 247,054 JPY from EC deductions to advertising. EC deductions become 470,764 JPY; advertising 473,047 JPY; combined costs remain 943,811 JPY. Marketplace-funded coupons remain excluded. Mixed-period coverage remains partial.

Focused verification: deterministic classifier tests, official-source repair dry run with cost-conservation assertion, import-policy and Skill-contract tests. Repair script defaults to dry run, saves a before snapshot, uses an optimistic updated_at guard and verifies the written row. Application build and production verification are required before completion.
