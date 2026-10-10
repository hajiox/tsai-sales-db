import assert from "node:assert/strict";
import { activeAcquisitionTasks, acquisitionMarks, acquisitionRunIsCurrent, acquisitionRunIsSaved, savedAcquisitionIsComplete, savedAcquisitionSupersedesAttempt, selectEffectiveAcquisitionRun } from "../lib/web-sales-acquisition-display.ts";

const historicalTasks = ["amazon", "rakuten", "yahoo", "base", "mercari", "tiktok", "qoo10"].map((channel) => ({ channel, label: channel }));
assert.deepEqual(activeAcquisitionTasks(historicalTasks).map((task) => task.channel), ["amazon", "rakuten", "yahoo", "base"]);
assert.equal(activeAcquisitionTasks(historicalTasks, "2026-09").length, 7, "September history retains all stores");
assert.equal(activeAcquisitionTasks(historicalTasks, "2026-10").length, 4, "October displays only operational stores");
assert.equal(historicalTasks.length, 7, "Filtering new controls must keep historical definitions intact");
const savedPeriod = { status: "success", period_start: "2026-09-01", period_end: "2026-09-30", finished_at: "2026-10-01T10:00:00Z" };
assert.equal(savedAcquisitionSupersedesAttempt(savedPeriod, "2026-09-01", "2026-09-30", "2026-09-30T10:00:00Z"), true, "A verified later save supersedes an old Bridge wait");
assert.equal(savedAcquisitionSupersedesAttempt(savedPeriod, "2026-09-01", "2026-09-30", "2026-10-02T10:00:00Z"), false, "A new attempt remains visible");
assert.equal(savedAcquisitionSupersedesAttempt(savedPeriod, "2026-09-01", "2026-09-15"), false, "Monthly saves must not complete a different period");
assert.equal(savedAcquisitionSupersedesAttempt({ ...savedPeriod, finished_at: null }, "2026-09-01", "2026-09-30"), false, "An unverified month fallback cannot suppress an operator wait");
assert.equal(savedAcquisitionIsComplete(savedPeriod), true);
assert.equal(savedAcquisitionIsComplete({ ...savedPeriod, status: "partial" }), false);
assert.equal(savedAcquisitionIsComplete({ ...savedPeriod, status: "needs_review" }), false);

const api = { kind: "sales", channel: "base", preferred_route: "api", api_ready: true, api_supported: true, missing_config: [], reason: "公式APIを使用" };
const historicalCsv = acquisitionMarks({ ...api, latest: { route: "manual", status: "completed", period_start: "2026-09-01", period_end: "2026-09-30" } });
assert.deepEqual(historicalCsv.map((mark) => mark.label), ["次回: API", "保存: CSV"]);
assert.equal(historicalCsv[1].route, "manual", "API configuration must not relabel CSV history");
assert.match(historicalCsv[1].title, /2026-09-01～2026-09-30/);

const unknown = acquisitionMarks({ ...api, latest: { route: "unknown", status: "completed" } });
assert.equal(unknown[1].label, "前回: 経路未確認");
assert.match(unknown[1].title, /推測して/);
assert.deepEqual(acquisitionMarks(api).map((mark) => mark.label), ["次回: API"]);

const missing = acquisitionMarks({ ...api, api_ready: false, missing_config: ["BASE_ACCESS_TOKEN"] });
assert.equal(missing[0].label, "次回: API接続待ち");
assert.equal(missing[0].route, "waiting");
assert.doesNotMatch(missing[0].title, /BASE_ACCESS_TOKEN/, "Do not put configuration identifiers into product copy");

