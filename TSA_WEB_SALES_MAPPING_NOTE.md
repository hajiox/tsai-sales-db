# 2026-07-07 WEB Sales Mapping Note

## 2026-09-01 August Advertising Recovery

- Confirmed the advertising batch was not a five-channel failure: Meta, Rakuten RPP, and Yahoo completed; Google stopped on unmapped daily rows and Amazon entered the public Ads sign-in route.
- Bridge 1.9.46 now opens Amazon Ads through signed-in Seller Central > Marketing > Ads Console. The public Amazon Ads sign-in page is no longer treated as the primary route.
- Google's retry previously counted 32 daily database rows although only three unique groups were unclassified. Recognized BASE-wide Shopping spend is now allocated by BASE sales composition, physical 食ブラ visit/search spend is excluded from WEB sales advertising, and only genuinely unknown group names stop for review.
- Google API synchronization no longer writes a partial monthly allocation before validation. The final import resets that month's Google allocation before writing the verified complete result, preventing stale series costs from surviving a rerun.

## 2026-08-14 Half-Month Quantity Schedule

- Corrected the interim WEB sales run to start at 09:15 JST on the 16th, after the 15th has ended, and to cover the 1st through 15th.
- The half-month run now queues only the seven product-sales quantity jobs. Advertising cost, EC fees, discounts, refunds, and settlement jobs are not included.
- The monthly run remains at 09:15 JST on the 1st and covers the complete previous month for product quantities, advertising costs, and EC settlements. Separate retries remain only for previous-month official settlements that were not yet published; they do not run with the half-month snapshot.

## 2026-08-16 First Half-Month Run Check

- Vercel queued all seven product-sales jobs at 09:15 JST for 2026-08-01 through 2026-08-15; no advertising-cost or EC-settlement job was included in that half-month batch.
- The office Bridge had stopped and had not sent a heartbeat since 2026-08-14 10:25 JST, so all seven jobs remained queued. Restarted Bridge 1.8.0 locally and verified fresh heartbeats and job claiming.
- Amazon then stopped in `waiting_for_user`: the open Seller Central tab had redirected to the public new-seller page, and the isolated job also could not obtain tab operation permission. TikTok had no open seller tab. Rakuten, Yahoo, Mercari, BASE, and Qoo10 had existing management tabs; Rakuten processing started after Amazon yielded.
- The monitored five non-Amazon/non-TikTok jobs all reached a terminal state, but none imported data. Rakuten Data Tool, Yahoo Store Creator Pro, Mercari Shops, and BASE stopped on Chrome site-operation permission. Qoo10 initially showed the signed-in `tsstaff` store but redirected to login when opening delivery management, so it requires reauthentication. After the operator completes those actions, use `未取得のみ実行` to retry only the waiting channels.

## 2026-08-16 Aggregation Period UI

- Confirmed that all seven August 1-15 jobs ended in `waiting_for_user` and produced no import run. Existing August quantities (Amazon 136, Yahoo 278, BASE 12) are older partial data and must not be treated as the completed mid-month result.
- The automation page now defaults to the latest completed half-month window (`2026-08-01` through `2026-08-15` on and after August 16) instead of an ambiguous month-to-date range.
- Product sales clearly separates `中間集計（1〜15日）` from `月次確定（前月1か月）`. The selected period shows included data, completion state, and operator-wait count. Advertising and EC deductions default to monthly mode because they are not part of the mid-month run.
- Execution history now records the visible aggregation class (`中間（1〜15日）`, `月次確定`, or `期間指定`). Production build passed; full-repository type checking still reports pre-existing errors outside this change.
- The update button now states the exact action: `1〜15日分を取得`, `前月1か月分を取得`, or `指定期間を取得`, including the remaining channel count.

## 2026-08-16 Bridge Browser Approval Fix

- Confirmed that the August 1-15 jobs found the existing signed-in Chrome tabs but failed at the first page read. The failure occurred before login validation and was incorrectly presented as a site login/access problem.
- Root cause: isolated headless Bridge sessions inherited the user's global `approval_policy = "never"`. Browser-origin approval could not be shown in the headless run, so every tab claim was automatically declined even though Chrome was signed in.
- A read-only isolated Amazon check succeeded with `codex exec --approve-for-me`. Bridge 1.8.1 now uses that mode, which retains the workspace-write sandbox and automatically reviews the explicitly allow-listed browser workflow.
- Normal Codex settings and Chrome login data are unchanged. Re-run only the incomplete August channels after Bridge 1.8.1 is installed and online.
- Bridge 1.8.2 also treats a signed-in tab already held by another Codex browser session as transient contention. It opens one temporary same-profile tab, verifies that login is inherited, and closes it after the download instead of reporting a false login/permission wait.
- Bridge 1.8.5 recognizes canonical archive names such as `qoo10-2026-08-01_2026-08-15.prepared.csv`, archives validated work-folder files itself instead of asking the sandboxed Codex process to write to the UNC share, and removes stale Windows worker locks after a stopped process.
- Amazon page access and signed-in state were verified. Its Business Reports CSV is delivered through a generated S3 download, whose Browser Use approval is dismissed in a headless ephemeral session. This is a download-origin approval limitation, not an Amazon login failure; the job now reports that distinction instead of claiming that Seller Central is logged out.
- A validated zero-row EC report is now accepted as a legitimate zero-sales result. Previously Qoo10's valid August 1-15 report failed at direct import with `取込対象の商品がありません` instead of replacing the channel summary with zero.
- Verification: production alias `https://v0-tsa-19.vercel.app` was deployed successfully. Bridge 1.8.5 reused the archived Qoo10 August 1-15 files without launching Codex and completed direct import in about four seconds with `CSV数量0個、TSA登録数量0個`.

- Investigated why TSA WEB sales showed 0 for Akuma BUTA meshi while DocScanner EC速報 had sales.
- Cause: mall order titles shifted from `2食セット` to `2個セット`; TSA matching treated `2個セット` as a stronger signal for the chashu takikomi-gohan 2-item product.
- Fixed the shared CSV matcher and corrected EC title mappings for Amazon, Rakuten, Yahoo, and BASE.
- Existing monthly summary rows were not backfilled because TSA does not keep the original imported row history; reimport or explicit manual backfill is needed for past months.

