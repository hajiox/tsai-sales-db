export type AcquisitionKind = "sales" | "ec_profit" | "advertising";
export type AcquisitionRoute = "api" | "bridge" | "manual" | "none";
export type SavedAcquisitionRoute = Exclude<AcquisitionRoute, "none"> | "unknown";

/** Limit new acquisition controls without removing historical task definitions. */
export function activeAcquisitionTasks<T extends { channel: string }>(tasks: T[]): T[] {
  return tasks.filter((task) => !["mercari", "tiktok", "qoo10"].includes(task.channel));
}

export type SavedAcquisitionResult = { status: string; period_start?: string | null; period_end?: string | null; finished_at?: string | null };
export function savedAcquisitionSupersedesAttempt(saved: SavedAcquisitionResult | null | undefined, startDate: string, endDate: string, attemptAt?: string | null): boolean {
  if (!saved || !["success", "completed", "partial", "needs_review"].includes(saved.status)
    || saved.period_start !== startDate || saved.period_end !== endDate) return false;
  const savedAt = Date.parse(saved.finished_at || "");
  const attemptedAt = Date.parse(attemptAt || "");
  return Number.isFinite(savedAt) && (!Number.isFinite(attemptedAt) || savedAt >= attemptedAt);
}
export function savedAcquisitionIsComplete(saved: SavedAcquisitionResult | null | undefined): boolean {
  return Boolean(saved && ["success", "completed"].includes(saved.status));
}

export type AcquisitionStatus = {
  kind: AcquisitionKind;
  channel: string;
  preferred_route: AcquisitionRoute;
  api_ready: boolean;
  api_supported: boolean;
  missing_config: string[];
  reason: string;
  latest?: {
    route: SavedAcquisitionRoute;
    status: string;
    finished_at?: string | null;
    period_start?: string | null;
    period_end?: string | null;
  } | null;
  last_attempt?: { route: SavedAcquisitionRoute; status: string; message?: string; attempted_at?: string | null } | null;
};

export type AcquisitionRun = {
  id: string;
  kind: AcquisitionKind;
  channel: string;
  status: string;
  period_start: string;
  period_end: string;
  report_month: string;
  result: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export function acquisitionRunIsSaved(run: AcquisitionRun | undefined | null): boolean {
  return run?.status === "completed" && run.result.persisted === true;
}

export function selectEffectiveAcquisitionRun(runs: AcquisitionRun[]): AcquisitionRun | undefined {
  const sorted = [...runs].sort((left, right) => right.started_at.localeCompare(left.started_at));
  const latest = sorted[0];
  const saved = sorted.find(acquisitionRunIsSaved);
  if (latest && ["queued", "running", "waiting_for_user"].includes(latest.status)) return latest;
  return saved || latest;
}

export type AcquisitionMark = {
  label: string;
  route: AcquisitionRoute | "unknown" | "waiting";
  title: string;
};

const ROUTE_LABELS: Record<AcquisitionRoute | "unknown", string> = {
  api: "API",
  bridge: "Bridge",
  manual: "CSV",
  none: "未設定",
  unknown: "経路未確認",
};

const RESULT_LABELS: Record<string, string> = {
  queued: "待機中",
  running: "実行中",
  waiting_for_user: "操作待ち",
  needs_review: "要確認",
  failed: "失敗",
  cancelled: "停止",
  partial: "部分取得",
};

/** Configuration describes the next run; it must never rewrite historical provenance. */
export function acquisitionMarks(status: AcquisitionStatus): AcquisitionMark[] {
  const nextLabel = status.preferred_route === "api" && !status.api_ready
    ? "API接続待ち"
    : status.preferred_route === "none" && status.reason.includes("退店")
      ? "対象外"
      : ROUTE_LABELS[status.preferred_route];
  const marks: AcquisitionMark[] = [{
    label: `次回: ${nextLabel}`,
    route: status.preferred_route === "api" && !status.api_ready ? "waiting" : status.preferred_route,
    title: `次回の取得経路。${status.reason || "取得設定に従って実行します。"}`,
  }];
  const attemptedAt = Date.parse(status.last_attempt?.attempted_at || "");
  const savedAt = Date.parse(status.latest?.finished_at || "");
  const supersededAttempt = Number.isFinite(attemptedAt) && Number.isFinite(savedAt) && attemptedAt < savedAt;
  if (status.last_attempt && RESULT_LABELS[status.last_attempt.status] && !supersededAttempt) {
    marks.push({
      label: `${ROUTE_LABELS[status.last_attempt.route]}: ${RESULT_LABELS[status.last_attempt.status]}`,
      route: status.last_attempt.status === "waiting_for_user" ? "waiting" : status.last_attempt.route,
      title: status.last_attempt.message || "直近の取得処理の状態です。保存済みデータとは別に表示します。",
    });
  }
  if (!status.latest) return marks;
  const latest = status.latest;
  const result = RESULT_LABELS[latest.status];
  const saved = ["success", "completed", "partial", "needs_review"].includes(latest.status);
  const prefix = saved && latest.route !== "unknown" ? "保存" : "前回";
  const period = latest.period_start && latest.period_end
    ? `対象期間 ${latest.period_start}～${latest.period_end}。` : "";
  marks.push({
    label: `${prefix}: ${ROUTE_LABELS[latest.route]}${result ? `（${result}）` : ""}`,
    route: latest.route,
    title: `${period}${saved ? "保存結果" : "直近の取得記録"}の経路。${latest.finished_at ? `更新 ${latest.finished_at}。` : ""}${latest.route === "unknown" ? "過去データの取得経路を推測して表示していません。" : ""}`,
  });
  return marks;
}
