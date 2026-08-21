# TSA Codex Bridge

The bridge runs on the signed-in office Windows PC and claims allow-listed TSA jobs over outbound HTTPS. It uses the local Codex login and Chrome plugin configuration, streams progress back to TSA, and uploads source reports and execution logs.

## Runtime

- Windows user must be signed in.
- Codex desktop should be running when Chrome control is required.
- The EC seller account must already be signed in to Chrome.
- The shared archive path must be reachable.

## Install

Run `install-bridge.ps1` with the same secret stored in Vercel as `TSA_CODEX_BRIDGE_TOKEN`. The installer copies runtime files to `%LOCALAPPDATA%\TSA Codex Bridge`, registers a current-user startup entry, and starts the worker hidden.

Each production job starts with `codex exec --ephemeral`. The Bridge never resumes the TSA development chat or another long-lived task. Signed-in EC jobs must list and claim the user's already-open matching Chrome tab. They must not create a new tab/window, switch to a temporary profile, or close an operator-owned tab. If the required signed-in tab is not already open, login, MFA, CAPTCHA, account selection, or a real permission denial stops in an operator-waiting state with the exact official site to open.

Every TSA button that invokes Codex must route to a dedicated Skill. Do not send a task/thread ID or development-chat history to the worker. A new recurring workflow is not production-ready until its Skill and compact structured input are defined.

The production screen is `/web-sales/automation`. It supports both product-sales aggregation and advertising-cost collection. Use `PC接続テスト` before the first run.

Advertising jobs reuse TSA's existing import, auto-match, and cost-update routes. Google Ads uses the configured Google Ads API; Meta, Rakuten RPP, Yahoo item reach, and Amazon Sponsored Products use the signed-in Chrome session and the `tsa-ad-cost-csv` Skill. A report with positive-cost unmapped rows finishes as `needs_review` instead of updating advertising costs.

Monthly WEB sales and EC expense analysis uses `gpt-5.6-sol` through the official Codex CLI and the `tsa-web-sales-analysis` Skill. TSA builds a compact deterministic packet, embeds it once in the isolated task, validates structured output, and saves every run as an immutable numbered version in `web_sales_ai_analyses`.

This TSA Bridge is an authenticated outbound queue worker around the official `codex exec`. It is not a third-party OpenAI-compatible localhost proxy and is not exposed to the internet. Vercel queues jobs; the allow-listed office PC claims and completes them.

## Runtime version tracking

The Bridge checks the Codex Desktop runtime while idle and immediately before every Codex job. On Windows it accepts a CLI only when the matching `codex-code-mode-host.exe` exists, and automatically switches to a newer versioned Codex directory. The worker heartbeat and every terminal job result record the Bridge version, Codex version, executable update time, runtime check time, and readiness. This applies to product-sales CSV, advertising-cost, EC settlement, and monthly analysis jobs.

The TSA automation screen shows both versions and warns when the installed Bridge does not match the required production version. A Bridge source update still requires reinstalling or copying the new Bridge file and restarting the worker; Codex Desktop updates do not require a Bridge restart.

## Operation note

- 2026-08-21: Bridge 1.8.15 opens a visible, read-only PowerShell monitor for each claimed TSA job. It shows the task, product and EC targets, current browser step, progress, elapsed time, approximate completion window, last response age, and Bridge/Codex PIDs; closing the monitor does not stop the worker. EC price progress now carries the scoped browser operation title. Amazon price-only writes are pinned to the existing tab's `/interactive/listing/workflow/edit/offer` route so unrelated catalog validation such as error 90220 cannot be submitted with a price change.
- 2026-08-21: Bridge 1.8.14 makes a saved TSA recipe `product_lp_url` a mandatory part of EC price jobs. Planning now stops before external writes unless the LP product, old price, target occurrence, and Vercel-linked GitHub source are validated. Each job clones the current GitHub production branch into a fresh workspace, updates only the planned occurrences, deploys through the existing branch, and requires the registered public LP URL to show the new price before the job can complete.
- 2026-08-20: Bridge 1.8.13 retries every already-open official tab for the same EC when the newest match is owned by another browser session. A single locked duplicate no longer blocks a site while another signed-in existing tab is available. Read-only planning policy violations finish normally so claimed tabs are released instead of being stranded by a forced process kill; write-phase violations still stop before further external changes.
- 2026-08-20: Bridge 1.8.12 makes EC price jobs existing-tab-only. Both read-only planning and write prompts forbid new tabs/windows and temporary profiles, preserve operator tabs, and stop with the exact missing official tab instead of treating a new tab's expired session as a login failure. The two affected read-only jobs were cancelled as `価格変更なし`.
- 2026-08-20: Bridge 1.8.11 rejects older worker versions, preserves an active worker lease before claiming another job, and heartbeats immediately after claim. This prevents a second PC using the same worker ID from running Chrome jobs concurrently. EC price prompts and Skill now inspect one site at a time with scoped locators instead of full seller-dashboard snapshots. A duplicate-worker Native Host error was invalidated as `価格変更なし`.
- 2026-08-20: Bridge 1.8.10 added phase-specific EC price progress (`変更前価格を確認中` / `EC価格へ反映中`), concise failure summaries, and explicit no-write wording for planning failures. Amazon's informational new-feature modal is handled by the `update-aizu-ec-prices` Skill and is not treated as an authentication block. Installed locally and confirmed heartbeat with no active job.
- 2026-08-11: Bridge 1.8.0 added common Codex runtime discovery and version auditing for sales CSV, ad-cost, EC-settlement, and monthly-analysis jobs. Verified locally with Bridge 1.8.0 and `codex-cli 0.147.0-alpha.6.6`; the connection-test result stored the same runtime metadata, and the production TSA screen displayed both versions. Rakuten and Qoo10 July settlement jobs also completed without the previous missing-host error. Their official July reports remain unpublished, so TSA correctly keeps the estimates until the scheduled retry can obtain official data.
- 2026-08-11: The EC expense overview now separates live execution, queueing, operator waits, failures, and official-publication waits. Active rows show progress, current step, and the last Bridge response; a response older than two minutes is flagged as a possible stall. Verified that the latest Rakuten and Qoo10 retries finished and no jobs remained active.