## 2026-07-26 WEB Sales Dashboard Ranking

- Changed the existing monthly BEST10 into a clearly labeled `総合 TOP10`.
- Added tabs for Amazon, Rakuten, Yahoo, Mercari, BASE, Qoo10, and TikTok.
- Each EC tab ranks products using only that channel's quantity and sales amount (`channel quantity x product price`).
- TOP10 and worst10 switch together when an EC tab is selected and can both be sorted by quantity or sales amount.
- Products with zero units in the selected channel are excluded from both rankings, including when sorting by sales amount.

## 2026-08-03 EC Sales Import Automation Review

- Reviewed the monthly source folders for Amazon, Rakuten, Yahoo, Mercari Shops, BASE, Qoo10, and TikTok Shop.
- All seven channels have an official API path for order or sales data, subject to each channel's application, contract, and token requirements.
- Recommended API-first daily synchronization, with formal snapshots for days 1-15 on the 15th and the full previous month on the 1st.
- The current monthly channel fields are replaced on import, but raw source rows and import-run history are not retained. Add immutable source records, run logs, and idempotent snapshot replacement before scheduling unattended imports.
- The local UNC folder cannot be read directly from Vercel. Keep it as an archive, or add a local bridge only for channels whose API authorization is not yet ready.

## 2026-08-03 EC Sales API Automation Implementation

- Added API adapters for Amazon, Rakuten, Yahoo, Mercari Shops, BASE, Qoo10, and TikTok Shop.
- Added `/web-sales/automation` for channel status, manual periods, run history, and unresolved product mapping.
- Raw normalized rows and every sync run are retained. Monthly channel totals are replaced only after every product is matched, using one database transaction.
- Scheduled `/api/cron/web-sales-sync` daily at 09:15 JST; the 15th records the first-half snapshot and the 1st records the full previous month.
- Production deployed to `https://v0-tsa-19.vercel.app`. All seven channels currently show authentication pending because their sales/order API credentials are not yet registered in Vercel.

## 2026-08-03 EC API Application Progress

- Yahoo Shopping: issued the production server-side application `TSA EC売上自動同期`, registered the TSA OAuth callback URL, and stored the Client ID, secret, and store account in Vercel without exposing their values.
- Yahoo Order API approval is not submitted yet because the form requires fixed source IP addresses; Vercel's normal outbound IPs are not fixed. Decide on a fixed-IP proxy or local bridge first.
- TikTok Shop: an existing Seller Developer escalation is already open. Registration is blocked because the Japan seller account has no assigned account manager.
- BASE Developers, Qoo10 QSM, Rakuten R-Login, and Amazon Solution Provider Portal each require account login before the application can continue. Their login tabs were left open for handoff.
- Amazon: Seller Central login alone is not sufficient. The logged-in email is not yet associated with an SP-API developer account, so TSA requires a separate private developer registration and private app self-authorization. The browser is currently stopped at the API agreement, Acceptable Use Policy, and Data Protection Policy consent step pending company approval.
- Amazon registration continued after company approval: the new Solution Provider Portal account was created and identity verification completed from the existing seller account. The production profile draft uses the BASE shop URL `https://www.aizubrandhall-ec.com`, requests only the non-restricted Brand Analytics role, and documents TSA's sales-and-traffic reporting use case. The remaining factual confirmation is MFA/password-policy compliance before submission.
- Added `SECURITY_INCIDENT_RESPONSE_POLICY.md` for TSA and the Amazon SP-API integration, including six-month reviews, restricted access, managed secret storage, and Amazon incident reporting within 24 hours.
- Amazon profile submission is still incomplete. All security answers were approved as `Yes`, but the Solution Provider Portal repeatedly treated populated required fields as empty; submission work was paused before acceptance at the user's request while the scheduled CSV-import alternative is evaluated.
- Current EC sales API status: no channel is fully operational. Yahoo has production application credentials but Order API approval is blocked by the fixed-source-IP requirement. Amazon is not submitted, TikTok permissions remain under review, and Rakuten, BASE, Qoo10, and Mercari Shops still require application or authorization work.

## 2026-08-03 Codex Local Bridge Direction

- Paused external EC API applications. The preferred operating model is browser-based CSV download and TSA import performed by Codex on the signed-in office PC.
- TSA will own a durable task catalog, job queue, progress events, run history, source files, output files, and final results.
- A Windows auto-start local bridge will claim queued jobs over outbound HTTPS/realtime, invoke Codex through the supported local SDK or `codex exec --json`, and report progress back to TSA.
- The Codex desktop window does not need to be controlled directly. The bridge can reuse local Codex authentication, but the PC must be awake, signed in, and able to access the required browser session.
- Jobs must be allow-listed workflows rather than arbitrary web-submitted prompts or shell commands. Use per-job leases, heartbeat, idempotency keys, cancellation, retry limits, and `waiting_for_user` for login, MFA, CAPTCHA, or uncertain mappings.
- This removes the dependency on each EC site's sales API, but TSA and the local bridge still require an authenticated internal HTTPS/database interface.

## 2026-08-03 Codex Local Bridge Implementation

- Added a durable Supabase queue for fixed Codex jobs, progress events, worker heartbeats, retries, cancellation, retained artifacts, and immutable run history.
- Rebuilt `/web-sales/automation` around office-PC status, active progress, seven registered EC tasks, manual periods, the 15th/1st schedule, downloadable source files, and results.
- Added bearer-authenticated worker endpoints. Browser users must also have the existing TSA NextAuth session; arbitrary prompts and shell commands cannot be submitted from TSA.
- Added the Windows bridge under `tools/tsa-codex-bridge`. It discovers the Codex CLI bundled with the desktop app, reuses local Codex/Chrome configuration, streams JSONL progress, archives source CSVs, uploads artifacts, and starts automatically for the current Windows user.
- Applied `20260803_web_sales_codex_bridge.sql`, created the private `web-sales-codex` storage bucket, registered the production-only bridge secret in Vercel, and installed the worker as `tsa-office-01` (`事務所PC`).
- Changed the existing daily cron endpoint so it queues local Codex jobs only on the 15th and 1st. Other days return without creating work.
- Production deployed to `https://v0-tsa-19.vercel.app`. Deployment smoke job `cd01e361-37dd-41a0-aadf-b6514844f9fa` completed through the full DB -> PC -> Codex -> TSA result path.
- Desktop and 390px mobile layouts were checked in production with no browser console errors. No live EC sales import was executed during deployment, so existing monthly sales data was not changed.

