# 2026-09-16 Story editor drag repair

- Meta's photo editor replaces the text overlay on selection. The upstream element-to-element drag can use a detached handle, and synthetic mouse events did not move the overlay. A real stepped mouse drag worked in the signed-in UI.
- Bridge 1.9.95 preloads a scoped adapter into its existing official Chrome DevTools daemon. It captures points before selection and sends stepped mouse movement, always releasing the mouse. Optional delta coordinates are accepted only within the Meta Story editor dialog and viewport. Other sites retain upstream drag behavior. No new browser, credential, file scope or publishing endpoint is introduced.
- Publishing Skill now selects the observed business/page mapping, activates the text overlay before typing, checks clipping, and validates saved text/sticker layout before publishing. Fixed text may be split across boxes without changing any characters.
- Tests: stale-handle avoidance, mouse release on failure, viewport/domain/dialog constraints, original-tool fallback; Chrome connection ownership/reuse; Skill contract; SNS publication contract; secret/RLS checks.
- Actual publication and layout verification remain required after installation. Existing daemon is replaced once during idle maintenance to load the adapter; per-job daemon restarts remain prohibited.
