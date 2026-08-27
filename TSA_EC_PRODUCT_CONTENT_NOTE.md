# TSA EC Product Content Bridge

## 2026-08-27

- Moved the combined product-point/Web-description character count directly above the two source fields.
- Added a GPT-5.6 Sol / medium adjustment job for content over 500 characters. The application recalculates the final JavaScript string length and stores every generated result as immutable history before it can be adopted.
- Added individual marketplace buttons and a black `全EC` action for Amazon, Rakuten, Yahoo, Mercari Shops, BASE, Qoo10, and TikTok.
- Amazon receives separate product-point bullets and product description. The other six sites receive one combined description with product points above and Web description below.
- Rakuten and Yahoo receive square `■` markers. The other five sites receive `✅️` markers.
- Each marketplace runs as a separate fresh Skill-controlled Codex session. Completed sites remain complete when a later site is blocked, and retry queues unfinished sites only.
- Added Bridge 1.9.2 capabilities, compact schemas, strict recipe snapshots, administrator authorization, per-site post-save verification, dedicated Skills, and database claim guards.
- Both Skills explicitly prohibit loading the large TSA development Chat, prior tasks, threads, transcripts, rollouts, or saved Codex sessions.

## Verification

- Focused ESLint: 0 errors (only pre-existing warnings in the large recipe page).
- `test:ec-product-content-bridge`, `test:bridge-skill-contract`, `test:ec-product-name-bridge`, `test:ec-catchcopy-bridge`, `test:bridge-monitor`, and `test:bridge-prelogin`: passed.
- Both bundled Skills passed `quick_validate.py` with UTF-8 mode.
- Production-environment `next build`: passed with `NEXTAUTH_URL=https://v0-tsa-19.vercel.app`.
- Migration dry run and production transaction verification: passed.

## Remaining operational boundary

- EC writes require the office Windows user to be signed in, the interactive Bridge to be online, and the relevant seller account to be available in the user's logged-in Chrome. Login, MFA, CAPTCHA, account selection, permission prompts, or uncertain product identity stop only that EC and leave completed EC results intact.