## 2026-08-03 EC CSV Skill Implementation

- Added the `tsa-web-sales-csv` Codex Skill and installed it under `%USERPROFILE%\.codex\skills` for the office worker.
- Fixed each source workflow: Amazon child-ASIN business report; Rakuten R-Karte product sales; Yahoo Premium Statistics product analysis; Mercari Shops sales-detail export; BASE order-data download; Qoo10 completed-delivery download; and TikTok Shop shipped-order export.
- Added deterministic validation for report headers, Rakuten's embedded display period, row-level date ranges, total quantities, blank titles, and unsupported statuses. Validation never logs customer names, addresses, phone numbers, or email addresses.
- Confirmed the validator against the latest July archive. Rakuten, Yahoo, BASE, Qoo10, and TikTok passed. Mercari correctly removed two rows whose sales-transfer dates were outside July 1-15. Amazon stopped for review because one source row has a blank title.
- Updated the Windows installer to deploy the Skill and fixed quoting of the auto-start script path containing spaces.
- Updated the running office bridge to version `1.1.0`. Connection test `fc075dca-aec3-4279-86b8-8acc1454d0af` completed through the production queue.
- No live EC CSV was downloaded or imported during implementation, so current TSA monthly sales values were not changed.

## 2026-08-03 Bridge Browser Permission Fix

- Investigated the apparent Amazon stop at 88%. The percentage was synthetic event-count progress; Amazon had actually ended after Chrome denied the new non-interactive Codex session access to `sellercentral.amazon.co.jp`.
- Confirmed the same per-session denial on Rakuten and Yahoo. A hidden `codex exec` session cannot present the browser-origin approval prompt, even when another Codex session was previously approved.
- Updated Bridge to `1.2.0` and configured it to resume the existing user-approved Codex session so approved EC origins persist across TSA jobs.
- Changed running-job progress from misleading numeric percentages to `準備中`, `実行中`, and `最終確認中`. Browser-origin denial is now surfaced immediately as an access-permission message and normalized to `操作待ち`.
- Added UTF-8 BOMs and explicit UTF-8 reading instructions to the Skill markdown because Windows PowerShell 5.1 otherwise displayed the Japanese instructions as mojibake.
- Stopped the remaining jobs from the failed seven-channel batch without importing sales data. Existing failure/waiting records were retained for audit and can be retried after the fix is deployed.
- Deployed the UI fix to `https://v0-tsa-19.vercel.app` and verified in production that Bridge `1.2.0` is online, the synthetic `88%` label is gone, stage labels render correctly, and no mojibake remains.

## 2026-08-03 Rakuten Live Import Verification

- Confirmed the July Rakuten job was still active after the CSV download; it was waiting at TSA's post-upload confirmation transition rather than at RMS.
- The prepared Rakuten CSV contained 96 products and 1,836 units. TSA matched all 96 products with zero unresolved mappings.
- The import completed successfully and the TSA Rakuten July total matched the CSV total at 1,836 units.

## 2026-08-03 EC Import Pause Diagnosis

- The long pause at each TSA CSV modal occurs before TSA parsing: Codex is waiting between browser actions and, for some channels, cannot attach the prepared local CSV.
- The ChatGPT Chrome extension currently denies local-file upload access. Yahoo and Mercari finished downloading, validating, and archiving their July CSVs but stopped before TSA import; their final results are `waiting_for_user`.
- The Bridge resumes the full long-running TSA development session for every channel. Each recent job replayed roughly 650 million input tokens including cached context, browser documentation, and large DOM snapshots, creating substantial reasoning latency even when the import succeeds.
- Observed prepared-file-to-final intervals: Rakuten about 9 minutes, Yahoo about 2.5 minutes before permission stop, and Mercari about 1 minute before permission stop.
- Recommended permanent direction: use a small dedicated EC worker session and send validated CSVs from the authenticated local Bridge directly to a fixed TSA import endpoint. Keep the browser only for EC downloads and human resolution of unmatched products.

## 2026-08-03 Lightweight Direct Import

- Updated the office worker to Bridge `1.3.0` with `low` reasoning effort. Codex now performs only the signed-in EC download, deterministic validation, and archive work; it no longer opens TSA or waits at a file chooser.
- Added a bearer-protected direct CSV endpoint. The local Bridge independently reruns the validator and sends only the prepared CSV to TSA, which uses the existing product mappings and atomic monthly replacement.
- Reused the existing channel matching rules after stable IDs, saved mappings, product codes, and exact names. Any remaining unmatched product stops the monthly replacement for review.
- Kept the original archive destination and naming rules. Bridge requires both `.original.csv` and `.prepared.csv` to exist under the configured shared archive folder before direct import can start.
- Live recovery took about 10 seconds for four already-downloaded CSVs: Amazon 1,959 and Yahoo 3,024 units completed; Mercari retained 4 unmatched products and BASE retained 3, so those two monthly totals were not replaced.
- Production is deployed at `https://v0-tsa-19.vercel.app`; Bridge `tsa-office-01` is online on version `1.3.0`.

## 2026-08-03 Amazon S3 Download Fix

- Amazon's generated business-report URL was opened as a normal Chrome tab and blocked with `ERR_BLOCKED_BY_CLIENT`; the report generation itself was successful.
- Updated the Amazon Skill to download the CSV through Chrome's download event/media API instead of navigating to the signed S3 URL.
- Signed Amazon URL credentials and signatures are prohibited in commands and results, and Bridge event payloads now redact Amazon S3 query strings.
- Retried August 1-3 successfully: archived `Amazon2026.8商品売上【A】(1日～3日).original.csv` and `.prepared.csv` in the existing Amazon shared folder, then imported 136 units into TSA.

## 2026-08-03 Current Jobs UI Cleanup

