# Channel Acquisition Guide

Use the most detailed official export available. UI wording can change; match by the report contents listed below. If a required report is unavailable, stop with the exact missing report instead of substituting an unrelated sales summary.

## Amazon

- Seller Central: Reports > Payments > Date Range Reports.
- Prefer a transaction report for the requested custom date range; use Settlement Report V2 only when transaction rows are unavailable.
- Confirm transaction type, order ID, product sales, promotional rebates/discounts, Amazon fees, fulfilment or shipping fees, refunds, credits, and total.
- Seller-funded points belong in `seller_points`. Advertising charges must be excluded even if they appear in payments.
- If the prepared report's official download routes to `/payments/reports/api/download-report?reportId=...` but Chrome shows `ERR_BLOCKED_BY_CLIENT` or emits no download event, return to the same signed-in report repository tab and use the Skill's single same-origin CDP fetch. Fetch only that verified report response with existing tab credentials, write the bytes to the job work folder, and verify the CSV dates and transaction columns. Do not inspect cookies or retain any redirect or signed URL.

## Rakuten

### Provisional actuals before the BillPay calendar-month file

- Do not leave a closed sales month entirely on a historical-ratio estimate while waiting for BillPay. Use the signed-in RMS sources below to replace every amount that is already observable, then keep only unresolved monthly charges estimated.
- RMS top and Store Karte expose current gross sales before BillPay finalization.
- In R-Backoffice, `Data download/upload` provides separate `Normal purchase`, `Payment detail`, and `Refund` exports. For monthly settlement work, create payment detail by `payment confirmed date` and create the matching refund export. One export is limited to 60 days and this account has the service enabled. The final download requires the dedicated CSV-download user name and password; treat missing credentials as operator waiting and never persist them.
- R-Backoffice `Statement management` exposes monthly and daily point-grant totals plus CSV. Use the visible monthly total as a provisional point fact after checking its scope against the latest BillPay point row; do not estimate points from sales once this fact is available.
- BillPay also exposes pre-billing confirmation, settlement confirmation, transfer status, and monthly cash-flow outlook. These settlement-cycle facts may supplement the provisional view, but must not be presented as a calendar-month final because their periods can cross month boundaries.
- Keep the final BillPay calendar-month CSV as the reconciliation authority for fixed subscriptions, system/affiliate charges, taxes, adjustments, and other items not available from earlier RMS sources. When it appears, replace the provisional row rather than adding a second charge.
- Verified 2026-08-11 in the signed-in store: July 2026 payment detail was generated for 533 `payment completed` orders; an earlier all-status export contained 1,440 rows. July point statement was already visible at 1,429 grants / JPY 123,101 while the latest BillPay calendar-month file was still June.

### Rakuten provisional fee calculation before BillPay publication

