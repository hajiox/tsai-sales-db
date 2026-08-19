# TSA Codex Bridge

The bridge runs on the signed-in office Windows PC and claims allow-listed TSA jobs over outbound HTTPS. It uses the local Codex login and Chrome plugin configuration, streams progress back to TSA, and uploads source reports and execution logs.

## Runtime

- Windows user must be signed in.
- Codex desktop should be running when Chrome control is required.
- The EC seller account must already be signed in to Chrome.
- The shared archive path must be reachable.

## Install

Run `install-bridge.ps1` with the same secret stored in Vercel as `TSA_CODEX_BRIDGE_TOKEN`. The installer copies runtime files to `%LOCALAPPDATA%\TSA Codex Bridge`, registers a current-user startup entry, and starts the worker hidden.

Each production job starts with `codex exec --ephemeral`. The Bridge never resumes the TSA development chat or another long-lived task. Browser jobs reuse the already signed-in Chrome profile and an existing matching tab; login, MFA, CAPTCHA, account selection, or a real permission denial stops in an operator-waiting state.

The production screen is `/web-sales/automation`. It supports both product-sales aggregation and advertising-cost collection. Use `PC接続テスト` before the first run.

Advertising jobs reuse TSA's existing import, auto-match, and cost-update routes. Google Ads uses the configured Google Ads API; Meta, Rakuten RPP, Yahoo item reach, and Amazon Sponsored Products use the signed-in Chrome session and the `tsa-ad-cost-csv` Skill. A report with positive-cost unmapped rows finishes as `needs_review` instead of updating advertising costs.

Monthly WEB sales and EC expense analysis uses `gpt-5.6-sol` through the official Codex CLI and the `tsa-web-sales-analysis` Skill. TSA builds a compact deterministic packet, embeds it once in the isolated task, validates structured output, and saves every run as an immutable numbered version in `web_sales_ai_analyses`.

This TSA Bridge is an authenticated outbound queue worker around the official `codex exec`. It is not a third-party OpenAI-compatible localhost proxy and is not exposed to the internet. Vercel queues jobs; the allow-listed office PC claims and completes them.

## Runtime version tracking

The Bridge checks the Codex Desktop runtime while idle and immediately before every Codex job. On Windows it accepts a CLI only when the matching `codex-code-mode-host.exe` exists, and automatically switches to a newer versioned Codex directory. The worker heartbeat and every terminal job result record the Bridge version, Codex version, executable update time, runtime check time, and readiness. This applies to product-sales CSV, advertising-cost, EC settlement, and monthly analysis jobs.

The TSA automation screen shows both versions and warns when the installed Bridge does not match the required production version. A Bridge source update still requires reinstalling or copying the new Bridge file and restarting the worker; Codex Desktop updates do not require a Bridge restart.

## Operation note

- 2026-08-11: Bridge 1.8.0 added common Codex runtime discovery and version auditing for sales CSV, ad-cost, EC-settlement, and monthly-analysis jobs. Verified locally with Bridge 1.8.0 and `codex-cli 0.147.0-alpha.6.6`; the connection-test result stored the same runtime metadata, and the production TSA screen displayed both versions. Rakuten and Qoo10 July settlement jobs also completed without the previous missing-host error. Their official July reports remain unpublished, so TSA correctly keeps the estimates until the scheduled retry can obtain official data.
- 2026-08-11: The EC expense overview now separates live execution, queueing, operator waits, failures, and official-publication waits. Active rows show progress, current step, and the last Bridge response; a response older than two minutes is flagged as a possible stall. Verified that the latest Rakuten and Qoo10 retries finished and no jobs remained active.