- `現在の処理` now shows only queued/running jobs and only the newest active job for the same channel and period. Old waiting/review/error jobs remain in the audit history without progress bars.
- Task-card status is scoped to the selected period instead of showing an unrelated latest month.
- Added `未取得のみ実行`. It skips completed, queued, running, and mapping-review channels for the selected period, and queues only missing, failed, operation-waiting, or cancelled channels.
- Server-side duplicate protection prevents a second queued/running job for the same channel and exact period even if the browser view is stale.

## 2026-08-03 Advertising Cost Codex Automation

- Extended `/web-sales/automation` with separate `商品売上` and `広告費` workflows. Active work, period status, incomplete-only execution, and history are isolated by task type so Amazon sales and Amazon ads never share status.
- Added fixed ad-cost tasks for Google Ads, Meta Ads, Rakuten RPP, Yahoo item reach, and Amazon Sponsored Products. The 15th half-month run and 1st previous-month run now queue both sales and ad-cost jobs.
- Google uses the existing Google Ads API sync. The other four channels use signed-in Chrome through the new `tsa-ad-cost-csv` Skill and archive the unchanged source report under `【WEBマーケティング】\広告費取込`.
- Added a bearer-protected Bridge endpoint that validates the report month, reuses each existing upload parser and auto-matcher, and then reuses the existing advertising-cost import route. Positive-cost rows left unmapped finish as `needs_review` instead of being guessed.
- Added an `広告費をCodexで取込` command to the advertising dashboard. Existing manual upload and mapping controls remain available for review or recovery.
- Applied `20260803_ad_cost_codex_jobs.sql`, installed Bridge `1.4.0` and the new Skill on the office PC, and confirmed the worker heartbeat is online. No live advertising report was fetched during implementation, so current advertising data was not changed.

## 2026-08-04 EC Monthly Profit Dashboard

- Rebuilt the advertising TOP as `EC利益・広告管理`. It combines monthly EC sales, frozen product cost excluding embedded marketplace fees, settlement deductions, advertising cost, and final EC profit.
- Added fixed Codex settlement tasks for Amazon, Rakuten, Yahoo, Mercari Shops, BASE, Qoo10, and TikTok Shop. The Skill captures refunds, marketplace/payment fees, seller-funded discounts/coupons/points, shipping charges, other deductions/credits, and payout totals without guessing missing categories.
- A month remains `暫定` until settlement reports are imported; completed EC settlement reports change it to `確定`. Google/Meta/common ads are deducted from the overall result only and are not falsely allocated to individual ECs.
- Added monthly cost snapshots so later recipe-price changes do not rewrite prior WEB sales profit. Existing rows were backfilled once, and new rows are frozen by the database trigger.
- Applied `20260804_ec_profit_dashboard.sql`, installed Bridge `1.5.0` and `tsa-ec-profit-report` on the office PC, and deployed production to `https://v0-tsa-19.vercel.app`. No live settlement task was executed during deployment, so existing sales and advertising figures were not replaced.

## 2026-08-04 Bridge ENOENT Recovery

- The 11:35 TikTok retry did not reach TikTok Shop. Bridge attempted to start Codex with a mojibake workspace path, so Node reported `spawn ... codex.exe ENOENT` even though the executable itself existed.
- Repaired the installed workspace to `C:\作業用` and confirmed the selected Codex CLI starts successfully from that directory.
- Updated Bridge to `1.5.1`. It now falls back to a valid workspace when the configured directory does not exist and probes candidate Codex executables with `--version` before choosing one.
- The failed July TikTok job remains in history for audit and was not automatically retried, so no sales data changed during the repair.

## 2026-08-04 Unmatched Review Modal

- `確認待ち` now opens a product-mapping modal automatically for the selected period. Each review task card also has a persistent `商品紐付けを確認` button, and the old unresolved list at the bottom was removed.
- Task cards distinguish `商品紐付け待ち` from `再実行必要`, so a non-mapping review no longer implies that a product modal exists.
- Non-mapping legacy `needs_review` jobs are now shown as `再実行必要` and included by `未取得のみ実行`; only review jobs with a positive `unmatchedCount` remain excluded until their product mappings are resolved.
- The modal can show every unresolved EC or filter by channel. Saving a mapping reruns the existing monthly finalization without importing the CSV again.
- When the final unresolved product is mapped, the related Codex job changes from `確認待ち` to `完了` and its imported quantity/result are refreshed.

## 2026-08-04 Advertising Manuals Skill Consolidation

- Reviewed the TSA manuals for Meta, Rakuten RPP, Yahoo item reach, and Amazon Sponsored Products once and incorporated their exact report type, period, granularity, columns, and output format into `tsa-ad-cost-csv`.
- The Skill is now the canonical execution procedure; jobs do not reopen the TSA manual page on every run.
- Corrected the Amazon entry route to Seller Central > Marketing > Ads Console and aligned the TSA Amazon guide with that signed-in route.
- Diagnosed the July Amazon failure as TSA month validation rejecting Amazon's standard English dates such as `Jul 01, 2026`. The workbook itself was the correct advertised-product report.
- Replaced the Amazon month text search with typed parsing of the workbook's Start Date column, while retaining strict rejection of mixed or incorrect months.
- Deployed the fix and retried Amazon only. The job completed with 35 performance rows and reflected July Amazon advertising cost of `¥164,217` in TSA.

## 2026-08-04 EC Fee Import Verification

- Completed and reconciled July EC deductions for Amazon, Yahoo Shopping, Mercari Shops, BASE, and TikTok Shop. TikTok's 18 official statement rows reconcile exactly: gross sales JPY 54,970, fees JPY 6,037, payout JPY 48,933.
- Fixed payout reconciliation so marketplace-funded benefits and separately excluded advertising charges are included in the payout bridge without being counted as seller EC costs.
- Fixed the local Bridge JSON reader to strip a UTF-8 BOM before parsing and restarted Bridge 1.5.1 with the installed fix.
- Qoo10 order totals were archived, but the official monthly settlement detail is issued on the 5th; the July job remains `needs_review` until that source exists.
- Rakuten generated payment-detail history ID 78587759, but both the completed CSV download and BillPay require separate credentials not present in Chrome, so the job remains `waiting_for_user` without guessing or resetting credentials.
- Updated `tsa-ec-profit-report` with the current Rakuten, Qoo10, and TikTok routes and non-looping recovery rules.

## 2026-08-04 Advertising Import Completion

