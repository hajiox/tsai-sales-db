---
name: tsa-ec-profit-report
description: Download, archive, classify, and normalize monthly EC settlement deductions for TSA. Use for Codex Bridge jobs that collect marketplace fees, payment fees, refunds, seller-funded discounts, coupons, points, fulfilment or shipping charges, credits, and payout amounts from Amazon, Rakuten, Yahoo Shopping, Mercari Shops, BASE, Qoo10, or TikTok Shop.
---

# TSA EC Profit Report

## Bridge Input Contract

- Run only from a fresh, non-resumed `codex exec`. Never open, read, search, or reuse app Chats, prior tasks or threads, transcripts, rollouts, or saved sessions.
- Treat the compact Bridge job input as complete. Use only that input and the references explicitly required by this Skill.

Use the signed-in Chrome session and official seller/admin pages only. Read the requested channel section in [references/channels.md](references/channels.md) and the fixed output contract in [references/schema.md](references/schema.md).

## Browser Session Reuse

- Select the browser using the requested official URL with `agent.browsers.getForUrl(targetUrl)`. Do not select a generic Chrome instance first; more than one Chrome profile or extension instance can be connected.
- After connecting to Chrome, list its existing tabs before opening anything.
- Reuse a tab whose URL is already on the requested channel's official host. Some seller sites keep authentication in the original tab, so a newly opened tab can appear logged out even in the same Chrome profile.
- If several tabs match, prefer a non-login page whose visible account/store matches the requested channel. Navigate that same tab only when necessary.
- Create a new tab only when no tab for the official host exists.
- Keep an operator-owned existing tab open when finalizing the browser task. Finalize a claimed existing tab with `keep: [{ tab, status: "handoff" }]` or its documented equivalent; never use `keep: []` for that tab.

## Workflow

1. Open the official seller/admin site for the requested channel.
2. Select the exact inclusive period supplied by the Bridge.
3. Download the most detailed transaction, settlement, billing, or order reports needed to identify seller-borne deductions.
4. Confirm the period inside each report. Do not infer it from a file name alone.
5. In Bridge jobs, preserve every original unchanged in the supplied job work folder as `channel-YYYY-MM-DD_YYYY-MM-DD-description.original.ext`. The local Bridge copies staged originals to the final network archive after the isolated run; do not write to the network share directly.
6. Inspect the originals and create exactly one normalized JSON in the job work folder as `channel-YYYY-MM-DD_YYYY-MM-DD.ec-profit.json`.
7. Reconcile the categories and set the coverage level. Never invent an amount or silently force a mismatch.
8. Return the staged originals and normalized JSON in `source_files`. The Bridge replaces staged source paths with final archived paths before TSA import.

## Classification Rules

- Store every cost or deduction as a positive number.
- `gross_sales` is customer merchandise and customer-paid shipping before seller-funded discounts and refunds, tax included.
- Include only seller-funded discounts, coupons, and points in EC deductions. Record marketplace-funded benefits separately in `excluded_marketplace_funded_discounts` using the official benefit or reimbursement amount; never infer it from a sales or payout difference.
- Exclude all advertising charges. TSA imports them separately.
- Refunds are positive deductions. Recovered fees or reimbursements are `other_credits`.
- Carrier, fulfilment, and shipping charges billed to the seller are `shipping_costs`.
- Put a clearly identified selling commission in `platform_fees` and payment processing in `payment_fees`.
- If a source combines categories that cannot be separated, use `other_costs`, explain it in `notes`, and set `coverage_level` to `partial`.
- If seller funding is unclear, do not count it. Set `coverage_level` to `needs_review` and explain the exact row or column.
- For mid-month jobs, set `coverage_level` to `partial` even when every available row is collected.
- Preserve decimals from the source. Do not round row amounts before summing.

## Stop Conditions

Return `waiting_for_user` for login, MFA, CAPTCHA, account selection, download permission, or changed UI requiring a person. Return `needs_review` when an official monthly report is not published, the settlement result is empty while period-matched orders exist, or the report type, funding source, or arithmetic cannot be confirmed. Network archive writes are owned by the Bridge and are never a user-action condition. Do not change orders, listings, prices, promotions, advertising, billing settings, or account settings.
