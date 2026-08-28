import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReusableEcProfitOriginalName } from "../tools/tsa-codex-bridge/ec-profit-artifact-policy.mjs";

const bridge = readFileSync(new URL("../tools/tsa-codex-bridge/bridge.mjs", import.meta.url), "utf8");
const installer = readFileSync(new URL("../tools/tsa-codex-bridge/install-bridge.ps1", import.meta.url), "utf8");
const skill = readFileSync(new URL("../tools/tsa-codex-bridge/skills/tsa-ec-profit-report/SKILL.md", import.meta.url), "utf8");

assert.equal(isReusableEcProfitOriginalName("qoo10-2026-07-01_2026-07-31-delivery-detail.original.csv"), true);
assert.equal(isReusableEcProfitOriginalName("rakuten-2026-07-01_2026-07-31-billpay-max-month-202606.original.png"), false);
assert.equal(isReusableEcProfitOriginalName("qoo10-2026-07-01_2026-07-31-settlement-unavailable-2026-08-05.original.png"), false);
assert.equal(isReusableEcProfitOriginalName("qoo10-2026-07-01_2026-07-31-zero-transactions.original.png"), false);
assert.equal(isReusableEcProfitOriginalName("rakuten-2026-07-01_2026-07-31-login-expired.original.png"), false);

assert.match(bridge, /Open the current official seller\/admin page once in this run/);
assert.match(bridge, /staged originals[\s\S]*never prove today's publication or row availability/i);
assert.match(bridge, /isReusableEcProfitOriginalName\(name\)/);
assert.match(installer, /"ec-profit-artifact-policy\.mjs"/);
assert.match(skill, /prior screenshot showing an unpublished report, zero rows, or an older maximum month is expired availability evidence/);

console.log("EC profit retry artifact checks passed.");