- Completed all five July advertising-cost tasks: Google, Meta, Rakuten RPP, Yahoo item reach, and Amazon Sponsored Products.
- Resolved the two Rakuten RPP unmatched product codes by verifying their official Rakuten product pages against TSA product master series 13 (`福島の桃`), persisted the learned code mappings, and reflected `¥149,958` across 23 series.
- Meta's saved `TSA読み込み用` column preset lacked `キャンペーン名` and Meta's current `リンククリック` column. Added both to the preset and reran the job successfully.
- Meta imported 14 ad-set rows and reflected July advertising cost of `¥164,601`.

## 2026-08-04 Unified Data Update UI

- Consolidated the three overlapping Codex import commands into one `データ更新` entry and one `この期間を更新` action. Completed channels are skipped automatically, while product mapping remains a separate review action only when unresolved products exist.
- The EC profit summary now explains every incomplete settlement channel directly under `EC精算 X/7`, including the last known reason and the next retry timing instead of showing only a fraction.
- Added daily 09:15 automatic retries for incomplete previous-month EC settlements. Qoo10 starts retrying on the 5th, after its official monthly settlement report is issued; active jobs remain protected from duplicate queueing.
- Removed manual retry controls from history. History remains read-only for audit, while queued/running work can still be cancelled.

## 2026-08-04 Rakuten CSV Contract Check

- Confirmed in the signed-in RMS screen that the order/payment `データダウンロードサービス` is already active: the page exposes payment-detail generation, download history, a password re-notification form, and an active-service cancellation link.
- The monthly JPY 10,000 `CSV商品一括編集機能` is a separate product/catalog bulk-edit option and is not the cause of the settlement import stop.
- The current blocker is the separate CSV-download username/password. A screen/PDF fallback is technically possible through order details plus BillPay statements, but RMS order screens alone do not provide every monthly fee and payout item required for a complete reconciliation.
- BillPay was selected as the preferred settlement source because its store statement contains the authoritative monthly charges, payment deductions, and payout figures. The supplied 2023 BillPay credentials reached BillPay but returned its generic system-error page rather than an invalid-credentials message; repeated login attempts were stopped to avoid account lock. Password reissue or BillPay support confirmation is required before the July statement can be read.
## 2026-08-04 Rakuten BillPay Login And Monthly Basis

- Confirmed the updated BillPay credential works and the account opens the correct company and `会津ブランド館 楽天市場店` store. Credentials were used only for the login and were not saved.
- Confirmed BillPay `月次収支見込みの確認` is the correct calendar-month source for TSA EC profit. Its downloadable CP932 CSV contains monthly sales, itemized fees, estimate/final status, and tax rate.
- On 2026-08-04 the page exposed up to `202606`; `202607` was not published yet. July is therefore kept incomplete and retried daily instead of mixing the 2026-07-03 / 2026-07-17 settlement statements, whose closing periods cross calendar months.
- Updated the Bridge skill so unavailable months return `needs_review`, estimated rows remain `partial`, tax-exclusive costs are normalized, and ad rows are separated from EC deductions.
- Monthly profit now uses the larger of the dedicated channel ad import and settlement-reported excluded ad total. This avoids double-counting overlapping RPP/SP charges while retaining additional billed ad products.

## 2026-08-04 EC Settlement Provisional Estimates

- Previous-month profit no longer stays blank while a marketplace has not yet published its calendar-month settlement. TSA estimates each deduction category and excluded channel-ad cost from up to six prior complete official months, weighted by sales.
- Rakuten's initial fallback is the verified 2026-06 BillPay monthly CSV: gross sales JPY 3,957,242, EC deductions JPY 539,655, and excluded advertising JPY 180,190. Once complete history is stored, the rolling official history replaces this fixed baseline.
- Estimates are saved as `partial` with their basis month, rates, and timestamp, and are clearly marked `概算計上中`. A complete official import upserts the same channel/month and removes the estimate automatically.
- The daily 09:15 retry continues for incomplete settlements. A successful sales import also recalculates that channel's estimate, avoiding a day-one race between sales and settlement jobs.
- Added `概算を再計算` and `公式データを再取得` to the EC profit summary. The former refreshes the provisional amount from current sales; the latter queues only incomplete official settlement tasks.

## 2026-08-04 EC Profit Ratio Display

- The EC profit table now shows each amount together with its percentage of that channel's sales: product profit, fees, discounts, refunds and related costs, advertising, and final profit.
- The same sales-ratio basis is used in the mobile summary and expanded deduction details; ratios are omitted only when channel sales are zero.

## 2026-08-04 Six-Month EC Deduction Backfill

- Queued official EC fee, discount, refund, point, shipping, credit, and payout collection for February through June 2026 while retaining the already imported July records.
- Bridge 1.5.3 normalizes known Amazon transaction-report basis aliases before the protected import, preventing a valid monthly report from failing only because of an enum spelling variant.
- Mixed-basis marketplace reports no longer fail payout reconciliation solely because order-month sales and settlement-month payouts have an explicitly documented timing difference; direct order/transaction reports remain strictly reconciled.
- Completed all 35 February-June channel/month imports. Twenty-nine are fully reconciled; five BASE rows retain `partial` only because the official page combines payment and service fees, and Rakuten June retains `partial` while several BillPay rows are still estimated.
- Corrected payout reconciliation to follow the normalized contract: marketplace-funded discounts and excluded advertising remain informational and are not added to seller-borne EC deductions.
- Qoo10 zero-transaction months now accept an archived official-page `.original.png` as source evidence when no downloadable report exists.
- Added the official Qoo10 food-category estimate baseline (10% fee plus 10% Japanese tax on the fee). July now has a provisional deduction and will be replaced by the official statement after publication.
- Verified that all seven channels now have a February-July row (42 channel/month rows). BillPay credentials were used only to refresh the signed-in session and were not stored.

## 2026-08-06 Dashboard Summary Source Unification

- The monthly EC summary cards now read channel quantity, sales, product profit, direct advertising cost, and final profit from the same `/api/web-sales/ec-profit` response used by advertising management.
- The grand-total card also uses the API total so shared Google, Meta, and other advertising costs are deducted exactly once. The older financial RPC remains only for prior-year sales comparison and series-level display.

## 2026-08-06 Token-Efficient Bridge Execution

