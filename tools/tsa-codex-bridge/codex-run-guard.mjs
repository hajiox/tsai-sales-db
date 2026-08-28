const OPERATOR_SESSION_TASKS = new Set([
  "web_sales_import",
  "ad_cost_import",
  "ec_profit_import",
  "ec_price_update",
  "ec_product_name_update",
  "ec_catchcopy_update",
  "ec_product_content_update",
]);

const TASK_LIMITS = Object.freeze({
  browser: Object.freeze({ silenceTimeoutMs: 12 * 60_000, absoluteTimeoutMs: 45 * 60_000 }),
  image: Object.freeze({ silenceTimeoutMs: 30 * 60_000, absoluteTimeoutMs: 90 * 60_000 }),
  default: Object.freeze({ silenceTimeoutMs: 15 * 60_000, absoluteTimeoutMs: 45 * 60_000 }),
});

export class CodexRunGuardError extends Error {
  constructor({ taskKey, reason, timeoutMs }) {
    const minutes = Math.max(1, Math.ceil(timeoutMs / 60_000));
    const operatorSession = OPERATOR_SESSION_TASKS.has(String(taskKey || ""));
    const reasonLabel = reason === "absolute_timeout" ? "1工程の実行時間" : "Codexからの応答停止時間";
    const nextAction = operatorSession
      ? "対象サイトのログイン・MFA・権限画面を確認し、TSA画面から手動で再実行してください。"
      : "Codexまたは外部生成処理の状態を確認し、TSA画面から手動で再実行してください。";
    super(`${reasonLabel}が上限${minutes}分に達したため安全停止しました。${nextAction}このジョブは自動再実行しません。`);
    this.name = "CodexRunGuardError";
    this.code = reason === "absolute_timeout" ? "CODEX_ABSOLUTE_TIMEOUT" : "CODEX_SILENCE_TIMEOUT";
    this.reason = reason;
    this.taskKey = String(taskKey || "");
    this.timeoutMs = timeoutMs;
    this.jobStatus = operatorSession ? "waiting_for_user" : "needs_review";
    this.currentStep = operatorSession
      ? "ログイン・MFA・権限状態を確認して手動再実行してください"
      : "Codex応答停止を確認して手動再実行してください";
  }
}

export function isCodexRunGuardError(error) {
  return error instanceof CodexRunGuardError
    || (error && typeof error === "object" && /^CODEX_(?:SILENCE|ABSOLUTE)_TIMEOUT$/.test(String(error.code || "")));
}

export function codexRunLimitsForTask(taskKey, env = process.env) {
  const key = String(taskKey || "");
  const profile = key === "recipe_sns_generate"
    ? TASK_LIMITS.image
    : OPERATOR_SESSION_TASKS.has(key)
      ? TASK_LIMITS.browser
      : TASK_LIMITS.default;
  const silenceTimeoutMs = boundedOverride(
    env.TSA_CODEX_SILENCE_TIMEOUT_MS,
    profile.silenceTimeoutMs,
    3 * 60_000,
    60 * 60_000,
  );
  const absoluteTimeoutMs = boundedOverride(
    env.TSA_CODEX_ABSOLUTE_TIMEOUT_MS,
    profile.absoluteTimeoutMs,
    10 * 60_000,
    3 * 60 * 60_000,
  );
  return {
    silenceTimeoutMs,
    absoluteTimeoutMs: Math.max(absoluteTimeoutMs, silenceTimeoutMs + 60_000),
  };
}

export function waitForCodexExitWithWatchdog(child, options = {}) {
  const taskKey = String(options.taskKey || "");
  const limits = options.limits || codexRunLimitsForTask(taskKey, options.env || process.env);
  const terminate = typeof options.terminate === "function" ? options.terminate : defaultTerminate;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;

  return new Promise((resolve, reject) => {
    let settled = false;
    let silenceTimer = null;
    let absoluteTimer = null;

    const cleanup = () => {
      if (silenceTimer) clearTimer(silenceTimer);
      if (absoluteTimer) clearTimer(absoluteTimer);
      child.stdout?.off?.("data", touch);
      child.stderr?.off?.("data", touch);
      child.off?.("error", onError);
      child.off?.("close", onClose);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const stop = (reason, timeoutMs) => {
      if (settled) return;
      const error = new CodexRunGuardError({ taskKey, reason, timeoutMs });
      settled = true;
      cleanup();
      try { terminate(child); } catch { /* final job state is still authoritative */ }
      reject(error);
    };
    const armSilenceTimer = () => {
      if (silenceTimer) clearTimer(silenceTimer);
      silenceTimer = setTimer(() => stop("silence_timeout", limits.silenceTimeoutMs), limits.silenceTimeoutMs);
    };
    const touch = () => armSilenceTimer();
    const onError = (error) => finish(reject, error);
    const onClose = (code) => finish(resolve, Number.isInteger(code) ? code : -1);

    child.stdout?.on?.("data", touch);
    child.stderr?.on?.("data", touch);
    child.once?.("error", onError);
    child.once?.("close", onClose);
    armSilenceTimer();
    absoluteTimer = setTimer(
      () => stop("absolute_timeout", limits.absoluteTimeoutMs),
      limits.absoluteTimeoutMs,
    );

    if (Number.isInteger(child.exitCode)) onClose(child.exitCode);
  });
}

function boundedOverride(rawValue, fallback, minimum, maximum) {
  if (rawValue == null || String(rawValue).trim() === "") return fallback;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

function defaultTerminate(child) {
  child?.kill?.("SIGTERM");
}
