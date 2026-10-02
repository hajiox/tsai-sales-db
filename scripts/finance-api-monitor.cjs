const path = require("node:path");
const os = require("node:os");
const { writeMonitorStateJson } = require("../tools/tsa-codex-bridge/monitor-state-file.cjs");

function createFinanceApiMonitor(options = {}) {
  const defaultDirectory = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Codex Bridge Monitor") : path.join(os.homedir(), ".codex-bridge-monitor");
  const file = options.path || path.join(process.env.CODEX_BRIDGE_MONITOR_DIR || defaultDirectory, "states", "tsa-finance-api.json");
  const now = () => new Date().toISOString();
  const state = { schemaVersion: 1, system: "tsa", systemLabel: "TSA", workerId: "tsa-finance-api", workerName: "TSA公式API取得",
    workerRole: "service", executionMode: "service", bridgeVersion: "finance-api-20261002", status: "idle", progress: 0,
    jobId: null, taskKey: null, taskLabel: "公式API取得", targets: [], currentStep: "API取得待機", summary: null,
    operatorWaitReason: null, startedAt: now(), lastResponseAt: null, heartbeatAt: now(), updatedAt: now(),
    estimatedEarliestAt: null, estimatedLatestAt: null, bridgePid: process.pid, codexPid: null,
    codexSessionCount: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0,
    browserToolCalls: 0, commandExecutions: 0, lastTerminal: null };
  let label = "公式API取得";
  function publish() {
    state.heartbeatAt = now(); state.updatedAt = state.heartbeatAt;
    try { writeMonitorStateJson(file, state); return true; }
    catch { return false; } // Monitor display failure never cancels a data job.
  }
  return { path: file, publish,
    transition(status, id, context = {}) {
      state.status = status === "stopped" ? "offline" : status;
      state.jobId = id;
      if (status === "running") {
        label = `${String(context.channel || "EC").slice(0, 40)} ${String(context.kind || "費用").slice(0, 40)} API取得`;
        state.taskLabel = label; state.taskKey = "official_api_acquisition";
        state.targets = context.channel ? [String(context.channel).slice(0, 80)] : [];
        state.startedAt = now(); state.currentStep = "公式API応答・精算原本を取得しています"; state.progress = 0;
      } else {
        state.taskKey = null; state.targets = []; state.progress = 0;
        state.currentStep = status === "stopped" ? "API取得worker停止" : "API取得待機";
      }
      return publish();
    },
    terminal(id, status) {
      const terminalStatus = ["completed", "waiting_for_user", "needs_review", "failed", "cancelled"].includes(status) ? status : "needs_review";
      state.lastResponseAt = now();
      state.lastTerminal = { jobId: id, taskLabel: label, status: terminalStatus,
        summary: terminalStatus === "completed" ? "公式API取得と保存を確認しました" : "取得履歴で確認結果・必要な操作を確認してください", finishedAt: state.lastResponseAt };
      return publish();
    },
  };
}
module.exports = { createFinanceApiMonitor };