const waiting = acquisitionMarks({ ...api, preferred_route: "bridge", latest: { route: "bridge", status: "waiting_for_user" } });
assert.equal(waiting[1].label, "前回: Bridge（操作待ち）");
const failure = acquisitionMarks({ ...api, latest: { route: "api", status: "failed" } });
assert.equal(failure[1].label, "前回: API（失敗）", "Failed calls are not saved results");
const partialSaved = acquisitionMarks({ ...api, latest: { route: "bridge", status: "partial" } });
assert.equal(partialSaved[1].label, "保存: Bridge（部分取得）");
const savedForReview = acquisitionMarks({ ...api, latest: { route: "api", status: "needs_review" } });
assert.equal(savedForReview[1].label, "保存: API（要確認）", "Status endpoint latest contains only persisted provenance");
const retired = acquisitionMarks({ ...api, preferred_route: "none", reason: "退店予定・新規取得対象外" });
assert.equal(retired[0].label, "次回: 対象外");
const attemptedWait = acquisitionMarks({ ...api, last_attempt: { route: "api", status: "waiting_for_user", message: "店舗の認可が必要です" }, latest: { route: "manual", status: "completed" } });
assert.deepEqual(attemptedWait.map((mark) => mark.label), ["次回: API", "API: 操作待ち", "保存: CSV"]);
assert.equal(attemptedWait[1].route, "waiting");
const outdatedWait = acquisitionMarks({ ...api,
  last_attempt: { route: "bridge", status: "waiting_for_user", attempted_at: "2026-09-30T10:00:00Z" },
  latest: { route: "manual", status: "completed", finished_at: "2026-10-01T10:00:00Z" },
});
assert.deepEqual(outdatedWait.map((mark) => mark.label), ["次回: API", "保存: CSV"], "An older operator wait must not appear as new action after a later saved import");
const resumedWait = acquisitionMarks({ ...api,
  last_attempt: { route: "bridge", status: "waiting_for_user", attempted_at: "2026-10-02T10:00:00Z" },
  latest: { route: "manual", status: "completed", finished_at: "2026-10-01T10:00:00Z" },
});
assert.deepEqual(resumedWait.map((mark) => mark.label), ["次回: API", "Bridge: 操作待ち", "保存: CSV"], "A newly resumed attempt still requires visible operator action");

const completed = { id: "saved", kind: "sales", channel: "base", status: "completed", period_start: "2026-09-01", period_end: "2026-09-30", report_month: "2026-09", result: { persisted: true }, started_at: "2026-10-01T10:00:00Z", completed_at: "2026-10-01T10:01:00Z" };
const noSave = { ...completed, id: "no-save", result: {} };
assert.equal(acquisitionRunIsSaved(completed), true);
assert.equal(acquisitionRunIsSaved(noSave), false, "Completed without persisted proof must not count as imported");
const failedRetry = { ...completed, id: "retry", status: "failed", result: {}, started_at: "2026-10-02T10:00:00Z" };
assert.equal(selectEffectiveAcquisitionRun([failedRetry, completed]), completed, "Failed retry must preserve saved data state");
const runningRetry = { ...failedRetry, status: "running" };
assert.equal(selectEffectiveAcquisitionRun([completed, runningRetry]), runningRetry);
const queuedRetry = { ...runningRetry, status: "queued" };
assert.equal(selectEffectiveAcquisitionRun([completed, queuedRetry]), queuedRetry, "New queued API run must remain visible instead of hidden by old completion");
const waitingRetry = { ...queuedRetry, status: "waiting_for_user" };
assert.equal(selectEffectiveAcquisitionRun([completed, waitingRetry]), waitingRetry, "Operator waits are active and must not disappear behind prior saved data");
const yahooBridge = { ...api, channel: "yahoo", preferred_route: "bridge", api_ready: false, api_disabled_by_policy: true, reason: "Yahoo!はBridgeで取得します" };
const savedYahoo = { ...completed, channel: "yahoo" };
const waitingYahoo = { ...waitingRetry, channel: "yahoo" };
assert.equal(acquisitionRunIsCurrent(waitingYahoo, yahooBridge), false, "Old Yahoo API waits must not remain current work after explicit Bridge selection");
assert.equal(acquisitionRunIsCurrent(savedYahoo, yahooBridge), true, "Saved Yahoo API history must survive a future route change");
assert.equal(acquisitionRunIsCurrent(noSave, yahooBridge), false, "An unpersisted completion is not saved history");
assert.equal(acquisitionRunIsCurrent(waitingRetry, api), true, "Other configured API operator waits remain actionable");
assert.equal(acquisitionRunIsCurrent(waitingYahoo, undefined), true, "Absent capability metadata must not silently hide a pending run");
const yahooHistory = [waitingYahoo, savedYahoo];
assert.equal(selectEffectiveAcquisitionRun(yahooHistory.filter(run => acquisitionRunIsCurrent(run, yahooBridge))), savedYahoo);
assert.equal(yahooHistory.length, 2, "Filtering current work must not delete the historical attempts");
const yahooMarks = acquisitionMarks({ ...yahooBridge, latest: { route: "api", status: "completed", period_start: savedYahoo.period_start, period_end: savedYahoo.period_end } });
assert.deepEqual(yahooMarks.map(mark => mark.label), ["次回: Bridge", "保存: API"], "Bridge policy must not relabel the original saved API provenance");
assert.equal(selectEffectiveAcquisitionRun([]), undefined);
console.log("Acquisition display: provenance, operator waits, Yahoo Bridge policy and retained API history passed");
