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
const claimMigration = read("supabase", "migrations", "20260825190000_recipe_sns_generation.sql");
const automationPage = read("app", "web-sales", "automation", "page.tsx");

const headlessSafeBlock = bridge.slice(
  bridge.indexOf("const HEADLESS_SAFE_TASK_KEYS"),
  bridge.indexOf("mkdirSync(LOG_DIR"),
);
for (const taskKey of [
  "connection_test",
  "ec_product_name_generate",
  "ec_catchcopy_generate",
  "recipe_sns_generate",
  "docscanner_fax_summary",
  "web_sales_analysis",
]) {
  assert.match(headlessSafeBlock, new RegExp(`"${taskKey}"`));
}
for (const browserTaskKey of [
  "web_sales_import",
  "ad_cost_import",
  "ec_profit_import",
  "ec_price_update",
  "ec_product_name_update",
  "ec_catchcopy_update",
]) {
  assert.doesNotMatch(headlessSafeBlock, new RegExp(`"${browserTaskKey}"`));
}

assert.match(bridge, /executionMode === "headless-prelogin"[\s\S]*HEADLESS_SAFE_TASK_KEYS\.has/);
assert.match(bridge, /chrome: config\.executionMode === "interactive"/);
assert.match(bridge, /desktopMonitor: config\.desktopMonitor/);
assert.match(bridge, /codexTaskKeys: config\.allowedTaskKeys/);
assert.match(bridge, /function runtimeSnapshot\(\) \{[\s\S]*workerId: config\.workerId,[\s\S]*executionMode: config\.executionMode/);
assert.match(bridge, /TSA_CODEX_BRIDGE_APP_DIR/);
assert.match(bridge, /TSA_CODEX_BRIDGE_MAINTENANCE_PATH/);

assert.match(installer, /workerId = \$headlessWorkerId/);
assert.match(installer, /"codex-run-guard\.mjs"/);
assert.match(installer, /executionMode = "headless-prelogin"/);
assert.match(installer, /desktopMonitor = \$false/);
assert.match(installer, /\$interactiveTaskName = "TSA Codex Bridge \(Interactive\)"/);
assert.match(installer, /New-ScheduledTaskTrigger -AtLogOn/);
assert.match(installer, /New-ScheduledTaskSettingsSet[\s\S]*-RestartCount 999[\s\S]*-MultipleInstances IgnoreNew/);
assert.match(installer, /Start-ScheduledTask -TaskName \$interactiveTaskName/);
assert.match(installer, /Start-ScheduledTask -TaskName \$taskName/);
assert.match(installer, /headless\\bridge-state\.json/);
assert.match(installer, /maintenanceObserved -eq \$maintenanceNonce/);
assert.match(installer, /function Get-TrustedHeadlessBridgeProcess/);
assert.match(installer, /\$lockPid -ne \$statePid/);
assert.match(installer, /\$headlessState\.executionMode -ne "headless-prelogin"/);
assert.match(installer, /Stop-ScheduledTask -TaskName \$preloginTaskName/);
assert.match(installer, /ログイン前Bridgeの監視タスクを安全に停止できませんでした/);
assert.match(installer, /Stop-ScheduledTask -TaskName \$interactiveTaskName/);
assert.match(installer, /対話Bridgeの監視タスクを安全に停止できませんでした/);
assert.ok(
  installer.indexOf("Stop-ScheduledTask -TaskName $interactiveTaskName")
    < installer.indexOf('Copy-Item -LiteralPath (Join-Path $sourceDir "bridge.mjs")'),
  "対話Bridgeの自動再起動を止めてからランタイムを置換する",
);
assert.match(installer, /function Resolve-WindowsAccountSid/);
assert.match(installer, /\$registeredTaskUserSid -eq \$windowsUserSid/);
assert.match(installer, /function Copy-WindowsPowerShellScript/);
assert.match(installer, /UTF8Encoding\]::new\(\$true\)/);
assert.match(installer, /Copy-WindowsPowerShellScript "register-prelogin-task\.ps1"/);

assert.match(launcher, /TSA_CODEX_BRIDGE_EXECUTION_MODE = "headless-prelogin"/);
assert.match(launcher, /TSA_CODEX_BRIDGE_MAINTENANCE_PATH/);
assert.match(launcher, /\$env:CODEX_HOME/);
assert.match(launcher, /Prepare-HeadlessWorkerStart/);
assert.match(launcher, /\$state\.currentJobId/);
assert.match(launcher, /\[string\]\$state\.workerId -ne \[string\]\$config\.workerId/);
assert.match(launcher, /Stop-Process -Id \$statePid -Force/);
assert.match(launcher, /already-running/);
assert.match(launcher, /removed stale state for reused PID/);
assert.match(launcher, /PRELOGIN START BLOCKED/);
assert.match(registration, /New-ScheduledTaskTrigger -AtStartup/);
assert.match(registration, /-LogonType S4U/);
assert.match(registration, /-RunLevel Limited/);
assert.doesNotMatch(registration, /password/i);

assert.match(claimMigration, /jobs\.task_key IN \([\s\S]*jsonb_array_elements_text\(COALESCE\(workers\.capabilities->'codexTaskKeys'/);
assert.match(automationPage, /worker\.capabilities\?\.chrome === true/);
assert.match(automationPage, /worker\.capabilities\?\.preLogin === true/);
assert.match(automationPage, /ログイン前処理/);

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

console.log("Pre-login Bridge checks passed.");