- Never estimate the entire Rakuten deduction total with one historical sales ratio. Calculate each component from the best currently available input and preserve the basis of every component.
- Keep an effective-dated fee-rule registry with the official source URL, contract plan, average-basket bracket, sales or settlement tier, tax rate, and rounding rule. Recheck the registry when an official final differs from the calculated value beyond tolerance.
- This store's February-June 2026 BillPay statements reproduce the Standard-plan, average-basket-under-JPY-7,000 progressive system-fee table. For the current rule version, apply the PC bands separately as 4.0%, 3.0%, 3.0%, 2.8%, 2.8%, 2.6%, and 2.4%, and the mobile bands as 4.5%, 3.5%, 3.5%, 3.3%, 3.3%, 3.1%, and 2.9% across the published monthly-sales bands. Use actual current PC/mobile taxable normal sales when available. Otherwise use the trailing finalized PC share; February-June reconstructed PC share was 26.6%-29.3%, with a 27.0% median fallback. Add 10% Japanese tax after calculating the tax-exclusive fee.
- The transaction-safety fee is the current normal-sales basis multiplied by 0.1%, plus 10% tax. Do not use TSA list-price sales when the RMS normal-sales basis is available.
- Calculate Rakuten Pay from the current settlement basis and the public average-settlement-unit/monthly-settlement-amount matrix, then add 10% tax. If the settlement basis is not yet observable, infer it from current gross sales using the trailing median ratio of finalized settlement basis to gross sales. For February-June 2026, the current JPY-3M-to-JPY-5M and under-JPY-7,000 bracket is 3.3%; the reconstructed settlement-basis factor was 1.03142. Back-testing `gross sales * 1.03142 * 3.3%` against those five tax-exclusive BillPay rows had a maximum relative error of 0.42%. Re-select the public rate whenever the month crosses a bracket.
- Use the RMS monthly point statement as a provisional actual, not a sales-ratio estimate. June RMS showed JPY 131,808 versus JPY 131,862 in BillPay, a JPY 54 difference. BillPay remains final and replaces the provisional amount.
- Sum seller-funded shop coupons from current order/coupon data. Only when that source is unavailable, use the trailing median finalized tax-exclusive coupon ratio; February-June 2026 median was 0.754% of gross sales, then add 10% tax. Mark this fallback as low confidence.
- Calculate food affiliate charges as affiliate-attributed sales multiplied by 4%, plus the public affiliate-system rate applied to the reward, then add 10% tax. Use actual affiliate-attributed sales when visible. Otherwise use a trailing median affiliate-sales share; February-June 2026 median was 9.72%, with a wide 8.83%-13.28% range, so this fallback is low confidence.
- Carry active fixed services independently of sales. The February-June statements consistently contained R-SNS JPY 3,000, compass JPY 2,980, and review service JPY 10,000 tax-exclusive. Treat R-Mail and RPP/coupon-advance rows as advertising and keep them out of EC deductions.
- Keep the Standard-plan JPY 65,000 monthly fee plus tax as a separate management accrual from BillPay settlement deductions. This prevents payout reconciliation errors while allowing management profit to include the monthly economic cost.
- Store each provisional component with one of `observed_actual`, `official_formula`, `historical_proxy`, or `official_final`, together with input amounts, rule version, source month, confidence, and calculated timestamp. BillPay finalization replaces the same component keys instead of adding another charge.
- On every final BillPay import, back-test each provisional component. Update only historical proxy factors, retain immutable rule versions, and alert when formula-based error exceeds JPY 1,000 or 1.0% for two consecutive months.

- Use Rakuten BillPay as the primary calendar-month source. Sign in at `https://billpay.rakuten.co.jp/`, then open `月次収支見込みの確認` (`/payment_billing_details`). BillPay uses its own company/store ID and password; never persist credentials in files or logs.
- Before downloading, read the page's maximum available month (`#maxMonth[data-max-month]`). If the requested `YYYYMM` is newer, return `needs_review` with the requested month and current maximum. Do not substitute settlement statements whose close dates straddle months. TSA keeps a provisional estimate based on prior official monthly ratios and retries incomplete months around BillPay's next provisional-statement update.
- BillPay's official FAQ says final settlement statements are disclosed on the 5th and 20th and provisional statements around the 10th business day: [Rakuten BillPay FAQ](https://billpay.rakuten.co.jp/faq/faq.html). Treat that as the expected refresh window, not a guaranteed row-finalization date. Keep checking the requested month for two calendar months because included fee rows can remain `概算` after the first monthly CSV appears.
- A saved maximum-month or unpublished screenshot is historical evidence only. On every retry, read the current BillPay page before returning `needs_review`; if BillPay redirects to login, return `waiting_for_user` instead of reusing the old screenshot.
- In `データダウンロード`, select exactly the requested month and download `月次収支見込みの確認_YYYYMM-YYYYMM.csv`. The file is CP932/Shift-JIS and contains `売上`, itemized fees, `概算/確定ステータス名`, amount, and tax-rate fields.
- Archive the original unchanged. Use the `売上` row as `gross_sales`. The fee rows are tax-exclusive: convert 10% rows to tax-inclusive JPY, keep 0% rows unchanged, and preserve negative credits before category totals.
- Classify `楽天ペイ利用料` as `payment_fees`; PC/mobile and transaction-safety system usage as `platform_fees`; `ショップクーポン` as `seller_coupons`; `ポイント付与料` as `seller_points`; fixed subscriptions/services and affiliate charges as `other_costs`; negative free-use/adjustment rows as `other_credits`.
- Classify `検索連動型広告(RPP)`, coupon-advance advertising, and `R-Mail` charges as `excluded_ad_costs`. TSA compares this total with the dedicated Rakuten ad import and uses the larger amount, preventing both double counting and omission of non-RPP ads.
- Set `net_payout` to `null` because the calendar-month sales and costs are paid across multiple settlement cycles. Use `report_basis: mixed` and explain this in `notes`.
- If any included non-ad cost row remains `概算`, set `coverage_level: partial`, list the affected items in `notes`, and let the bounded mid-month retry replace it after BillPay changes them to `確定`. Use `complete` only when the requested month is available and all included rows are confirmed.
- The RMS order/payment CSV service is already active. The monthly paid `CSV商品一括編集機能` is a separate product-editing option and is not required for this workflow.

