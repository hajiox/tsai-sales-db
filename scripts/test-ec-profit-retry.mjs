import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReusableEcProfitOriginalName } from "../tools/tsa-codex-bridge/ec-profit-artifact-policy.mjs";
import {
  isAutomaticSettlementRetryDue,
  settlementPeriodMonthsAgo,
} from "../lib/web-sales-codex/ec-profit-retry.ts";

const bridge = readFileSync(new URL("../tools/tsa-codex-bridge/bridge.mjs", import.meta.url), "utf8");
const installer = readFileSync(new URL("../tools/tsa-codex-bridge/install-bridge.ps1", import.meta.url), "utf8");
const skill = readFileSync(new URL("../tools/tsa-codex-bridge/skills/tsa-ec-profit-report/SKILL.md", import.meta.url), "utf8");
const channels = readFileSync(new URL("../tools/tsa-codex-bridge/skills/tsa-ec-profit-report/references/channels.md", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/web-sales/ec-profit/route.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../app/api/cron/web-sales-sync/route.ts", import.meta.url), "utf8");
const estimate = readFileSync(new URL("../lib/web-sales-codex/ec-profit-estimate.ts", import.meta.url), "utf8");
const estimateApi = readFileSync(new URL("../app/api/web-sales/codex-bridge/jobs/[id]/ec-profit-estimate/route.ts", import.meta.url), "utf8");

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
assert.match(channels, /Qoo10 has no calendar-month statement publication date/);
assert.match(channels, /Qアカウント(?:の)?履歴/);
assert.match(channels, /general sellers are settled after 15 days on the following Wednesday/);
assert.match(channels, /#btn_search_sell_detail/);
assert.match(channels, /lower block still shows its default date is invalid evidence/);
assert.match(channels, /Search the lower block twice/);
assert.match(channels, /search every official order number individually/);
assert.match(channels, /at most four order numbers per browser-tool call/);
assert.match(channels, /reconciliation-checkpoint\.original\.json/);
assert.match(channels, /A timeout is not a zero-row result/);
assert.match(channels, /repeat once with `発送日`/);
assert.match(channels, /#btn_search_gaccount/);
assert.match(channels, /follow every pagination control/);
assert.match(channels, /JPY 19,849/);
assert.match(bridge, /batches of no more than four browser-tool operations/);
assert.match(bridge, /four verified credits total JPY 19,849/);
assert.match(bridge, /summary: result\.summary \|\| estimated\.summary/);
assert.doesNotMatch(estimate, /公式明細公開前/);
assert.doesNotMatch(estimateApi, /公式精算公開前/);
assert.match(estimate, /公式費目別明細の照合が未完了/);
assert.match(estimateApi, /公式費目別明細を照合できない/);
assert.match(api, /Qoo10は配送完了後の水曜に注文単位で精算されます/);
assert.match(api, /Qoo10の月次精算明細は翌月5日の発行後に取得します。[\s\S]*Qoo10は注文単位の水曜精算です/);
assert.match(api, /毎週木曜9:15に自動再照合/);
assert.match(cron, /for \(const monthsAgo of \[1, 2\]\)/);

assert.deepEqual(settlementPeriodMonthsAgo(2026, 8, 1), {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  reportMonth: "2026-08",
});
assert.deepEqual(settlementPeriodMonthsAgo(2026, 8, 2), {
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  reportMonth: "2026-07",
});
assert.equal(isAutomaticSettlementRetryDue({ channel: "qoo10", day: 3, weekday: 4, monthsAgo: 2 }), true);
assert.equal(isAutomaticSettlementRetryDue({ channel: "qoo10", day: 4, weekday: 5, monthsAgo: 2 }), false);
assert.equal(isAutomaticSettlementRetryDue({ channel: "rakuten", day: 12, weekday: 6, monthsAgo: 2 }), true);
assert.equal(isAutomaticSettlementRetryDue({ channel: "rakuten", day: 15, weekday: 2, monthsAgo: 2 }), true);
assert.equal(isAutomaticSettlementRetryDue({ channel: "rakuten", day: 13, weekday: 0, monthsAgo: 2 }), false);
assert.equal(isAutomaticSettlementRetryDue({ channel: "amazon", day: 13, weekday: 0, monthsAgo: 2 }), false);

console.log("EC profit retry artifact checks passed.");
