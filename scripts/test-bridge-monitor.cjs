const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { writeMonitorStateJson } = require("../tools/tsa-codex-bridge/monitor-state-file.cjs");

if (process.platform !== "win32") {
  console.log("unified bridge monitor test skipped: Windows only");
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-bridge-unified-monitor-"));
const stateDirectory = path.join(tempDir, "states");
const monitorPath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge-monitor.ps1");
const monitorSource = fs.readFileSync(monitorPath, "utf8");
const bridgePath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge.mjs");
const bridgeSource = fs.readFileSync(bridgePath, "utf8");
const placementScriptPath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "monitor-window-placement.ps1");
const placementConfigPath = path.join(tempDir, "monitor.config.json");
const schemaPath = path.join(__dirname, "..", "tools", "tsa-codex-bridge", "bridge-monitor-state.schema.json");
const mutexName = `Local\\CodexBridgeUnifiedMonitorTest_${process.pid}`;
const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
  windowsHide: true,
});
let persistent = null;
let placementProbe = null;

fs.mkdirSync(stateDirectory, { recursive: true });
fs.writeFileSync(placementConfigPath, `${JSON.stringify({ preferredDisplayNumber: 1, offsetX: 12, offsetY: 18 })}\n`, "utf8");
const now = new Date();
const iso = now.toISOString();
const baseState = ({ system, systemLabel, workerId, workerName, executionMode = "interactive", status, taskLabel, currentStep, progress = 0 }) => ({
  schemaVersion: 1,
  system,
  systemLabel,
  workerId,
  workerName,
  executionMode,
  bridgeVersion: "test-1",
  status,
  progress,
  jobId: `${workerId}-job`,
  taskKey: "test_task",
  taskLabel,
  productName: "【ネット】日本語商品",
  targets: ["テスト対象"],
  currentStep,
  summary: "日本語JSONを正常に読めました",
  operatorWaitReason: status === "needs_review" ? "担当者の確認を待っています" : null,
  startedAt: iso,
  lastResponseAt: iso,
  heartbeatAt: iso,
  updatedAt: iso,
  estimatedEarliestAt: new Date(now.getTime() + 60_000).toISOString(),
  estimatedLatestAt: new Date(now.getTime() + 120_000).toISOString(),
  bridgePid: worker.pid,
  codexPid: null,
  lastTerminal: null,
});

