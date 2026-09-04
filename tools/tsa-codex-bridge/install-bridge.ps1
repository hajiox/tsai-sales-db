param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$BaseUrl = "https://v0-tsa-19.vercel.app",
  [string]$WorkerId = "tsa-office-01",
  [string]$WorkerName = "事務所PC",
  [string]$Workspace = "C:\作業用",
  [string]$DocScannerFaxSummaryRoot = "C:\作業用\doc-scanner\data\codex-bridge\fax-summary",
  [string]$DocScannerBaseUrl = "http://127.0.0.1:3004",
  [ValidateSet("low", "medium", "high", "xhigh")][string]$ReasoningEffort = "low",
  [switch]$SkipPreloginTaskRegistration
)

$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "TSA Codex Bridge"
$requiredSourceFiles = @(
  "bridge.mjs",
  "codex-run-guard.mjs",
  "download-artifact-recovery.mjs",
  "ec-profit-artifact-policy.mjs",
  "qoo10-official-sales.mjs",
  "recipe-sns-publish-policy.mjs",
  "monitor-state-file.cjs",
  "skill-contract.json",
  "result.schema.json",
  "analysis-result.schema.json",
  "ec-price-result.schema.json",
  "ec-price-plan.schema.json",
  "ec-product-register-result.schema.json",
  "ec-product-register-plan.schema.json",
  "ec-product-name-result.schema.json",
  "ec-product-name-plan.schema.json",
  "ec-product-name-ai.schema.json",
  "ec-catchcopy-result.schema.json",
  "ec-catchcopy-plan.schema.json",
  "ec-catchcopy-ai.schema.json",
  "ec-product-content-result.schema.json",
  "ec-product-content-plan.schema.json",
  "ec-product-content-ai.schema.json",
  "ingredient-label-ai.schema.json",
  "fax-summary-result.schema.json",
  "recipe-sns-result.schema.json",
  "recipe-sns-target-result.schema.json",
  "recipe-sns-publish-result.schema.json",
  "render-recipe-sns-image.ps1",
  "amazon-business-report-download.ps1",
  "bridge-monitor.ps1",
  "launch-bridge-monitor.ps1",
  "monitor-window-placement.ps1",
  "bridge-monitor-state.schema.json",
  "start-bridge.ps1",
  "start-bridge-prelogin.ps1",
  "register-prelogin-task.ps1"
)
foreach ($sourceFile in $requiredSourceFiles) {
  $sourcePath = Join-Path $sourceDir $sourceFile
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Bridgeの必須ファイルがありません: $sourcePath"
  }
}
$bridgeSourceText = Get-Content -LiteralPath (Join-Path $sourceDir "bridge.mjs") -Raw
$bridgeVersionMatch = [regex]::Match($bridgeSourceText, 'const VERSION = "([^"]+)";')
if (-not $bridgeVersionMatch.Success) {
  throw "Bridgeバージョンを確認できません。"
}
$expectedBridgeVersion = $bridgeVersionMatch.Groups[1].Value
$skillContractPath = Join-Path $sourceDir "skill-contract.json"
$skillContract = Get-Content -LiteralPath $skillContractPath -Raw | ConvertFrom-Json
$bridgeSkillNames = @($skillContract.tasks.PSObject.Properties.Value | ForEach-Object { $_.skill } | Where-Object { $_ } | Select-Object -Unique)
$allTaskKeys = @($skillContract.tasks.PSObject.Properties.Name)
if (-not $skillContract.version -or $bridgeSkillNames.Count -eq 0 -or $allTaskKeys.Count -eq 0) {
  throw "Bridge Skill契約が正しくありません: $skillContractPath"
}
foreach ($skillName in $bridgeSkillNames) {
  $skillSource = Join-Path $sourceDir "skills\$skillName"
  if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
    throw "Bridge同梱Skillがありません: $skillSource"
  }
}

