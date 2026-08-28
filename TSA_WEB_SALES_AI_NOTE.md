# TSA WEB Sales Codex Analysis Note

## 2026-08-07

- Replaced the WEB sales and expense monthly summary AI with an office-PC Codex Bridge job using `gpt-5.6-sol` and the dedicated `tsa-web-sales-analysis` Skill.
- The analysis input is deterministic and compact: 13-month trends, channel profit and deductions, important products and series, advertising performance, and data-quality flags. Historical product cost remains the saved monthly cost.
- Results are saved to `web_sales_ai_analyses` as immutable numbered versions. Re-analysis creates a new version and retains the exact input snapshot, actions, risks, model, and data-quality assessment.
- Both WEB sales and expense management display the same stored report with a focus appropriate to each screen, plus Bridge state, progress, and past-version selection.
- The first production test exposed an unsupported model alias and repeated packet reads. The model ID was corrected to `gpt-5.6-sol`; the packet was deduplicated, key comparisons were precomputed, and the JSON is now embedded once with tool use prohibited for the analysis turn.
- The optimized production test used 34,184 input tokens versus 749,021 in the first test, a 95.4% reduction. Both version 1 and version 2 remain available in analysis history.
- Architecture rule: TSA's Codex Bridge is the repository's authenticated queue worker around official `codex exec`, not a third-party OpenAI-compatible proxy. Use it for internal office-PC AI work; retain a normal API for public real-time or 24-hour cloud-only features.
- The same Bridge/API selection rule is retained in both the repository `AGENTS.md` and the global Codex `AGENTS.md`, so future development does not depend on this chat history.
- Build and migration passed. The production WEB sales and expense pages were smoke-tested with no browser console errors; both show the Sol report and version history. Production alias: `https://v0-tsa-19.vercel.app`.

## 2026-08-16

- Added a distinct `half_month` analysis for the 1st-15th sales snapshot. The job period is now preserved through packet generation, result storage, history selection, and the dashboard banner instead of being replaced with the month end.
- Interim packets contain sales quantities, product mix, and channel mix only. Full prior-month comparisons, advertising, EC deductions, settlements, and final-profit conclusions are disabled until the monthly final run.
- Added `floor_staff_summary` to the structured Sol result. It is limited to a short sales-only operational summary and excludes advertising, EC fees, settlements, and management accounting topics.
- After analysis import, TSA posts the short summary as TSG君 to `NEWブランド館（フロア）`. Posts use a job-specific integration ID to prevent duplicates, and the analysis history stores the post status, URL, and any error.
- Migrated `web_sales_ai_analyses` to keep separate numbered `half_month` and `monthly` histories plus period and TSG post metadata. Existing monthly reports were backfilled without replacement.
- Verification: local and Vercel production builds passed; Bridge `1.8.7` is online. Production analysis job `5d5c200e-ffba-4bab-a9fb-5fc7639bb4d3` completed for 2026-08-01 through 2026-08-15 with expenses/comparisons excluded. TSG post `38cbaa43-8085-40a2-9422-abbeef34227b` was visually verified on the correct floor board under TSG君.
- Production alias: `https://v0-tsa-19.vercel.app`.

## 2026-08-28

- Added a shared finite watchdog to every TSA Codex Bridge `codex exec`. Browser jobs stop after 12 minutes without Codex output or 45 minutes for one phase; ImageGen receives 30/90 minutes, and other AI work receives 15/45 minutes.
- A watchdog stop terminates the complete Codex child-process tree and finalizes the durable job as operator waiting for signed-in browser work or review required for non-browser AI work. It is never returned to the queue automatically.
- Sequential EC jobs retain completed sites, mark only the timed-out site unfinished, and continue to the next requested site. Manual retry remains explicit from the TSA screen.
- The pre-login S4U launcher now verifies worker/state/PID/timestamps (and the lock when present), then retires an idle older Bridge process from the same S4U task context before starting an installed upgrade. Active jobs and ambiguous or reused PIDs are never terminated.
- Pre-login task ownership is compared by Windows SID, so equivalent `ts` and `TSA\\ts` names no longer trigger a needless elevated re-registration wait.
- Unified monitor v2 replaces full-screen redraws with render-key throttling and changed-row-only console writes. Japanese full-width and supplementary characters are measured in console cells so a long line cannot wrap and make the window flash.
- The installer now finds an idle pre-login Bridge even when Session 0 hides its command line. It verifies the state file, lock, PID, execution mode, worker suffix, and recent heartbeat, stops the S4U supervisor first, then replaces only that verified process.
- EC settlement retries no longer stage old screenshots that only proved an unpublished report, an older maximum month, or zero rows at a past check. Without a complete normalized JSON, each retry must inspect the current official page once; stable period transaction files may still be reused.
