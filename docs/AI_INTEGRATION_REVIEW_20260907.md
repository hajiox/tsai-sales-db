# AI integration review — 2026-09-07

## Verified boundaries

| System / operation | Existing connection | Change in this release |
| --- | --- | --- |
| TSA sales / advertising chat | Gemini REST API | Complete recent conversation turns bounded to 12 historical messages / 24,000 historical characters; latest question and authoritative sales facts retained; compact JSON; numeric usage telemetry |
| Other TSA model operations | Existing Gemini / OpenAI APIs | Inventory reviewed; models, billing, business data and provider credentials retained |
| TSG DM / resume OCR | Gemini REST API; existing Drive OCR fallback | Shared HTTP client, header authentication, timeouts, numeric usage, bounded DM history |
| DocScanner OCR / classification / extraction | Gemini SDK API calls | All 12 generation call sites routed through a common metadata gateway; model settings and repair attempts retained |
| DocScanner FAX → worker | TSA authenticated job API, previously shared-disk image reads | Authenticated DocScanner image POST API with bounded bytes and hash verification; DELETE API only after accepted summary |
| TSA queue → Bridge → AI | Authenticated HTTPS queue, fresh official Codex execution | Existing task/Skill/model/output contracts retained; Bridge 1.9.68 uses the artifact API |
| Bridge → signed-in seller / SNS sites | Allow-listed CUA MCP; official API adapters where already implemented | Existing operation/account/idempotency boundaries retained |

## Data and execution rules

Application code owns authentication, fixed values, source identity, queues, idempotency,
retry limits, parsing, validation and imports. AI receives only the required decision
input. MCP tools should expose scoped business operations, not unrestricted SQL,
filesystem reads or arbitrary network requests. Adding a second MCP wrapper to a
complete compact API response would not by itself reduce tokens.

Per-request model telemetry uses `version`, `system`, `provider`, `task`, `model`,
`status`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `thinkingTokens`,
`totalTokens` and `durationMs`. Missing counts remain null. Source text, credentials,
document identifiers and prompts are not telemetry fields. Existing Bridge monitor
metrics continue to cover Codex jobs independently of monitor-window lifetime.

## Verification and limits

Focused tests use synthetic input and mocked provider responses; they do not post,
send documents, alter prices or call paid AI providers. Character budgets and compact
JSON reduce the maximum/redundant input payload; no measured token-saving percentage
is claimed. Compare like-for-like production usage, success, retries and duration
after normal authorized jobs run.

This release preserves existing Gemini/OpenAI API and Codex subscription execution.
It does not migrate all Codex inference to separately billed model APIs or replace
every seller UI operation with a direct official marketplace API. Those are distinct
changes requiring a selected execution/billing policy and verified site-specific
API credentials/capabilities. Browser operation is already exposed through MCP;
that does not make it a direct marketplace API.

TSA shared-context auto-sync encountered existing uncommitted changes. They were
preserved; application changes were made only in fresh clones of GitHub main.
