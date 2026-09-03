const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");
const launcher = read("tools", "tsa-codex-bridge", "start-bridge-prelogin.ps1");
const registration = read("tools", "tsa-codex-bridge", "register-prelogin-task.ps1");
const heartbeatRoute = read("app", "api", "web-sales", "codex-bridge", "heartbeat", "route.ts");
const claimRoute = read("app", "api", "web-sales", "codex-bridge", "claim", "route.ts");
const bridgeVersion = read("lib", "web-sales-codex", "bridge-version.ts");
const claimMigration = read("supabase", "migrations", "20260825190000_recipe_sns_generation.sql");
const automationPage = read("app", "web-sales", "automation", "page.tsx");
const skillContract = JSON.parse(read("tools", "tsa-codex-bridge", "skill-contract.json"));

const headlessSafeBlock = bridge.slice(
  bridge.indexOf("const HEADLESS_SAFE_TASK_KEYS"),
  bridge.indexOf("mkdirSync(LOG_DIR"),
);
const aiTasks = [
  "connection_test",
  "ec_product_name_generate",
  "ec_catchcopy_generate",
  "ec_product_content_generate",
  "ingredient_label_generate",
  "recipe_sns_generate",
  "docscanner_fax_summary",
];
const analysisTasks = ["connection_test", "web_sales_analysis"];
const interactiveTasks = [
  "connection_test",
  "web_sales_import",
  "ad_cost_import",
  "ec_profit_import",
  "ec_price_update",
  "ec_product_name_update",
  "ec_catchcopy_update",
  "ec_product_content_update",
  "recipe_sns_publish",
];

for (const taskKey of [...new Set([...aiTasks, ...analysisTasks])]) {
  assert.match(headlessSafeBlock, new RegExp(`"${taskKey}"`));
}
for (const taskKey of interactiveTasks.filter((key) => key !== "connection_test")) {
  assert.doesNotMatch(headlessSafeBlock, new RegExp(`"${taskKey}"`));
}
assert.deepEqual(
  [...new Set([...interactiveTasks, ...aiTasks, ...analysisTasks])].sort(),
  Object.keys(skillContract.tasks).sort(),
  "4体の能力分割でSkill契約の全タスクを処理できる",
);

assert.match(bridge, /config\.monitorWorkerKey/);
assert.match(bridge, /workerRole: config\.workerRole/);
assert.match(bridge, /executionMode === "headless-prelogin"[\s\S]*HEADLESS_SAFE_TASK_KEYS\.has/);
assert.match(bridge, /codexTaskKeys: config\.allowedTaskKeys/);
assert.match(bridge, /isolatedEphemeralSession: true/);
assert.match(bridge, /chatHistoryLoaded: false/);
assert.match(bridge, /class BridgeApiError extends Error/);
assert.match(bridge, /isBridgeUpgradeRequiredError/);
assert.match(bridge, /upgradeRequired[\s\S]*stopping = true/);
assert.match(bridge, /if \(!stopping\) await heartbeat\(\)\.catch/);
assert.match(bridgeVersion, /tsa-office-01-headless/);
assert.match(heartbeatRoute, /isRetiredLegacyTsaCodexBridge[\s\S]*retired: true/);
assert.match(claimRoute, /isRetiredLegacyTsaCodexBridge[\s\S]*job: null[\s\S]*retired: true/);

for (const [runtimeName, taskName, role, monitorKey] of [
  ["ai-01", "TSA Codex Bridge (AI 1)", "ai-generation", "tsa-ai-01"],
  ["ai-02", "TSA Codex Bridge (AI 2)", "ai-generation", "tsa-ai-02"],
  ["analysis-01", "TSA Codex Bridge (Analysis)", "analysis", "tsa-analysis-01"],
]) {
  assert.match(installer, new RegExp(`RuntimeName = "${runtimeName}"`));
  assert.match(installer, new RegExp(taskName.replace(/[()]/g, "\\$&")));
  assert.match(installer, new RegExp(`WorkerRole = "${role}"`));
  assert.match(installer, new RegExp(`MonitorWorkerKey = "${monitorKey}"`));
}
assert.match(installer, /allowedTaskKeys = \$interactiveTaskKeys/);
assert.match(installer, /allowedTaskKeys = \$workerSpec\.TaskKeys/);
assert.match(installer, /four worker heartbeats confirmed/);
assert.match(installer, /\$legacyPreloginTaskExists[\s\S]*Unregister-ScheduledTask -TaskName '\$escapedLegacyTaskName'/);
assert.match(installer, /legacyUnifiedMonitorStatePath[\s\S]*Remove-Item -LiteralPath \$legacyUnifiedMonitorStatePath/);
assert.match(installer, /maintenanceObserved -eq \$maintenanceNonce/);
assert.match(installer, /function Get-TrustedHeadlessBridgeProcesses/);
assert.match(installer, /Stop-ScheduledTask -TaskName \$headlessTaskName/);
assert.match(installer, /Disable-ScheduledTask -TaskName \$interactiveTaskName/);
assert.match(installer, /Enable-ScheduledTask -TaskName \$interactiveTaskName/);
assert.match(installer, /function Copy-WindowsPowerShellScript/);
assert.match(installer, /UTF8Encoding\]::new\(\$true\)/);

assert.match(launcher, /ValidatePattern\("\^\[a-z0-9\]/);
assert.match(launcher, /Join-Path \(Join-Path \$installDir "workers"\) \$RuntimeName/);
assert.match(launcher, /TSA_CODEX_BRIDGE_EXECUTION_MODE = "headless-prelogin"/);
assert.match(launcher, /TSA_CODEX_BRIDGE_MAINTENANCE_PATH/);
assert.match(launcher, /Prepare-HeadlessWorkerStart/);
assert.match(launcher, /\$state\.currentJobId/);
assert.match(launcher, /\[string\]\$state\.workerId -ne \[string\]\$config\.workerId/);
assert.match(launcher, /already-running/);
assert.match(launcher, /removed stale state for reused PID/);
assert.match(registration, /-RuntimeName \$RuntimeName/);
assert.match(registration, /New-ScheduledTaskTrigger -AtStartup/);
assert.match(registration, /-LogonType S4U/);
assert.match(registration, /-RunLevel Limited/);
assert.doesNotMatch(registration, /password/i);

assert.match(claimMigration, /FOR UPDATE SKIP LOCKED/i);
assert.match(claimMigration, /jsonb_array_elements_text\(COALESCE\(workers\.capabilities->'codexTaskKeys'/);
assert.match(automationPage, /worker\.capabilities\?\.workerRole === "ai-generation"/);
assert.match(automationPage, /worker\.capabilities\?\.workerRole === "analysis"/);
assert.match(automationPage, /事務所PC Bridge 4体/);

if (process.platform === "win32") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsa-bridge-prelogin-"));
  try {
    for (const [name, source] of [
      ["install-bridge.ps1", installer],
      ["register-prelogin-task.ps1", registration],
      ["start-bridge-prelogin.ps1", launcher],
    ]) {
      const scriptPath = path.join(tempDir, name);
      fs.writeFileSync(scriptPath, `\uFEFF${source.replace(/^\uFEFF/, "")}`, "utf8");
      const escapedPath = scriptPath.replaceAll("'", "''");
      const parsed = childProcess.spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", `$tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$tokens, [ref]$errors); if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`],
        { encoding: "utf8" },
      );
      assert.equal(parsed.status, 0, `${name}: ${parsed.stderr || parsed.stdout}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("Four-worker pre-login Bridge checks passed.");
