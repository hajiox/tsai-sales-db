import assert from "node:assert/strict";
import { getEcPriceJobDisplay } from "../lib/ec-price-job-display.ts";
import { ecPriceHistoryFromJobs } from "../lib/ec-price-codex.ts";

const lp = {
  required: true,
  status: "blocked",
  message: "商品LPの編集元を取得できず停止しました。",
};
const retry = {
  targets: [],
  status: "needs_review",
  summary: "EC反映済み0件 / 商品LP未完了",
  errorMessage: null,
  lp,
};
const display = getEcPriceJobDisplay(retry);
assert.equal(display.lpOnly, true);
assert.equal(display.summary, "商品LPの更新を完了できませんでした。");
assert.doesNotMatch(display.summary, /EC反映済み0件/);
assert.deepEqual(display.details, [lp.message], "Keep the original LP failure cause available without showing it as the main status");
assert.equal(getEcPriceJobDisplay({ ...retry, status: "queued", lp: null }).summary, "商品LPのみ再実行の開始待ちです。");
assert.equal(getEcPriceJobDisplay({ ...retry, status: "running", lp: null }).summary, "商品LPのみ再実行中です。");
assert.equal(getEcPriceJobDisplay({ ...retry, status: "completed", lp: { ...lp, status: "updated" } }).summary, "商品LPの公開反映を確認しました。");
assert.equal(getEcPriceJobDisplay({ ...retry, status: "completed", lp: null }).summary, "商品LPの更新を完了できませんでした。", "A missing LP result must not imply verified publication");
assert.equal(getEcPriceJobDisplay({ ...retry, status: "cancelled" }).summary, "商品LPのみの再実行を停止しました。");
assert.equal(getEcPriceJobDisplay({ ...retry, lp: { ...lp, status: "not_found" } }).lpMessage, "更新する商品LPを確認できませんでした");
assert.deepEqual(getEcPriceJobDisplay({ ...retry, errorMessage: lp.message }).details, [lp.message]);

const ecRun = { ...retry, targets: ["rakuten", "yahoo", "base"], summary: "EC反映済み3件 / 商品LP未完了" };
const ecDisplay = getEcPriceJobDisplay(ecRun);
assert.equal(ecDisplay.lpOnly, false);
assert.equal(ecDisplay.summary, ecRun.summary, "Keep the current EC run's own result unchanged");
assert.equal(ecDisplay.lpMessage, lp.message);
assert.equal(getEcPriceJobDisplay({ ...ecRun, summary: null, errorMessage: "価格変更に失敗しました" }).summary, "価格変更に失敗しました");
assert.deepEqual(retry.targets, [], "Display derivation must not merge earlier targets into a retry");
assert.equal(retry.summary, "EC反映済み0件 / 商品LP未完了", "Display derivation must not rewrite persisted results");
const previousTargets = ["amazon", "rakuten", "yahoo", "base"];
const previousJob = {
  id: "previous-ec-run",
  created_at: "2026-10-10T01:00:00Z",
  status: "needs_review",
  parameters: { targets: previousTargets, newPriceInclTax: 1200 },
  result: {
    plan: { sites: previousTargets.map((site) => ({ site, basis_price: 1000, target_price: 1200 })) },
    sites: previousTargets.map((site) => ({ site, status: site === "amazon" ? "submitted_pending" : "updated" })),
  },
};
const lpRetryJob = { ...previousJob, id: "lp-only-retry", parameters: { targets: [], newPriceInclTax: 1200 }, result: { sites: [], lp } };
const history = ecPriceHistoryFromJobs([lpRetryJob, previousJob]);
assert.equal(history.length, 1, "An LP-only retry must not replace the earlier EC price history");
assert.equal(history[0].id, previousJob.id);
assert.deepEqual(history[0].sites.map(({ site, status }) => ({ site, status })), [
  { site: "amazon", status: "submitted_pending" },
  { site: "rakuten", status: "updated" },
  { site: "yahoo", status: "updated" },
  { site: "base", status: "updated" },
]);
console.log("EC price LP-only retry display tests passed.");