## Yahoo Shopping

- Store Creator Pro: obtain product sales, billing detail, and receipt detail for the requested period. Use `mixed` because more than one official report is required.
- In `利用明細 > 受取明細`, include every payment cycle covering the requested order month. Read the tax-inclusive `モールクーポン利用料` from the receipt summary and sum it into `excluded_marketplace_funded_discounts`.
- Download and archive each `利用詳細CSV`. It contains order IDs for `モールクーポン利用料` and is the evidence used when product-level allocation is required.
- `特典の一部利用料` is a separate benefit/payment category. Do not merge it into Yahoo-funded coupon reimbursement without explicit order-level evidence.
- Never derive Yahoo-funded coupon reimbursement from the difference between product sales, receipt totals, billing totals, or payout. Those totals mix payment timing and unrelated categories.
- Confirm merchandise sales, cancellations/refunds, payment and system fees, store-funded coupon or points, and shipping-related charges. Yahoo-funded coupons remain outside EC deductions but are preserved for adjusted sales reconciliation.

## Mercari Shops

- Shops management: export sales or transaction detail covering the requested period.
- Confirm sales, cancellations/refunds, sales commission, payment or transfer fees, shipping charges, and adjustments.
- A bank transfer fee outside the order period is `other_costs` only when the report explicitly includes it.

## BASE

- BASE administration: export order/sales detail and payout or transfer detail when needed.
- Confirm merchandise sales, cancellations/refunds, BASE Easy Payment fee, service usage fee, seller-funded coupon or discount, shipping charge, and adjustments.
- BASE-funded promotions are excluded.

## Qoo10