- Bridge 1.6.0 no longer resumes the large TSA development chat. Browser-only work runs in an isolated ephemeral Codex session with low reasoning.
- Every sales, advertising, and EC-settlement job now checks deterministic alternatives first: completed state, period-matched archived files, normalized local JSON, then direct APIs. Codex starts only when those routes cannot finish the job.
- Archived sales/ad files must match the requested year, month, start day, and end day before reuse; file content is still passed through the existing protected validators/importers.
- The 15th run no longer queues EC settlement jobs. Settlement runs at month start, and daily retries skip login, MFA, CAPTCHA, account-selection, and permission waits until an operator explicitly resumes them.
- Bridge event logs are capped and redacted. The automation screen shows the token-saving policy and no longer claims that operation-waiting tasks automatically retry.

## 2026-08-06 Persistent Codex Instruction Files

- Added global Codex guidance at `%USERPROFILE%\.codex\AGENTS.md` and TSA-specific guidance at the repository root `AGENTS.md`.
- Development chats are now explicitly limited to investigation and implementation. Recurring production jobs must not resume or replay the large TSA development chat.
- Repeated jobs must load the dedicated Skill and run in a fresh isolated/ephemeral session with only the channel, period, paths, and allow-listed job type.
- Every task must first check completed results, archived artifacts, APIs/CLIs, and local deterministic scripts before invoking browser automation or model reasoning.
- Site-specific changes must be written back to the relevant Skill or reference file before the next retry; chat memory is not the operational source of truth.

## 2026-08-06 EC Expense Dashboard Layout

- WEB sales TOP keeps expense information compact: every EC card shows EC deductions and the deduction-to-sales ratio, while series cards show allocated EC fees, deductions, and deduction ratios.
- The detailed expense summary was removed from WEB sales TOP and moved to the renamed `EC経費管理` page.
- EC expense management now uses the same channel colors as WEB sales TOP and shows seven channel cards with platform fees, payment fees, discounts/coupons/points, refunds/shipping/other costs, advertising, total expense ratio, and final profit.
- Monthly and year-on-year comparisons for EC fees and advertising remain in expense management. A missing historical detailed record is displayed as `-` instead of a fabricated comparison.
- Amazon, Rakuten, and Yahoo advertising use the larger authoritative value between dedicated ad imports and settlement-reported ad charges; Google, Meta, and other advertising remain shared costs and are not duplicated across EC cards.

## 2026-08-06 July 2026 Read-Only Performance Review

- Reviewed the signed-in WEB sales dashboard and the monthly `/api/web-sales/ec-profit` results for August 2025 through July 2026. No application data or configuration was changed.
- July sales were JPY 15,405,923 (96.3% of target, 144% year on year), advertising was JPY 1,500,861, EC deductions were JPY 2,023,977, and final profit was JPY 1,629,610. Five of seven settlement rows were complete; Rakuten and Qoo10 remained estimated.
- The dashboard's 12-month period view showed JPY 155,342,566 and 71,498 units, while summing the authoritative monthly profit responses produced JPY 151,380,370 and 71,776 units. The period endpoint currently values historical quantities with the current product-master price and omits TikTok, so it must not be used as the financial source until corrected.
- July's series-level review identified `Perfect BUTA`, `ごはんのおとも`, and `完全喜多方` as loss-making after advertising, with `IE-K` approximately break-even. Their combined July advertising was JPY 284,829 and combined final profit was negative JPY 24,972; this is the first controlled advertising-reduction group.
- The internal repeat-analysis API reported 35,082 customers and 7,326 repeat customers (20.88%) for its latest rolling 12-month dataset, but that dataset currently ends in June 2026. It has no coupon-code attribution, so it cannot yet measure July's JPY 300 new-customer coupon conversion or coupon-acquired cohort repeat rate.
- Remaining limitations: July totals are provisional until official Rakuten and Qoo10 settlement data replace the estimates, and July repeat/cohort data is not yet loaded in the repeat-analysis system.

## 2026-08-07 July EC Expense Data Verification

- Rechecked the signed-in EC expense page and the authenticated `/api/web-sales/ec-profit?month=2026-07` response after the latest data refresh. No application data or configuration was changed.
- Accepted Rakuten and Qoo10 as provisional by operator decision. The other five channels are marked complete, all seven sales jobs and all five advertising jobs are complete, and the page/API both show sales JPY 15,405,923, EC deductions JPY 2,023,977, advertising JPY 1,500,861, and final profit JPY 1,629,610.
- Channel sales, quantity, product cost, product profit, and EC deductions sum exactly to the displayed totals. Channel final profit totals JPY 2,059,310; subtracting shared Google and Meta advertising of JPY 429,700 reproduces total final profit JPY 1,629,610 exactly.
- Amazon, Yahoo, Mercari, BASE, and TikTok EC-deduction category arithmetic and channel profit arithmetic all reconcile exactly. Rakuten's provisional category allocation has a JPY 2 rounding difference and its profit formula has a JPY 1 rounding difference; the displayed grand total absorbs the rounding.
- Advertising is not double-counted: Amazon/Rakuten/Yahoo use one authoritative channel amount each (the larger of dedicated advertising imports and settlement-reported advertising), while Google and Meta are deducted only once as shared advertising.
- Marketplace-funded coupon support is informational and not double-added to profit: Yahoo JPY 278,229 and BASE JPY 1,440 are already reflected in TSA sales reconciliation.
- Basis warning remains: complete settlement reports can differ from WEB order-month sales because settlement timing differs. Reported-gross differences versus WEB sales are Amazon JPY 15,428, Yahoo negative JPY 189,477, Mercari JPY 8,146, BASE JPY 24,048, and TikTok JPY 35,438. Mercari, BASE, and TikTok each reconcile their own official report gross, fees, and payout exactly; TikTok's difference is proportionally large and should be labeled clearly as a basis/timing difference in the UI.

## 2026-08-06 Qoo10 Retry Visibility And Recovery