$interactiveTaskKeys = @(
  "connection_test",
  "web_sales_import",
  "ad_cost_import",
  "ec_profit_import",
  "ec_price_update",
  "ec_product_register",
  "ec_product_name_update",
  "ec_catchcopy_update",
  "ec_product_content_update",
  "recipe_sns_publish"
)
$aiTaskKeys = @(
  "connection_test",
  "ec_product_name_generate",
  "ec_catchcopy_generate",
  "ec_product_content_generate",
  "ingredient_label_generate",
  "recipe_sns_generate",
  "docscanner_fax_summary"
)
$analysisTaskKeys = @("connection_test", "web_sales_analysis")
$headlessWorkerSpecs = @(
  [pscustomobject]@{
    RuntimeName = "ai-01"
    TaskName = "TSA Codex Bridge (AI 1)"
    WorkerIdSuffix = "ai-01"
    WorkerNameSuffix = "AI生成1"
    WorkerRole = "ai-generation"
    MonitorWorkerKey = "tsa-ai-01"
    TaskKeys = $aiTaskKeys
  },
  [pscustomobject]@{
    RuntimeName = "ai-02"
    TaskName = "TSA Codex Bridge (AI 2)"
    WorkerIdSuffix = "ai-02"
    WorkerNameSuffix = "AI生成2"
    WorkerRole = "ai-generation"
    MonitorWorkerKey = "tsa-ai-02"
    TaskKeys = $aiTaskKeys
  },
  [pscustomobject]@{
    RuntimeName = "analysis-01"
    TaskName = "TSA Codex Bridge (Analysis)"
    WorkerIdSuffix = "analysis-01"
    WorkerNameSuffix = "分析"
    WorkerRole = "analysis"
    MonitorWorkerKey = "tsa-analysis-01"
    TaskKeys = $analysisTaskKeys
  }
)
$configuredTaskKeys = @($interactiveTaskKeys + $aiTaskKeys + $analysisTaskKeys | Select-Object -Unique)
$missingTaskKeys = @($allTaskKeys | Where-Object { $configuredTaskKeys -notcontains $_ })
$unknownTaskKeys = @($configuredTaskKeys | Where-Object { $allTaskKeys -notcontains $_ })
if ($missingTaskKeys.Count -gt 0 -or $unknownTaskKeys.Count -gt 0) {
  throw "4体Bridgeの担当タスク定義がSkill契約と一致しません。missing=$($missingTaskKeys -join ',') unknown=$($unknownTaskKeys -join ',')"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "logs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "jobs") -Force | Out-Null
foreach ($workerSpec in $headlessWorkerSpecs) {
  $workerRuntimeDir = Join-Path (Join-Path $installDir "workers") $workerSpec.RuntimeName
  New-Item -ItemType Directory -Path (Join-Path $workerRuntimeDir "logs") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $workerRuntimeDir "jobs") -Force | Out-Null
}
$unifiedMonitorDir = Join-Path $env:LOCALAPPDATA "Codex Bridge Monitor"
$unifiedMonitorStateDir = Join-Path $unifiedMonitorDir "states"
New-Item -ItemType Directory -Path $unifiedMonitorDir -Force | Out-Null
New-Item -ItemType Directory -Path $unifiedMonitorStateDir -Force | Out-Null

