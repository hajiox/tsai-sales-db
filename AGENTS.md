# TSA Repository Instructions

## Scope

- This repository is the TSA application. Do not edit TSG, DocScanner, or the separately hosted internal-work system unless the user explicitly changes the scope.
- Preserve unrelated local changes and coordinate around files that may be edited by other development teams.
- GitHub `origin` is the source of truth. Before any TSA code edit, clone the intended GitHub branch into a new job-specific directory, verify the clone is clean and `HEAD` matches `origin/<branch>`, and work only from that clone. Never treat an existing local clone as latest or use `git pull` there as a substitute.
- Older TSA clones are read-only evidence. Do not reset, clean, stash, delete, or overwrite them. Selectively transplant only required uncommitted changes onto the fresh clone after inspection.

## Codex Bridge And Recurring Jobs

- In this repository, "TSA Codex Bridge" means TSA's own authenticated queue worker around the official `codex exec`; it is not a third-party OpenAI-compatible localhost proxy and must not be presented as an OpenAI product.
- For advanced internal analysis, local CSV/Excel processing, report generation, and signed-in browser work, prefer the office-PC worker using the ChatGPT subscription Codex allowance over adding another model API bill.
- Vercel must never try to run Codex CLI directly. Vercel queues durable jobs, the allow-listed office PC claims them, and the PC writes structured results back to TSA.
- Keep a normal model API only when the feature must run while the office PC is offline, must respond in real time to public users, or requires dependable 24-hour cloud execution. Do not expose a local HTTP bridge to the internet merely to avoid an API.
- Prefer the official `codex exec` route first. Introduce an OpenAI-compatible local proxy or `codex mcp-server` only when an existing integration genuinely requires that interface.
- The TSA Codex Bridge must use `preflight_then_ephemeral`: run deterministic preflight first, then start a fresh isolated Codex session only when browser judgment is still required.
- Never configure the Bridge to resume the TSA development chat or any other large shared session.
- Every Codex run started from a TSA screen must use a dedicated Skill and a fresh ephemeral session. Never pass a development task/thread ID, conversation history, or a prompt that asks Codex to reread a past chat. If the workflow has no dedicated Skill yet, create or update the Skill before enabling the app button.
- EC product-sales jobs must use `tsa-web-sales-csv`.
- Advertising-cost jobs must use `tsa-ad-cost-csv`.
- EC settlement, fee, discount, refund, coupon, point, and payout jobs must use `tsa-ec-profit-report`.
- Monthly WEB sales and EC expense analysis jobs must use `tsa-web-sales-analysis`, a compact deterministic input packet, structured output, and immutable versioned history.
- A production job should receive only its allow-listed job type, channel, period, archive paths, and the matching Skill instructions.
- Prefer, in order: an already completed idempotent result, a verified archived artifact, an official API or CLI, a local deterministic script, and finally signed-in browser automation.
- Browser automation is responsible only for navigation and download. Local code is responsible for validation, normalization, matching, import, and final reconciliation whenever feasible.
- Signed-in EC browser automation must discover and reuse the user's already-open official Chrome tab for each site. Do not open a new tab or window to test authentication, and do not close operator-owned tabs. If the required signed-in tab is absent, stop in operator-waiting state with the exact site that must be opened.
- If a recurring workflow changes, update its Skill and reference files before retrying the job. Do not preserve new knowledge only in a chat.

## Completion

- After each completed TSA task, append a concise dated entry to the relevant local operation Markdown file.
- For code or database behavior changes, run focused tests, deploy to the production alias, and perform a production smoke check. Instruction-only local Codex changes do not require application deployment.