function writeState(name, state) {
  fs.writeFileSync(path.join(stateDirectory, `${name}.json`), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function runMonitor(ackName) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", monitorPath,
    "-StateDirectory", stateDirectory,
    "-AckPath", path.join(tempDir, ackName),
    "-WindowPlacementScript", placementScriptPath,
    "-WindowConfigPath", placementConfigPath,
    "-MutexName", mutexName,
    "-PlainOutput",
    "-ExitAfterIterations", "1",
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return { output: result.stdout, ack: JSON.parse(fs.readFileSync(path.join(tempDir, ackName), "utf8")) };
}

try {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.deepEqual(schema.properties.system.enum, ["tsa", "tsg", "docscanner"]);
  assert.ok(schema.required.includes("heartbeatAt"));
  assert.match(monitorSource, /\$previousRenderedLines = @\(\)/);
  assert.match(monitorSource, /\$RenderKey -eq \$script:lastCursorKey/);
  assert.match(monitorSource, /\$previous\.text -ceq \$entry\.text/);
  assert.match(monitorSource, /\[Console\]::Write\(\$entry\.text\)/);
  assert.match(monitorSource, /ConvertTo-StableConsoleLine/);
  assert.doesNotMatch(monitorSource, /Write-Host \$text\.PadRight/);
  assert.match(monitorSource, /Test-Path -LiteralPath \$AckPath -PathType Leaf/);
  assert.match(monitorSource, /\$acknowledgement\.lastConfirmedAt/);
  assert.match(monitorSource, /\$recoveredPlacement = Get-CodexBridgeMonitorPlacement \$WindowConfigPath/);
  const processProbeSource = bridgeSource.slice(
    bridgeSource.indexOf("function isProcessRunning"),
    bridgeSource.indexOf("function releaseLock"),
  );
  assert.match(processProbeSource, /process\.kill\(pid, 0\)/);
  assert.doesNotMatch(processProbeSource, /tasklist|checked\.stdout/);
  assert.match(bridgeSource, /desktopMonitorUnverifiedCount < 3/);

  writeState("tsa-interactive", baseState({
    system: "tsa",
    systemLabel: "TSA",
    workerId: "tsa-office-01",
    workerName: "事務所PC",
    status: "running",
    progress: 62,
    taskLabel: "レシピSNS素材AI生成",
    currentStep: "Instagram画像を生成しています",
  }));
  writeState("tsa-prelogin", {
    ...baseState({
      system: "tsa",
      systemLabel: "TSA",
      workerId: "tsa-office-01-headless",
      workerName: "事務所PC（ログイン前）",
      executionMode: "headless-prelogin",
      status: "idle",
      taskLabel: null,
      currentStep: "次のジョブを待っています",
    }),
    jobId: null,
    taskKey: null,
    productName: null,
  });
  writeState("tsg-interactive", baseState({
    system: "tsg",
    systemLabel: "TSG",
    workerId: "tsg-office-01",
    workerName: "TSG事務所PC",
    status: "running",
    progress: 35,
    taskLabel: "掲示板投稿連携",
    currentStep: "投稿内容を検証しています token=secret123 https://secret.example/path?x=1",
  }));
  writeState("docscanner-service", baseState({
    system: "docscanner",
    systemLabel: "DocScanner",
    workerId: "docscanner-service-01",
    workerName: "DocScannerサービス",
    executionMode: "service",
    status: "needs_review",
    progress: 80,
    taskLabel: "書類分類",
    currentStep: "分類結果の確認を待っています",
  }));
  writeState("docscanner-offline", {
    ...baseState({
      system: "docscanner",
      systemLabel: "DocScanner",
      workerId: "docscanner-archive-01",
      workerName: "DocScanner旧Worker",
      executionMode: "service",
      status: "completed",
      progress: 100,
      taskLabel: "過去のOCR処理",
      currentStep: "完了しました",
    }),
    bridgePid: 2_147_483_000,
    lastTerminal: {
      jobId: "docscanner-completed-job",
      taskLabel: "過去のOCR処理",
      status: "completed",
      summary: "OCR処理を完了しました",
      finishedAt: iso,
    },
  });
  fs.writeFileSync(path.join(stateDirectory, "broken.json"), "{ invalid json", "utf8");

  const first = runMonitor("ack-first.json");
  assert.match(first.output, /Codex Bridge 統合モニター/);
  assert.match(first.output, /TSA/);
  assert.match(first.output, /事務所PC \[実行中 62%\] レシピSNS素材AI生成/);
  assert.match(first.output, /事務所PC（ログイン前） \[待機中 0%\]/);
  assert.match(first.output, /TSG/);
  assert.match(first.output, /TSG事務所PC \[実行中 35%\] 掲示板投稿連携/);
  assert.match(first.output, /token=\[REDACTED\] \[URL\]/);
  assert.doesNotMatch(first.output, /secret123|secret\.example/);
  assert.match(first.output, /DocScanner/);
  assert.match(first.output, /DocScannerサービス \[確認待ち 80%\] 書類分類/);
  assert.match(first.output, /DocScanner旧Worker \[オフライン 100%\] 過去のOCR処理/);
  assert.match(first.output, /直近: 過去のOCR処理 \/ 完了 \/ OCR処理を完了しました/);
  assert.match(first.output, /操作待ち: 担当者の確認を待っています/);
  assert.match(first.output, /状態読込エラー（Bridge本体の処理は継続）/);
  assert.match(first.output, /モニターを閉じてもBridgeジョブは停止しません/);
  assert.doesNotMatch(first.output, /繝|縺|蜿/);
  assert.equal(first.ack.monitorId, "codex-bridge-unified");
  assert.equal(first.ack.monitorVersion, 2);
  assert.equal(first.ack.windowPlacement.requested, true);
  assert.equal(first.ack.windowPlacement.displayNumber, 1);
  assert.match(first.ack.windowPlacement.deviceName, /^\\\\\.\\DISPLAY\d+$/i);
  assert.equal(first.ack.windowPlacement.applied, false, "PlainOutputテストでは実ウィンドウを移動しない");
  assert.doesNotThrow(() => process.kill(worker.pid, 0), "モニター終了でBridge相当プロセスを停止してはいけない");

  const staleTsg = baseState({
    system: "tsg",
    systemLabel: "TSG",
    workerId: "tsg-office-01",
    workerName: "TSG事務所PC",
    status: "running",
    progress: 35,
    taskLabel: "掲示板投稿連携",
    currentStep: "投稿内容を検証しています",
  });
  staleTsg.heartbeatAt = new Date(now.getTime() - 120_000).toISOString();
  staleTsg.updatedAt = staleTsg.heartbeatAt;
  writeState("tsg-interactive", staleTsg);

  const second = runMonitor("ack-second.json");
  assert.match(second.output, /TSG事務所PC \[応答停止 35%\]/);
  assert.equal(second.ack.monitorId, "codex-bridge-unified");
  assert.notEqual(second.ack.monitorPid, first.ack.monitorPid, "再起動時は状態ファイルから新しいモニターへ再接続する");
  assert.doesNotThrow(() => process.kill(worker.pid, 0), "再接続後もBridge相当プロセスを停止してはいけない");

  const placementStateDirectory = path.join(tempDir, "placement-states");
  const placementAckPath = path.join(tempDir, "ack-placement.json");
  fs.mkdirSync(placementStateDirectory, { recursive: true });
  fs.rmSync(placementConfigPath, { force: true });
  placementProbe = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", monitorPath,
    "-StateDirectory", placementStateDirectory,
    "-AckPath", placementAckPath,
    "-WindowPlacementScript", placementScriptPath,
    "-WindowConfigPath", placementConfigPath,
    "-MutexName", `${mutexName}_Placement`,
    "-PlainOutput",
    "-SkipForeground",
    "-RefreshMilliseconds", "100",
  ], {
    stdio: "ignore",
    windowsHide: true,
  });
  const ackDeadline = Date.now() + 10_000;
  while (!fs.existsSync(placementAckPath) && Date.now() < ackDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert.ok(fs.existsSync(placementAckPath), "配置確認用モニターが起動確認を書き込む");
  const ackBeforePlacementRecovery = JSON.parse(fs.readFileSync(placementAckPath, "utf8"));
  assert.equal(ackBeforePlacementRecovery.windowPlacement.requested, false, "設定未到着時は配置を推測しない");
  fs.writeFileSync(placementConfigPath, `${JSON.stringify({ preferredDisplayNumber: 1, offsetX: 12, offsetY: 18 })}\n`, "utf8");
  const placementRecoveryDeadline = Date.now() + 10_000;
  let placementRecovered = false;
  let placementRecoveryAck = null;
  while (!placementRecovered && Date.now() < placementRecoveryDeadline) {
    try {
      const candidateAck = JSON.parse(fs.readFileSync(placementAckPath, "utf8"));
      placementRecoveryAck = candidateAck;
      placementRecovered = candidateAck.windowPlacement?.requested === true;
    } catch { }
    if (!placementRecovered) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert.equal(
    placementRecovered,
    true,
    `起動後に到着した画面配置設定を自己適用する: ${JSON.stringify(placementRecoveryAck)}`,
  );
  placementProbe.kill();
  placementProbe = null;

  const persistentAckPath = path.join(tempDir, "ack-persistent.json");
  persistent = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", monitorPath,
    "-StateDirectory", stateDirectory,
    "-AckPath", persistentAckPath,
    "-WindowPlacementScript", placementScriptPath,
    "-WindowConfigPath", placementConfigPath,
    "-MutexName", mutexName,
    "-PlainOutput",
    "-SkipForeground",
    "-RefreshMilliseconds", "100",
    "-ReadHoldMilliseconds", "250",
  ], {
    stdio: "ignore",
    windowsHide: true,
  });
  const persistentAckDeadline = Date.now() + 10_000;
  while (!fs.existsSync(persistentAckPath) && Date.now() < persistentAckDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert.ok(fs.existsSync(persistentAckPath), "常駐モニターが起動確認を書き込む");
  const initialPersistentAck = JSON.parse(fs.readFileSync(persistentAckPath, "utf8"));
  fs.rmSync(persistentAckPath, { force: true });
  const ackRecoveryDeadline = Date.now() + 5_000;
  while (!fs.existsSync(persistentAckPath) && Date.now() < ackRecoveryDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert.ok(fs.existsSync(persistentAckPath), "常駐モニターが消失した起動確認を自己復元する");
  const recoveredPersistentAck = JSON.parse(fs.readFileSync(persistentAckPath, "utf8"));
  assert.equal(recoveredPersistentAck.monitorPid, initialPersistentAck.monitorPid, "ACK復元でモニターを重複起動しない");

  const statePath = path.join(stateDirectory, "tsa-interactive.json");
  const replaceDeadline = Date.now() + 2_500;
  let replacements = 0;
  let replacementRetries = 0;
  while (Date.now() < replaceDeadline) {
    const replacement = baseState({
      system: "tsa",
      systemLabel: "TSA",
      workerId: "tsa-office-01",
      workerName: "事務所PC",
      status: "running",
      progress: replacements % 101,
      taskLabel: "状態ファイル競合テスト",
      currentStep: `置換 ${replacements}`,
    });
    writeMonitorStateJson(statePath, replacement, {
      onRetry: () => { replacementRetries += 1; },
    });
    replacements += 1;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
  assert.ok(replacements >= 5, "モニター読込中もBridge状態を継続して原子的に置換できる");
  assert.ok(replacementRetries > 0, "Windowsの一時的な共有違反を上限付きリトライで回復する");

  const duplicateAckPath = path.join(tempDir, "ack-duplicate.json");
  const duplicate = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", monitorPath,
    "-StateDirectory", stateDirectory,
    "-AckPath", duplicateAckPath,
    "-MutexName", mutexName,
    "-PlainOutput",
    "-ExitAfterIterations", "1",
  ], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(fs.existsSync(duplicateAckPath), false, "同じWindowsセッションに2つ目のモニターを作らない");
  persistent.kill();
  const stopDeadline = Date.now() + 5_000;
  while (Date.now() < stopDeadline) {
    try {
      process.kill(persistent.pid, 0);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    } catch {
      break;
    }
  }
  assert.doesNotThrow(() => process.kill(worker.pid, 0), "統合モニターを閉じてもBridge相当プロセスは継続する");

  console.log("unified Bridge monitor runtime tests passed");
} finally {
  try { placementProbe?.kill(); } catch { }
  try { persistent?.kill(); } catch { }
  try { worker.kill(); } catch { }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