$startScriptPath = Join-Path $installDir "start-bridge.ps1"
$headlessStartScriptPath = Join-Path $installDir "start-bridge-prelogin.ps1"
$bridgePath = Join-Path $installDir "bridge.mjs"
$monitorPath = Join-Path $installDir "bridge-monitor.ps1"
$monitorLauncherPath = Join-Path $installDir "launch-bridge-monitor.ps1"
$unifiedMonitorPath = Join-Path $unifiedMonitorDir "bridge-monitor.ps1"
$unifiedMonitorLauncherPath = Join-Path $unifiedMonitorDir "launch-bridge-monitor.ps1"
$unifiedMonitorAckPath = Join-Path $unifiedMonitorDir "monitor-ack.json"
$legacyUnifiedMonitorStatePath = Join-Path $unifiedMonitorStateDir "tsa-prelogin.json"
$legacyMonitorAckPath = Join-Path $installDir "monitor-ack.json"
$maintenancePath = Join-Path $installDir "bridge-maintenance.lock"
$statePath = Join-Path $installDir "bridge-state.json"
$interactiveTaskName = "TSA Codex Bridge (Interactive)"
$legacyPreloginTaskName = "TSA Codex Bridge (Pre-login)"
$legacyHeadlessStatePath = Join-Path $installDir "headless\bridge-state.json"
$legacyHeadlessLockPath = Join-Path $installDir "headless\bridge.lock"
$statePaths = @($statePath, $legacyHeadlessStatePath) + @($headlessWorkerSpecs | ForEach-Object {
  Join-Path (Join-Path (Join-Path $installDir "workers") $_.RuntimeName) "bridge-state.json"
})
function Get-TrustedHeadlessBridgeProcesses {
  $trusted = @()
  $runtimeCandidates = @(
    [pscustomobject]@{
      StatePath = $legacyHeadlessStatePath
      LockPath = $legacyHeadlessLockPath
      AllowMissingLock = $true
    }
  ) + @($headlessWorkerSpecs | ForEach-Object {
    $runtimeDir = Join-Path (Join-Path $installDir "workers") $_.RuntimeName
    [pscustomobject]@{
      StatePath = Join-Path $runtimeDir "bridge-state.json"
      LockPath = Join-Path $runtimeDir "bridge.lock"
      AllowMissingLock = $false
    }
  })
  foreach ($runtime in $runtimeCandidates) {
    if (-not (Test-Path -LiteralPath $runtime.StatePath -PathType Leaf)) { continue }
    $lockExists = Test-Path -LiteralPath $runtime.LockPath -PathType Leaf
    if (-not $lockExists -and -not $runtime.AllowMissingLock) { continue }
    try {
      $headlessState = Get-Content -LiteralPath $runtime.StatePath -Raw | ConvertFrom-Json
      $statePid = [int]$headlessState.pid
      $lockPid = if ($lockExists) { [int](Get-Content -LiteralPath $runtime.LockPath -Raw) } else { $statePid }
      $updatedAt = [DateTimeOffset]::Parse([string]$headlessState.updatedAt).UtcDateTime
      if (
        $statePid -le 0 -or
        $lockPid -ne $statePid -or
        $headlessState.executionMode -ne "headless-prelogin" -or
        $updatedAt -lt (Get-Date).ToUniversalTime().AddMinutes(-2)
      ) { continue }
      $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $statePid" -ErrorAction SilentlyContinue
      if ($candidate -and $candidate.Name -eq "node.exe") { $trusted += $candidate }
    } catch {
      # A partial advisory state is ignored; command-line discovery remains active.
    }
  }
  return @($trusted)
}
function Get-BridgeProcesses {
  $processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine.IndexOf($startScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine.IndexOf($headlessStartScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine.IndexOf($bridgePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )
  })
  foreach ($trustedHeadless in @(Get-TrustedHeadlessBridgeProcesses)) {
    if (@($processes | Where-Object { [int]$_.ProcessId -eq [int]$trustedHeadless.ProcessId }).Count -eq 0) {
      $processes += $trustedHeadless
    }
  }
  return @($processes)
}
function Stop-VerifiedMonitor([string]$AckPath, [string[]]$AllowedScripts) {
  if (-not (Test-Path -LiteralPath $AckPath)) { return }
  try {
    $utf8 = [System.Text.UTF8Encoding]::new($false, $true)
    $acknowledgement = [System.IO.File]::ReadAllText($AckPath, $utf8) | ConvertFrom-Json -ErrorAction Stop
    $monitorPid = [int]$acknowledgement.monitorPid
    $monitorProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $monitorPid" -ErrorAction SilentlyContinue
    if ($monitorProcess -and $monitorProcess.CommandLine) {
      $matchesAllowedScript = @($AllowedScripts | Where-Object {
        $monitorProcess.CommandLine.IndexOf($_, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      }).Count -gt 0
      if ($matchesAllowedScript) {
        Stop-Process -Id $monitorPid -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # A stale or partial acknowledgement is removed below without touching a process.
  }
  Remove-Item -LiteralPath $AckPath -Force -ErrorAction SilentlyContinue
}
function Copy-WindowsPowerShellScript([string]$SourceName, [string]$DestinationPath) {
  $sourcePath = Join-Path $sourceDir $SourceName
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $scriptText = [System.IO.File]::ReadAllText($sourcePath, $strictUtf8)
  [System.IO.File]::WriteAllText($DestinationPath, $scriptText, [System.Text.UTF8Encoding]::new($true))
}
function Resolve-WindowsAccountSid([string]$AccountName) {
  if ([string]::IsNullOrWhiteSpace($AccountName)) { return $null }
  try {
    $account = [System.Security.Principal.NTAccount]::new($AccountName)
    return $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
  } catch {
    return $null
  }
}
$maintenanceNonce = [guid]::NewGuid().ToString("N")
[System.IO.File]::WriteAllText($maintenancePath, $maintenanceNonce, [System.Text.UTF8Encoding]::new($false))
$interactiveTaskDisabledForMaintenance = $false

try {
  $allProcesses = @(Get-CimInstance Win32_Process)
  $bridgeProcesses = @(Get-BridgeProcesses)
  if ($bridgeProcesses.Count -gt 0) {
    $acknowledgedNodeIds = @()
    $activeBridgeNodeIds = @($bridgeProcesses | Where-Object { $_.Name -eq "node.exe" } | ForEach-Object { [int]$_.ProcessId })
    if ($activeBridgeNodeIds.Count -gt 0) {
      $maintenanceAcknowledged = $false
      $acknowledgedNodeIds = @()
      $ackDeadline = (Get-Date).AddSeconds(30)
      while ((Get-Date) -lt $ackDeadline) {
        $acknowledgedNodeIds = @()
        foreach ($candidateStatePath in $statePaths) {
          if (-not (Test-Path -LiteralPath $candidateStatePath)) { continue }
          try {
            $candidateState = Get-Content -LiteralPath $candidateStatePath -Raw | ConvertFrom-Json
            $candidatePid = [int]$candidateState.pid
            if (
              $activeBridgeNodeIds -contains $candidatePid -and
              $candidateState.maintenanceObserved -eq $maintenanceNonce -and
              -not $candidateState.currentJobId
            ) {
              $acknowledgedNodeIds += $candidatePid
            }
          } catch {
            # The bridge may be replacing the small state file; retry a fresh read.
          }
        }
        $unacknowledgedNodeIds = @($activeBridgeNodeIds | Where-Object { $acknowledgedNodeIds -notcontains $_ })
        if ($unacknowledgedNodeIds.Count -eq 0) {
          $maintenanceAcknowledged = $true
          break
        }
        Start-Sleep -Milliseconds 250
      }
      if (-not $maintenanceAcknowledged) {
        throw "全Bridgeが停止準備を確認できません。実行中タスクの完了後に再実行してください。"
      }
    }

    $allProcesses = @(Get-CimInstance Win32_Process)
    $bridgeProcesses = @(Get-BridgeProcesses)
    $bridgeIds = @($bridgeProcesses | ForEach-Object { [int]$_.ProcessId })
    foreach ($acknowledgedNodeId in $acknowledgedNodeIds) {
      if ($bridgeIds -notcontains [int]$acknowledgedNodeId) {
        throw "停止準備を確認したBridgeプロセスが一致しません。再実行してください。"
      }
    }
    $descendantIds = @()
    $frontier = @($bridgeIds)
    while ($frontier.Count -gt 0) {
      $children = @($allProcesses | Where-Object {
        $frontier -contains [int]$_.ParentProcessId -and
        $bridgeIds -notcontains [int]$_.ProcessId -and
        $descendantIds -notcontains [int]$_.ProcessId -and
        $_.Name -ne "conhost.exe" -and
        (-not $_.CommandLine -or (
          $_.CommandLine.IndexOf($monitorPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -and
          $_.CommandLine.IndexOf($monitorLauncherPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -and
          $_.CommandLine.IndexOf($unifiedMonitorPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0 -and
          $_.CommandLine.IndexOf($unifiedMonitorLauncherPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0
        ))
      })
      if ($children.Count -eq 0) { break }
      $newIds = @($children | ForEach-Object { [int]$_.ProcessId })
      $descendantIds += $newIds
      $frontier = $newIds
    }
    if ($descendantIds.Count -gt 0) {
      throw "Bridge配下のCodex処理が残っています。処理完了後に再実行してください。"
    }
  }

  $interactiveTask = Get-ScheduledTask -TaskName $interactiveTaskName -ErrorAction SilentlyContinue
  $interactiveTaskWasRunning = $interactiveTask -and $interactiveTask.State -eq "Running"
  if ($interactiveTask) {
    Disable-ScheduledTask -TaskName $interactiveTaskName -ErrorAction Stop | Out-Null
    $interactiveTaskDisabledForMaintenance = $true
    $interactiveTask = Get-ScheduledTask -TaskName $interactiveTaskName -ErrorAction SilentlyContinue
  }
  if ($interactiveTaskWasRunning) {
    Stop-ScheduledTask -TaskName $interactiveTaskName -ErrorAction Stop
    $interactiveTaskStopDeadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $interactiveTaskStopDeadline) {
      $interactiveTask = Get-ScheduledTask -TaskName $interactiveTaskName -ErrorAction SilentlyContinue
      if (-not $interactiveTask -or $interactiveTask.State -ne "Running") { break }
      Start-Sleep -Milliseconds 250
    }
    if ($interactiveTask -and $interactiveTask.State -eq "Running") {
      throw "対話Bridgeの監視タスクを安全に停止できませんでした。"
    }
  }

  $headlessTaskNames = @($headlessWorkerSpecs | ForEach-Object { $_.TaskName }) + @($legacyPreloginTaskName)
  foreach ($headlessTaskName in $headlessTaskNames) {
    $headlessTask = Get-ScheduledTask -TaskName $headlessTaskName -ErrorAction SilentlyContinue
    if ($headlessTask -and $headlessTask.State -eq "Running") {
      Stop-ScheduledTask -TaskName $headlessTaskName -ErrorAction Stop
      $taskStopDeadline = (Get-Date).AddSeconds(10)
      while ((Get-Date) -lt $taskStopDeadline) {
        $headlessTask = Get-ScheduledTask -TaskName $headlessTaskName -ErrorAction SilentlyContinue
        if (-not $headlessTask -or $headlessTask.State -ne "Running") { break }
        Start-Sleep -Milliseconds 250
      }
      if ($headlessTask -and $headlessTask.State -eq "Running") {
        throw "ログイン前Bridgeの監視タスクを安全に停止できませんでした: $headlessTaskName"
      }
    }
  }

  foreach ($process in @($bridgeProcesses | Sort-Object { if ($_.Name -like "powershell*") { 0 } else { 1 } })) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  if ($bridgeProcesses.Count -gt 0) { Start-Sleep -Seconds 2 }
  $remainingBridgeProcesses = @(Get-BridgeProcesses)
  if ($remainingBridgeProcesses.Count -gt 0) {
    throw "既存Bridgeを安全に停止できませんでした。"
  }
  Stop-VerifiedMonitor -AckPath $legacyMonitorAckPath -AllowedScripts @($monitorPath)
  Stop-VerifiedMonitor -AckPath $unifiedMonitorAckPath -AllowedScripts @(
    $unifiedMonitorPath,
    $monitorPath,
    (Join-Path $sourceDir "bridge-monitor.ps1")
  )
  $lockPath = Join-Path $installDir "bridge.lock"
  if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
  $workerLockPaths = @($legacyHeadlessLockPath) + @($headlessWorkerSpecs | ForEach-Object {
    Join-Path (Join-Path (Join-Path $installDir "workers") $_.RuntimeName) "bridge.lock"
  })
  foreach ($workerLockPath in $workerLockPaths) {
    if (Test-Path -LiteralPath $workerLockPath) { Remove-Item -LiteralPath $workerLockPath -Force }
  }
  foreach ($candidateStatePath in $statePaths) {
    if (Test-Path -LiteralPath $candidateStatePath) { Remove-Item -LiteralPath $candidateStatePath -Force }
  }
  if (Test-Path -LiteralPath $legacyUnifiedMonitorStatePath -PathType Leaf) {
    Remove-Item -LiteralPath $legacyUnifiedMonitorStatePath -Force
  }

Copy-Item -LiteralPath (Join-Path $sourceDir "bridge.mjs") -Destination (Join-Path $installDir "bridge.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "codex-run-guard.mjs") -Destination (Join-Path $installDir "codex-run-guard.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "download-artifact-recovery.mjs") -Destination (Join-Path $installDir "download-artifact-recovery.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-profit-artifact-policy.mjs") -Destination (Join-Path $installDir "ec-profit-artifact-policy.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "qoo10-official-sales.mjs") -Destination (Join-Path $installDir "qoo10-official-sales.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "recipe-sns-publish-policy.mjs") -Destination (Join-Path $installDir "recipe-sns-publish-policy.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "monitor-state-file.cjs") -Destination (Join-Path $installDir "monitor-state-file.cjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "skill-contract.json") -Destination (Join-Path $installDir "skill-contract.json") -Force
Copy-WindowsPowerShellScript "bridge-monitor.ps1" (Join-Path $installDir "bridge-monitor.ps1")
Copy-WindowsPowerShellScript "launch-bridge-monitor.ps1" (Join-Path $installDir "launch-bridge-monitor.ps1")
Copy-WindowsPowerShellScript "monitor-window-placement.ps1" (Join-Path $installDir "monitor-window-placement.ps1")
Copy-Item -LiteralPath (Join-Path $sourceDir "bridge-monitor-state.schema.json") -Destination (Join-Path $installDir "bridge-monitor-state.schema.json") -Force
Copy-WindowsPowerShellScript "bridge-monitor.ps1" $unifiedMonitorPath
Copy-WindowsPowerShellScript "launch-bridge-monitor.ps1" $unifiedMonitorLauncherPath
Copy-WindowsPowerShellScript "monitor-window-placement.ps1" (Join-Path $unifiedMonitorDir "monitor-window-placement.ps1")
Copy-Item -LiteralPath (Join-Path $sourceDir "bridge-monitor-state.schema.json") -Destination (Join-Path $unifiedMonitorDir "bridge-monitor-state.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "result.schema.json") -Destination (Join-Path $installDir "result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "analysis-result.schema.json") -Destination (Join-Path $installDir "analysis-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-price-result.schema.json") -Destination (Join-Path $installDir "ec-price-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-price-plan.schema.json") -Destination (Join-Path $installDir "ec-price-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-register-result.schema.json") -Destination (Join-Path $installDir "ec-product-register-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-register-plan.schema.json") -Destination (Join-Path $installDir "ec-product-register-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-result.schema.json") -Destination (Join-Path $installDir "ec-product-name-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-plan.schema.json") -Destination (Join-Path $installDir "ec-product-name-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-ai.schema.json") -Destination (Join-Path $installDir "ec-product-name-ai.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-catchcopy-result.schema.json") -Destination (Join-Path $installDir "ec-catchcopy-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-catchcopy-plan.schema.json") -Destination (Join-Path $installDir "ec-catchcopy-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-catchcopy-ai.schema.json") -Destination (Join-Path $installDir "ec-catchcopy-ai.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-content-result.schema.json") -Destination (Join-Path $installDir "ec-product-content-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-content-plan.schema.json") -Destination (Join-Path $installDir "ec-product-content-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-content-ai.schema.json") -Destination (Join-Path $installDir "ec-product-content-ai.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ingredient-label-ai.schema.json") -Destination (Join-Path $installDir "ingredient-label-ai.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "fax-summary-result.schema.json") -Destination (Join-Path $installDir "fax-summary-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "recipe-sns-result.schema.json") -Destination (Join-Path $installDir "recipe-sns-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "recipe-sns-target-result.schema.json") -Destination (Join-Path $installDir "recipe-sns-target-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "recipe-sns-publish-result.schema.json") -Destination (Join-Path $installDir "recipe-sns-publish-result.schema.json") -Force
Copy-WindowsPowerShellScript "render-recipe-sns-image.ps1" (Join-Path $installDir "render-recipe-sns-image.ps1")
Copy-WindowsPowerShellScript "amazon-business-report-download.ps1" (Join-Path $installDir "amazon-business-report-download.ps1")
Copy-WindowsPowerShellScript "start-bridge.ps1" (Join-Path $installDir "start-bridge.ps1")
Copy-WindowsPowerShellScript "start-bridge-prelogin.ps1" (Join-Path $installDir "start-bridge-prelogin.ps1")
Copy-WindowsPowerShellScript "register-prelogin-task.ps1" (Join-Path $installDir "register-prelogin-task.ps1")

foreach ($skillName in $bridgeSkillNames) {
  $skillSource = Join-Path $sourceDir "skills\$skillName"
  $skillRoot = Join-Path (Join-Path $env:USERPROFILE ".codex\skills") $skillName
  New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $skillSource "*") -Destination $skillRoot -Recurse -Force
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$windowsIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$windowsUserId = $windowsIdentity.Name
$windowsUserSid = $windowsIdentity.User.Value
$monitorPlacementBase64 = ""
$monitorConfigPath = Join-Path $unifiedMonitorDir "monitor.config.json"
if (Test-Path -LiteralPath $monitorConfigPath -PathType Leaf) {
  try {
    . (Join-Path $sourceDir "monitor-window-placement.ps1")
    $resolvedMonitorPlacement = Get-CodexBridgeMonitorPlacement $monitorConfigPath
    if ($resolvedMonitorPlacement) {
      $placementJson = $resolvedMonitorPlacement | ConvertTo-Json -Depth 3 -Compress
      $monitorPlacementBase64 = [Convert]::ToBase64String([System.Text.UTF8Encoding]::new($false).GetBytes($placementJson))
    }
  } catch {
    $monitorPlacementBase64 = ""
  }
}
$config = @{
  baseUrl = $BaseUrl
  token = $Token
  workerId = $WorkerId
  workerName = $WorkerName
  workspace = $Workspace
  jobRoot = (Join-Path $installDir "jobs")
  downloadsDir = (Join-Path $env:USERPROFILE "Downloads")
  codexHome = (Join-Path $env:USERPROFILE ".codex")
  docScannerFaxSummaryRoot = $DocScannerFaxSummaryRoot
  docScannerBaseUrl = $DocScannerBaseUrl
  reasoningEffort = $ReasoningEffort
  pollMs = 5000
  executionMode = "interactive"
  workerRole = "interactive"
  monitorWorkerKey = "tsa-interactive"
  desktopMonitor = $true
  monitorPlacementBase64 = $monitorPlacementBase64
  allowedTaskKeys = $interactiveTaskKeys
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $installDir "bridge.config.json"), $config, [System.Text.UTF8Encoding]::new($false))
foreach ($workerSpec in $headlessWorkerSpecs) {
  $workerIdValue = "$WorkerId-$($workerSpec.WorkerIdSuffix)"
  if ($workerIdValue.Length -gt 80) {
    $workerIdValue = "$($WorkerId.Substring(0, 80 - $workerSpec.WorkerIdSuffix.Length - 1))-$($workerSpec.WorkerIdSuffix)"
  }
  $workerRuntimeDir = Join-Path (Join-Path $installDir "workers") $workerSpec.RuntimeName
  $headlessConfig = @{
    baseUrl = $BaseUrl
    token = $Token
    workerId = $workerIdValue
    workerName = "$WorkerName $($workerSpec.WorkerNameSuffix)"
    workerRole = $workerSpec.WorkerRole
    monitorWorkerKey = $workerSpec.MonitorWorkerKey
    workspace = $Workspace
    jobRoot = (Join-Path $workerRuntimeDir "jobs")
    downloadsDir = (Join-Path $userProfile "Downloads")
    codexHome = (Join-Path $userProfile ".codex")
    docScannerFaxSummaryRoot = $DocScannerFaxSummaryRoot
    docScannerBaseUrl = $DocScannerBaseUrl
    reasoningEffort = $ReasoningEffort
    pollMs = 5000
    executionMode = "headless-prelogin"
    desktopMonitor = $false
    allowedTaskKeys = $workerSpec.TaskKeys
    userProfile = $userProfile
    localAppData = $localAppData
    nodePath = $nodePath
    windowsUserId = $windowsUserId
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $workerRuntimeDir "bridge.config.json"), $headlessConfig, [System.Text.UTF8Encoding]::new($false))
}

$startScript = Join-Path $installDir "start-bridge.ps1"
$startArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
$interactiveTaskRegistered = $false
$interactiveTaskRegistrationError = ""
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
try {
  $interactiveAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $startArguments
  $interactiveTrigger = New-ScheduledTaskTrigger -AtLogOn -User $windowsUserId
  $interactiveRecoveryTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
  $interactivePrincipal = New-ScheduledTaskPrincipal -UserId $windowsUserId -LogonType Interactive -RunLevel Limited
  $interactiveSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
  $interactiveTask = New-ScheduledTask `
    -Action $interactiveAction `
    -Trigger @($interactiveTrigger, $interactiveRecoveryTrigger) `
    -Principal $interactivePrincipal `
    -Settings $interactiveSettings `
    -Description "Keeps the signed-in TSA Codex Bridge worker running and restarts its supervisor after an unexpected exit."
  Register-ScheduledTask -TaskName $interactiveTaskName -InputObject $interactiveTask -Force | Out-Null
  $registeredInteractiveTask = Get-ScheduledTask -TaskName $interactiveTaskName -ErrorAction Stop
  $hasInteractiveLogonTrigger = @($registeredInteractiveTask.Triggers | Where-Object {
    $_.CimClass.CimClassName -eq "MSFT_TaskLogonTrigger"
  }).Count -gt 0
  $hasInteractiveRecoveryTrigger = @($registeredInteractiveTask.Triggers | Where-Object {
    $_.CimClass.CimClassName -eq "MSFT_TaskTimeTrigger" -and
    $_.Repetition -and
    [string]$_.Repetition.Interval -eq "PT1M"
  }).Count -gt 0
  $interactiveTaskRegistered =
    $registeredInteractiveTask.Principal.LogonType -eq "Interactive" -and
    $registeredInteractiveTask.Actions.Count -eq 1 -and
    ([string]$registeredInteractiveTask.Actions[0].Arguments).IndexOf($startScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $hasInteractiveLogonTrigger -and
    $hasInteractiveRecoveryTrigger
  if (-not $interactiveTaskRegistered) {
    throw "登録した対話Bridgeタスクの構成を検証できませんでした。"
  }
  Remove-ItemProperty -Path $runKey -Name "TSA Codex Bridge" -ErrorAction SilentlyContinue
} catch {
  $interactiveTaskRegistrationError = $_.Exception.Message
  $runCommand = "powershell.exe $startArguments"
  New-ItemProperty -Path $runKey -Name "TSA Codex Bridge" -Value $runCommand -PropertyType String -Force | Out-Null
}

if (Test-Path -LiteralPath $maintenancePath) {
  Remove-Item -LiteralPath $maintenancePath -Force
}
if ($interactiveTaskRegistered) {
  Start-ScheduledTask -TaskName $interactiveTaskName -ErrorAction Stop
} else {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $startArguments
}

$registeredHeadlessSpecs = @()
if (-not $SkipPreloginTaskRegistration) {
  $expectedTaskScript = Join-Path $installDir "start-bridge-prelogin.ps1"
  $workersNeedingRegistration = @()
  foreach ($workerSpec in $headlessWorkerSpecs) {
    $registeredTask = Get-ScheduledTask -TaskName $workerSpec.TaskName -ErrorAction SilentlyContinue
    $registeredActionArguments = if ($registeredTask -and $registeredTask.Actions.Count -eq 1) {
      [string]$registeredTask.Actions[0].Arguments
    } else {
      ""
    }
    $hasStartupTrigger = $registeredTask -and @($registeredTask.Triggers | Where-Object {
      $_.CimClass.CimClassName -eq "MSFT_TaskBootTrigger"
    }).Count -gt 0
    $registeredTaskUserSid = if ($registeredTask) {
      Resolve-WindowsAccountSid ([string]$registeredTask.Principal.UserId)
    } else {
      $null
    }
    $taskRegistered = $registeredTask -and
      $registeredTask.Principal.LogonType -eq "S4U" -and
      $registeredTaskUserSid -eq $windowsUserSid -and
      $registeredTask.Actions.Count -eq 1 -and
      $registeredActionArguments.IndexOf($expectedTaskScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $registeredActionArguments.IndexOf("-RuntimeName $($workerSpec.RuntimeName)", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $hasStartupTrigger
    if (-not $taskRegistered) { $workersNeedingRegistration += $workerSpec }
  }

  $legacyPreloginTaskExists = $null -ne (Get-ScheduledTask -TaskName $legacyPreloginTaskName -ErrorAction SilentlyContinue)
  if ($workersNeedingRegistration.Count -gt 0 -or $legacyPreloginTaskExists) {
    $registrationScript = Join-Path $installDir "register-prelogin-task.ps1"
    $escapedRegistrationScript = $registrationScript.Replace("'", "''")
    $escapedInstallDir = $installDir.Replace("'", "''")
    $escapedUserId = $windowsUserId.Replace("'", "''")
    $registrationCommands = @()
    if ($legacyPreloginTaskExists) {
      $escapedLegacyTaskName = $legacyPreloginTaskName.Replace("'", "''")
      $registrationCommands += "if (Get-ScheduledTask -TaskName '$escapedLegacyTaskName' -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName '$escapedLegacyTaskName' -Confirm:`$false -ErrorAction Stop }"
    }
    $registrationCommands += @($workersNeedingRegistration | ForEach-Object {
      $escapedRuntimeName = ([string]$_.RuntimeName).Replace("'", "''")
      $escapedTaskName = ([string]$_.TaskName).Replace("'", "''")
      "& '$escapedRegistrationScript' -InstallDir '$escapedInstallDir' -UserId '$escapedUserId' -RuntimeName '$escapedRuntimeName' -TaskName '$escapedTaskName'"
    })
    $registrationCommand = '$ErrorActionPreference = "Stop"; ' + ($registrationCommands -join '; ')
    $registrationCommandBytes = [System.Text.Encoding]::Unicode.GetBytes($registrationCommand)
    $encodedRegistrationCommand = [Convert]::ToBase64String($registrationCommandBytes)
    $registrationArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand $encodedRegistrationCommand"
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
    $isAdministrator = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdministrator) {
      $registrationProcess = Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $registrationArguments -Wait -PassThru
    } else {
      $registrationProcess = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $registrationArguments -Wait -PassThru
    }
    if ($registrationProcess.ExitCode -ne 0) {
      throw "ログイン前BridgeのWindows起動タスクを登録できませんでした。"
    }
  }

  foreach ($workerSpec in $headlessWorkerSpecs) {
    $registeredTask = Get-ScheduledTask -TaskName $workerSpec.TaskName -ErrorAction Stop
    if ($registeredTask.Principal.LogonType -ne "S4U") {
      throw "ログイン前BridgeをS4Uで確認できませんでした: $($workerSpec.TaskName)"
    }
    $registeredHeadlessSpecs += $workerSpec
    Start-ScheduledTask -TaskName $workerSpec.TaskName -ErrorAction Stop
  }
}

$startedState = $null
$headlessStartedStates = @{}
$startupDeadline = (Get-Date).AddSeconds(75)
while ((Get-Date) -lt $startupDeadline) {
  if (Test-Path -LiteralPath $statePath) {
    try {
      $candidateState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
      $candidateProcess = Get-Process -Id ([int]$candidateState.pid) -ErrorAction SilentlyContinue
      if (
        $candidateProcess -and
        $candidateState.version -eq $expectedBridgeVersion -and
        $candidateState.lastHeartbeatAt
      ) {
        $startedState = $candidateState
      }
    } catch {
      # Startup writes a small state file; retry if this read overlaps the write.
    }
  }
  foreach ($workerSpec in $registeredHeadlessSpecs) {
    $workerStatePath = Join-Path (Join-Path (Join-Path $installDir "workers") $workerSpec.RuntimeName) "bridge-state.json"
    if (Test-Path -LiteralPath $workerStatePath) {
      try {
        $candidateHeadlessState = Get-Content -LiteralPath $workerStatePath -Raw | ConvertFrom-Json
        $candidateHeadlessProcess = Get-Process -Id ([int]$candidateHeadlessState.pid) -ErrorAction SilentlyContinue
        if (
          $candidateHeadlessProcess -and
          $candidateHeadlessState.version -eq $expectedBridgeVersion -and
          $candidateHeadlessState.executionMode -eq "headless-prelogin" -and
          $candidateHeadlessState.workerRole -eq $workerSpec.WorkerRole -and
          $candidateHeadlessState.monitorWorkerKey -eq $workerSpec.MonitorWorkerKey -and
          $candidateHeadlessState.lastHeartbeatAt
        ) {
          $headlessStartedStates[$workerSpec.RuntimeName] = $candidateHeadlessState
        }
      } catch {
        # Each worker atomically refreshes its own small advisory state.
      }
    }
  }
  if ($startedState -and $headlessStartedStates.Count -eq $registeredHeadlessSpecs.Count) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $startedState) {
  throw "Bridge $expectedBridgeVersion の起動・heartbeatを確認できませんでした。logsを確認してください。"
}
if ($headlessStartedStates.Count -ne $registeredHeadlessSpecs.Count) {
  $missingRuntimeNames = @($registeredHeadlessSpecs | Where-Object { -not $headlessStartedStates.ContainsKey($_.RuntimeName) } | ForEach-Object { $_.RuntimeName })
  throw "ログイン前Bridge $expectedBridgeVersion のS4U起動・heartbeatを確認できませんでした: $($missingRuntimeNames -join ', ')"
}

if ($registeredHeadlessSpecs.Count -eq 3) {
  Write-Output "TSA Codex Bridge $expectedBridgeVersion installed; four worker heartbeats confirmed (interactive + AI x2 + analysis): $installDir"
} elseif ($interactiveTaskRegistered) {
  Write-Output "TSA Codex Bridge $expectedBridgeVersion installed; interactive watchdog heartbeat confirmed; three headless worker registrations were skipped: $installDir"
} else {
  Write-Output "TSA Codex Bridge $expectedBridgeVersion installed with HKCU startup fallback; interactive task error: $interactiveTaskRegistrationError; three headless worker registrations were skipped: $installDir"
}
} finally {
  if (Test-Path -LiteralPath $maintenancePath) {
    Remove-Item -LiteralPath $maintenancePath -Force
  }
  if ($interactiveTaskDisabledForMaintenance) {
    $installedInteractiveTask = Get-ScheduledTask -TaskName $interactiveTaskName -ErrorAction SilentlyContinue
    if ($installedInteractiveTask -and $installedInteractiveTask.State -eq "Disabled") {
      Enable-ScheduledTask -TaskName $interactiveTaskName -ErrorAction SilentlyContinue | Out-Null
    }
  }
}
