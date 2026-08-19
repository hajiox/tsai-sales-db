---
name: tsa-web-sales-analysis
description: Analyze TSA's compact WEB sales packet for either the 1st-15th interim snapshot or the monthly final, then produce evidence-backed management actions and a short floor-staff summary. Use only for TSA Codex Bridge WEB sales analysis jobs.
---

# TSA WEB Sales Analysis

Analyze only the compact JSON packet embedded in the task prompt. Do not browse, inspect the repository, read chat history, fetch other files, or run shell commands. The packet already contains the required comparisons and rates.

## Required Method

1. Read the embedded packet once. Do not reopen or recompute it with tools.
2. Check `data_quality` before drawing conclusions.
3. Check `analysis_scope.period_type` before analysis. For `half_month`, never compare the partial period with full prior months.
4. For `monthly`, compare the target month with both the previous month and the previous year and use the 13-month trend.
5. Analyze sales and expenses separately, then connect them in the executive summary.
6. Return valid JSON matching the supplied output schema. Write all narrative fields in Japanese.

## Interim Rules

- `half_month` means only the 1st through the 15th and is not a completed month.
- Analyze sales quantity, product mix, channel mix, and practical sales actions only.
- Do not infer or discuss monthly advertising cost, EC fees, settlements, final profit, month-over-month rates, or year-over-year rates.
- State clearly that the data is an interim snapshot through the 15th.

## Floor Staff Summary

Always fill `floor_staff_summary` in concise Japanese for staff on the NEW brand hall floor board.

- Keep it within six short lines and about 300 Japanese characters.
- Include the target period, what sold or changed, and one practical point staff can act on.
- Exclude advertising cost, EC fees, EC deductions, settlements, ROAS, profit rate, and management accounting terms.
- Do not expose internal uncertainty or technical processing details; state only the operationally useful result.

## Business Rules

- Historical product cost is the monthly saved cost in the packet. Do not replace it with a current master price.
- `final_profit = sales - product_cost - ec_deductions - advertising_cost`.
- Marketplace-funded coupons or discounts are not TSA expenses. Do not deduct them again.
- Product margin before EC deductions is not the same as final profit.
- Zero-sales products do not belong in worst-seller rankings, but a product that fell from positive sales to zero is a decline risk.
- An estimated or incomplete settlement must be identified as a limitation. Never present it as an official confirmed amount.
- Attributed ad sales from different platforms are not directly comparable unless the packet uses the same attribution window. Note this limitation when relevant.

## Analysis Standard

Every important conclusion must cite numeric evidence from the packet. Avoid generic recommendations such as "reduce costs" or "increase sales".

Prioritize actions that can be executed within 30 days. Each action must include:

- what to do;
- why it matters now;
- at least one numeric evidence item;
- expected impact stated as a testable range or direction;
- a deadline;
- a KPI;
- a stop or rollback condition;
- confidence level.

Separate fact, interpretation, and hypothesis. If causal proof is unavailable, say "可能性" and propose a measurable test.

## Focus Areas

- Sales: channel mix, product/series concentration, growth and decline, quantity versus unit economics, and vanished products.
- Expenses: product-cost rate, EC-deduction rate, fee composition, seller-funded promotions, refunds, shipping/other costs, ad ratio, and final profit rate.
- Advertising: budget concentration, ROAS or attributed value where available, weak high-spend targets, and missing mappings/data.
- Cash/profit quality: sales growth that fails to increase final profit, and the expense rate responsible for the gap.

Set `status` to `needs_review` when missing or estimated data could materially reverse a major conclusion. Otherwise use `completed` and still list lesser limitations in `data_quality`.
