export type FinanceJobState = {
  task_key?: string | null;
  status?: string | null;
  result?: unknown;
  created_at?: string | null;
};

const FINANCE_TASKS = new Set(["ad_cost_import", "ec_profit_import"]);
const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function hasPersistedFinanceImport(job: FinanceJobState | null | undefined) {
  if (!job || !FINANCE_TASKS.has(String(job.task_key || ""))) return false;
  if (job.status === "completed") return true;
  if (job.status !== "needs_review") return false;

  const result = asRecord(job.result);
  return result.estimated !== true && Number(result.imported_count || 0) > 0;
}

export function selectEffectiveFinanceJob<T extends FinanceJobState>(jobs: readonly T[]) {
  if (jobs.length === 0) return undefined;

  const sorted = [...jobs].sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));
  const latest = sorted[0];
  if (!FINANCE_TASKS.has(String(latest.task_key || ""))) return latest;

  const active = sorted.find((job) => ACTIVE_STATUSES.has(String(job.status || "")));
  const imported = sorted.find(hasPersistedFinanceImport);
  if (active && (!imported || timestamp(active.created_at) > timestamp(imported.created_at))) return active;

  // A later retry can stop at login or download permission after valid data was
  // already saved. Keep that retry in history, but do not make it the data state.
  return imported || latest;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
