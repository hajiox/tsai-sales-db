const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  console.log("bridge monitor test skipped: Windows only");
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsa-bridge-monitor-"));
const statePath = path.join(tempDir, "monitor-state.json");
const ackPath = path.join(tempDir, "monitor-ack.json");
const jobId = "utf8-monitor-test-job";
const monitorPath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge-monitor.ps1");
const now = new Date().toISOString();

try {
  fs.writeFileSync(statePath, `${JSON.stringify({
    jobId,
    taskKey: "recipe_sns_generate",
    taskLabel: "レシピSNS素材AI生成",
    productName: "【ネット】チャーシュー訳あり800ｇ",
    targets: ["instagram_story"],
    status: "completed",
    progress: 100,
    currentStep: "UTF-8状態を表示しています",
    summary: "日本語JSONを正常に読めました",
    startedAt: now,
    lastResponseAt: now,
    bridgePid: process.pid,
    codexPid: null,
    estimatedEarliestAt: null,
    estimatedLatestAt: null,
  }, null, 2)}\n`, "utf8");

  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", monitorPath,
    "-StatePath", statePath,
    "-JobId", jobId,
    "-AckPath", ackPath,
    "-ExitDelaySeconds", "0",
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /TSA Codex Bridge 実行モニター/);
  assert.match(result.stdout, /完了\s+100%/);
  assert.match(result.stdout, /処理\s+: レシピSNS素材AI生成/);
  assert.match(result.stdout, /対象\s+: 【ネット】チャーシュー訳あり800ｇ/);
  assert.match(result.stdout, /現在の工程 : UTF-8状態を表示しています/);
  assert.match(result.stdout, /直近の応答 : 日本語JSONを正常に読めました/);
  assert.doesNotMatch(result.stdout, /繝|縺|蜿/);

  const acknowledgement = JSON.parse(fs.readFileSync(ackPath, "utf8"));
  assert.equal(acknowledgement.jobId, jobId);
  assert.ok(Number.isInteger(acknowledgement.monitorPid));
  console.log("bridge monitor UTF-8 runtime test passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