- Qoo10 has no calendar-month statement publication date. Settlement is order based and anchored to delivery completion: general sellers are settled after 15 days on the following Wednesday, excellent sellers after 10 days on the following Wednesday, and power sellers after 5 days on the following Wednesday. Sources: [settlement flow and dates](https://doc.image-qoo10.jp/sqm/JP/guide_seisannonagaretoseisanbi_JP.pdf) and [settlement detail fields](https://doc.image-qoo10.jp/sqm/JP/guide_uriagekinseisankinoutiwake_JP.pdf).
- Start with a period-matched official QSM order/delivery export. Confirm order number, order/payment date, delivery completion date, quantity, purchaser payment amount, sales price, discount, and order total. Compute the conservative latest settlement bound with the general-seller 15-day cycle when the current seller grade is not proven.
- In QSM open `精算管理 > 販売内訳` (`/GMKT.INC.Gsm.Web/Account/SellingReport.aspx`). The upper `販売精算内訳` and lower `販売詳細内訳` are independent search forms. `#srch_sday`, `#srch_eday`, and `#btn_search` control only the upper summary. They do not set or execute the lower detail search.
- For the lower `販売詳細内訳`, set the date and criteria controls inside the same lower block that contains `#btn_search_sell_detail`, then click `#btn_search_sell_detail`. Verify the dates visibly rendered in that lower block before accepting the result, and export rows with `#btn_excel_sell_detail`. A screenshot where the upper period is correct but the lower block still shows its default date is invalid evidence.
- Search the lower block twice before concluding that detail is unavailable. First use `購入者の決済日` for the requested order period with the detail-condition value empty; this is the primary itemized-report search documented by Qoo10. Then use `精算日` for the computed settlement-cycle range as a reconciliation cross-check.
- If either period search returns zero while the period-matched order export contains orders or Q account contains matching settlement credits, search every official order number individually in the lower form. Process at most four order numbers per browser-tool call so the browser runtime cannot discard the whole fallback on a long call. For each order, select `購入者の決済日`, set a range containing that order's payment date, select `注文番号`, enter the exact order number, click `#btn_search_sell_detail`, and preserve any returned row. If that returns zero, repeat once with `発送日` and a range containing the official shipping date.
- After every batch, write or update `qoo10-YYYY-MM-DD_YYYY-MM-DD-reconciliation-checkpoint.original.json` in the job work folder. Record attempted order numbers, which date basis was searched, returned row identifiers, Q-account credits, and the remaining order numbers. If a browser call times out or its JavaScript kernel resets, reconnect to the same signed-in host and continue only the unattempted items from that checkpoint. A timeout is not a zero-row result. Do not conclude that detailed reconciliation is unavailable until every period order has a recorded result for purchaser-payment date and, where needed, shipping date.
- A zero result for the upper form, the settlement-date search, or one purchaser-payment-date search never proves that detailed settlement rows are unavailable.
- Export the lower `販売詳細内訳` with `Excel` when rows exist. Confirm order number, purchaser payment date, delivery date, settlement date and amount/status, sales price, seller-funded discount, Qoo10-funded discount, Qoo10 service fee, shipping, refunds, and adjustments.
- Also open `Qアカウント > Qアカウントの履歴` and search a range covering every computed Wednesday settlement date. On `SellerGBankManagement.aspx`, after setting `#srch_sday` and `#srch_eday`, execute the date-history search with the lower `#btn_search` button. Do not use `#btn_search_gaccount`; it belongs to the separate account-level control and can leave the dated history grid blank. Enumerate the result rows from the DOM and follow every pagination control until no next page is available; the initially visible rows are not the complete ledger. Preserve each `販売代金 精算` entry in the reconciliation checkpoint, keyed by transaction date, amount, and row identifier. This ledger proves whether the settlement cycle occurred, but an aggregate credit alone does not prove the itemized fee classification.
- After clicking `#btn_search`, verify that the rendered history range still matches the requested dates and inspect the actual result rows. A blank grid produced after clicking any other same-label search control is invalid evidence and must not be reported as zero Q-account history.
- Merge live Q-account rows with any period-matched reconciliation checkpoint staged by the Bridge. Never replace a previously verified set with a smaller visible-page subtotal unless official row-level evidence proves which prior entry was invalid. On a conflict, recheck pagination and use the union of unique official rows. For 2026-07, prior verified evidence contains four `販売代金 精算` credits on 2026-07-22, 2026-07-29, 2026-08-12, and 2026-08-19 totaling JPY 19,849; a result below four rows or JPY 19,849 is incomplete, not a revised official total.
- If the conservative latest settlement bound has passed and Q account contains the matching settlement credits, never report `official publication waiting`. Reconcile the lower detail export. If the requested-period purchase-date search, settlement-date search, and bounded per-order fallback all return no detail, return `needs_review` with `official settlement completed; detailed reconciliation unavailable`, the expected dates, observed Q account credits, and the exact missing fields.
- If the latest settlement bound has not passed, return `needs_review` with the computed date and retry after the next Wednesday cycle. Do not invent a monthly fifth-day publication rule.
- A saved zero-row or unavailable screenshot expires after that run. Every retry must search the current settlement sections and Q account history again; only stable period-matched order or delivery exports may be reused without repeating their download.
- Confirm sales, cancellations/refunds, sales commission, settlement/payment fees, seller-funded discount or Qcash/point burden, shipping charge, and adjustments.
- Exclude Qoo10-funded promotions.

## TikTok Shop

- Seller Center: Finance > Statements or Transactions, with the requested period selected.
- When the official export history download request to `/api/v1/pay/settlement/file/download` succeeds but Chrome does not save the file, inspect only that request's official JSON response in the same tab. Use its relative `data.url` once through the Skill's same-origin CDP fetch, without logging or persisting the URL, and write the XLSX bytes to the job work folder. Name it `tiktok-YYYY-MM-DD_YYYY-MM-DD-income-YYYY-MM.original.xlsx` so a later run can revalidate the period without trusting the archive prefix. Verify the workbook type, period, and statement columns before use.
- Confirm customer payment, refunds, referral or commission fees, transaction fees, fulfilment/shipping fees, seller-funded discounts, affiliate charges, and adjustments.
- Advertising charges and platform-funded discounts are excluded.