- The scheduled Qoo10 settlement retry did run on August 5; QSM still returned zero official settlement rows. The August 6 retry then failed because a Codex application update moved the versioned executable path while Bridge was running.
- Bridge 1.6.2 now re-detects the Codex executable and retries once on `ENOENT`. It also refuses to reuse incomplete normalized settlement JSON during official rechecks.
- EC expense management now separates the last execution timestamp and result from the next retry schedule. After the fifth, Qoo10 shows the daily 09:15 retry schedule instead of continuing to show the original fixed date.
- Qoo10 partial rows that contain verified sales but no official fee amounts are supplemented with the official food-category estimate: 10% fee plus 10% tax on the fee. July EC deductions are provisionally JPY 2,418 on TSA sales of JPY 21,979 until QSM publishes the official figures.

## 2026-08-06 Yahoo July Sales Reconciliation

- July Yahoo quantity matches exactly: both TSA and the official product-sales report contain 3,024 units. The JPY 467,706 difference is therefore not a missing-order issue.
- TSA sales of JPY 5,931,898 are calculated from monthly saved unit prices multiplied by quantities. The official Yahoo product report totals the actual monthly transaction prices at JPY 5,464,192; sale prices and promotions make this lower than the TSA valuation.
- The largest product differences are Akuma BUTA curry two-pack (JPY -117,083), extra-thick retort chashu 600g (JPY -58,744), medium retort chashu 380g (JPY -27,599), pork-curry two-pack (JPY -25,254), and cut-end retort chashu 600g (JPY -22,199).
- Across all products, negative differences total JPY 483,938 and positive differences total JPY 16,232, producing the displayed net difference of JPY -467,706.

## 2026-08-06 Yahoo Marketplace-Funded Coupon Reimbursement

- Yahoo-funded coupon reimbursement is recorded in Store Creator Pro under `利用明細 > 受取明細 > 利用詳細CSV` as `モールクーポン利用料`, with an order ID on each row.
- For the July 2026 sales period, the receipt summary contains JPY 168,815 for the July 29 payment and JPY 109,414 for the August 12 payment, totaling JPY 278,229.
- The existing normalized row records only JPY 92,645 as `excluded_marketplace_funded_discounts`, derived from the net difference between product sales and receipts. That is not the authoritative coupon-reimbursement amount and needs correction before product-level reconciliation.
- `特典の一部利用料` is a separate payment/benefit category and must not be merged into Yahoo-funded coupon reimbursement without order-level evidence.
- Exact allocation to Akuma BUTA curry and extra-thick retort chashu requires joining the receipt-detail order IDs to Yahoo order-item data; the aggregate product-sales CSV alone cannot perform this allocation.

## 2026-08-06 Yahoo Coupon Reimbursement Implementation And Backfill

- EC expense management now exposes marketplace-funded coupon reimbursement separately and reconciles `official product sales + marketplace reimbursement` against TSA sales. It does not add the reimbursement to profit again because TSA sales already use the saved full unit price.
- Yahoo July now shows official product sales JPY 5,464,192, Yahoo-funded coupon reimbursement JPY 278,229, adjusted report sales JPY 5,742,421, and an adjusted reconciliation difference of JPY -189,477.
- Recalculated and updated all twelve Yahoo months from 2025-08 through 2026-07 using only the official tax-inclusive `モールクーポン利用料`. Receipt/product-sales differences and `特典の一部利用料` are no longer used as coupon reimbursement.
- Added `scripts/backfill-yahoo-marketplace-funded-coupons.mjs` for deterministic archive rechecks. The repository and global `tsa-ec-profit-report` Skills now require receipt-detail evidence and prohibit difference-based inference.
- Verified monthly reimbursements: 2025-08 JPY 87,818; 09 JPY 48,425; 10 JPY 54,893; 11 JPY 337,135; 12 JPY 481,805; 2026-01 JPY 335,434; 02 JPY 124,827; 03 JPY 155,779; 04 JPY 41,580; 05 JPY 52,448; 06 JPY 102,355; 07 JPY 278,229.

## 2026-08-07 EC Settlement Chrome Permission Status

- Confirmed that Rakuten BillPay and Qoo10 QSM were both signed in and showed the correct company/store account.
- Re-ran only the incomplete July settlement jobs. Both isolated jobs stopped because Chrome site-operation permission was declined; this is separate from marketplace login status, and no settlement data was changed.
- EC expense management now labels this state as `manual action waiting`. When no prompt appears, the page directs the operator to `Settings > Computer Use > Google Chrome > Manage` and to allowlist `billpay.rakuten.co.jp` and `qsm.qoo10.jp` before retrying.
- 2026-08-07: Clarified that Chrome operation permission applies to every EC site on a host-by-host basis. The UI now lists only the hosts rejected in the current run and explains that other channels may finish without a new prompt because their host was already approved or an archived original report was reused. Verified by the latest job records: Rakuten/Qoo10 had no source file before the rejection, while the completed channels had archived source reports.
- 2026-08-07: Added the exact Japanese Codex navigation labels to the waiting-state help: `設定 > コンピューターの使用 > 制御 > Google Chrome > 管理 > サイトの権限 > 追加 > 閲覧を許可`. Labels were checked against the installed Japanese Codex desktop resources (26.803.5235.0). The help also covers changing an existing `閲覧をブロック` entry.
- 2026-08-07: Reviewed the Codex `Enable full CDP access` developer setting. It is not required for routine TSA monthly CSV downloads and does not replace per-host website permission. Keep it disabled for normal unattended runs; enable it temporarily only when diagnosing DOM, console, network, or performance issues, approve only the intended site, and disable it again after the investigation.
- 2026-08-07: Rechecked the live signed-in Chrome session after questioning the permission diagnosis. TSA (`v0-tsa-19.vercel.app`), TSG (`v0-line-blush.vercel.app`), Rakuten BillPay (`billpay.rakuten.co.jp`), and Qoo10 QSM (`qsm.qoo10.jp`) were all directly controllable and their rendered page content was readable without a new approval prompt.
- The earlier conclusion that BillPay/QSM required manual host registration is therefore not supported by the current browser state. Treat the previous `site-operation permission declined` result as a Bridge/session connection failure or overly broad error classification until reproduced with a real browser permission denial. Do not ask the operator to add hosts solely from that generic job result.
- Current OpenAI documentation confirms host-based website approval is the normal Chrome-extension model, but the public changelog does not identify a later release that newly introduced this requirement. The Chrome extension launched on 2026-05-07 with user-controlled website access; previously approved hosts or a permissive setting can make the approval step invisible.
- 2026-08-07: Identified the actual latest blockers. Rakuten BillPay was readable and reported `data-max-month=202606`, so the July 2026 monthly statement is genuinely not published yet; this is an availability wait, not a login or Chrome-permission failure.
- Qoo10 QSM was also readable. Both the settlement-date and purchaser-payment-date searches for 2026-07-01 through 2026-07-31 returned all-zero settlement totals, but the archived official July delivery-detail CSV contains 13 rows, 15 units, JPY 23,950 order total, and JPY 22,220 purchaser payments. Therefore Qoo10 has sales and the current settlement-screen acquisition basis is not sufficient for July; zero must not be interpreted as no sales.
- The Qoo10 isolated Codex run then failed to archive its evidence to the network share with `EPERM`. The same share is readable from the office process. Network-share archiving should be performed by the local Bridge after the isolated run, rather than by the isolated Codex browser task.
- Remove the generic host-registration diagnosis from these latest outcomes: Rakuten needs automatic publication retry, while Qoo10 needs a corrected source/basis and Bridge-owned archive copy.
- Production build passed and the change was deployed to `https://v0-tsa-19.vercel.app`.

