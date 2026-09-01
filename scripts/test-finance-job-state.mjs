import assert from "node:assert/strict";
import {
  hasPersistedFinanceImport,
  selectEffectiveFinanceJob,
} from "../lib/web-sales-codex/finance-job-state.ts";

const completed = {
  task_key: "ad_cost_import",
  status: "completed",
  created_at: "2026-09-01T08:00:00Z",
  result: { imported_count: 10 },
};
const laterWait = {
  task_key: "ad_cost_import",
  status: "waiting_for_user",
  created_at: "2026-09-01T09:00:00Z",
  result: { summary: "download permission" },
};
assert.equal(selectEffectiveFinanceJob([laterWait, completed]), completed);

const officialPartial = {
  task_key: "ec_profit_import",
  status: "needs_review",
  created_at: "2026-09-01T10:00:00Z",
  result: { imported_count: 1 },
};
assert.equal(hasPersistedFinanceImport(officialPartial), true);
assert.equal(selectEffectiveFinanceJob([laterWait, officialPartial]), officialPartial);

const estimate = {
  task_key: "ec_profit_import",
  status: "needs_review",
  created_at: "2026-09-01T10:00:00Z",
  result: { imported_count: 1, estimated: true },
};
assert.equal(hasPersistedFinanceImport(estimate), false);

const activeRetry = {
  task_key: "ec_profit_import",
  status: "running",
  created_at: "2026-09-01T11:00:00Z",
  result: {},
};
assert.equal(selectEffectiveFinanceJob([activeRetry, officialPartial]), activeRetry);

const staleActive = {
  task_key: "ec_profit_import",
  status: "queued",
  created_at: "2026-09-01T09:00:00Z",
  result: {},
};
assert.equal(selectEffectiveFinanceJob([officialPartial, staleActive]), officialPartial);

const salesWait = {
  task_key: "web_sales_import",
  status: "waiting_for_user",
  created_at: "2026-09-01T12:00:00Z",
  result: {},
};
assert.equal(selectEffectiveFinanceJob([completed, salesWait]), salesWait);

console.log("finance job state tests passed");
