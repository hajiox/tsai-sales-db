# Yahoo EC fee classification restored (2026-09-06)

User policy supersedes the earlier advertising reclassification: PR option
(including bonus-store participation) and promotion package charges are
`platform_fees`; their cancellations are `other_credits`. Click/Yahoo/Google
advertising remains `excluded_ad_costs`, net of its own cancellations.

August official archived billing/receipt ledger recalculation:
- EC deductions: 717,818 yen (was 470,764).
- Advertising: 225,993 yen (was 473,047).
- Combined costs: unchanged at 943,811 yen.
- Net payout: unchanged at 2,913,665 yen.

The repair script retains dry-run, before-image backup, optimistic concurrency,
combined-cost conservation and read-back checks. Existing classification tests
cover independent EC-fee and advertising cancellations. Coverage stays partial:
sales and settlement periods are not fully reconciled. Shared-context automatic
sync is blocked by pre-existing uncommitted changes; installed task Skill and
repository copies are updated without discarding those changes.