## 2026-08-07 EC Settlement Acquisition And Shared Archive Fix

- Updated the installed and repository `tsa-ec-profit-report` Skill so Qoo10 checks both settlement areas with `購入者の決済日`, then cross-checks the official delivery/order report for the exact period. Zero settlement rows no longer mean zero sales when matching orders exist.
- Bridge 1.6.4 now stages exact-period originals in the local job folder, keeps the isolated Codex run away from the UNC path, and performs the final shared-folder copy from the resident office process. Source files without `.original` are renamed to the canonical `channel-start_end-description.original.ext` form before archiving.
- Verified Qoo10 July with a fresh production job: 13 orders, 15 units, JPY 23,950 order total, and JPY 22,220 purchaser payments were found. Because official settlement rows remain unavailable, the job correctly ended `needs_review`, retained the official food-category estimate, and did not write a zero settlement result.
- Verified the shared Qoo10 archive contains the period delivery CSV and two settlement evidence screenshots. Verified the new canonical-name path separately with Rakuten: `rakuten-2026-07-01_2026-07-31-login-required.original.png` was copied to the shared archive by Bridge 1.6.4.
- Rakuten's earlier same-day official check still shows the latest published BillPay month as 2026-06. July remains estimated until publication; the final archive-path retest encountered an expired BillPay login session, which is now classified as a real authentication wait rather than a generic Chrome host-permission error.
- EC expense management now displays Chrome host-permission instructions only for actual browser permission errors. Unpublished statements and settlement/order mismatches remain automatic publication retries; login, MFA, CAPTCHA, and account selection remain explicit operator waits.
- Local and Vercel production builds passed. The production alias is `https://v0-tsa-19.vercel.app`.

## 2026-08-07 Existing Chrome Tab Reuse

- The Rakuten archive-path test used the connected Chrome extension, but incorrectly called `tabs.new()` and opened BillPay in a fresh tab. BillPay returned session expiry even though an operator tab had already been signed in.
- Bridge 1.6.7 and all three Bridge Skills now select the browser/profile with the target official URL, list existing tabs, and reuse the matching signed-in tab before creating anything new.
- Verified with a fresh Rakuten job: `getForUrl` selected the Chrome instance holding BillPay, found the existing `/home` and `/payment_billing_details` tabs, claimed the signed-in detail tab, confirmed company/store and `data-max-month=202606`, and did not call `tabs.new()`.
- This rule applies to WEB product sales, advertising costs, and EC settlement deductions. Claimed operator tabs are handed back and kept open after each run. Login/permission/error screenshots are archived as evidence but excluded from future source staging.

## 2026-08-11 Rakuten Provisional Fee Model Review

- Designed a component-level Rakuten estimate to replace the current whole-total historical-ratio approach. The hierarchy is RMS observed actuals, official formula calculations, narrowly scoped historical proxies, and finally BillPay official replacement.
- Verified the February-June 2026 BillPay files against the public fee tables. The system-fee rows reproduce the Standard-plan, average-basket-under-JPY-7,000 progressive rates; reconstructed PC share was 26.6%-29.3%, with a 27.0% median fallback.
- Verified Rakuten Pay was stable enough for a calibrated formula fallback. For the current JPY 3M-JPY 5M settlement band, `gross sales * 1.03142 * 3.3%` reproduced the five tax-exclusive final rows within 0.42% relative error.
- Verified June RMS point detail at JPY 131,808 versus BillPay JPY 131,862, so point cost can be treated as a provisional observed actual rather than a sales-ratio estimate.
- Defined separate handling for seller coupons, affiliate charges, fixed services, advertising exclusions, and the Standard-plan monthly accrual. No application code or production data was changed in this design-only review.

## 2026-08-16 Mid-Month Sales Recovery

- Recovered the August 1-15 product-sales run after Chrome download completion events were not delivered to isolated Bridge sessions. Amazon 817 units, Mercari Shops 21 units, BASE 95 units, and TikTok Shop 2 units were validated from the downloaded originals and imported; all seven EC jobs now show completed.
- Registered five unambiguous persistent mappings: TikTok `馬肉物語 ウマカレー丼 2個セット`; BASE `会津ソースカツ丼のソース 180ml`, `KARAMISO スープのみ5食`, `業務用 会津じゅうねんドレッシング 1,000ml`, and `馬肉物語 ウマミソ`.
- Bridge 1.8.6 snapshots the Downloads folder before each sales job. If a browser wait is returned but a new CSV exists in Downloads or the isolated job folder, the Bridge validates its channel headers and requested period, stages canonical original/prepared files, and resumes direct import automatically. Files present before the job or failing validation are never reused by this recovery route.
- Sales, advertising, and settlement prompts now explicitly require the signed-in Chrome controller and prohibit substituting the in-app Browser or generic computer control.
- Verified `node --check`, local and Vercel production builds, production alias deployment, installed-file hash equality, Bridge 1.8.6 restart, and the `tsa-office-01` heartbeat reporting version 1.8.6. Remaining real login, MFA, CAPTCHA, account selection, and unresolved product mappings still stop for operator review.
