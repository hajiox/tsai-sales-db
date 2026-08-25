param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$BaseUrl = "https://v0-tsa-19.vercel.app",
  [string]$WorkerId = "tsa-office-01",
  [string]$WorkerName = "事務所PC",
  [string]$Workspace = "C:\作業用",
  [string]$CodexSessionId = "",
  [ValidateSet("low", "medium", "high", "xhigh")][string]$ReasoningEffort = "low"
)

$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "TSA Codex Bridge"
$requiredSourceFiles = @(
  "bridge.mjs",
  "result.schema.json",
  "analysis-result.schema.json",
  "ec-price-result.schema.json",
  "ec-price-plan.schema.json",
  "ec-product-name-result.schema.json",
  "ec-product-name-plan.schema.json",
  "ec-product-name-ai.schema.json",
  "bridge-monitor.ps1",
  "launch-bridge-monitor.ps1",
  "start-bridge.ps1"
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
$priceSkill = Join-Path $env:USERPROFILE ".codex\skills\update-aizu-ec-prices\SKILL.md"
if (-not (Test-Path -LiteralPath $priceSkill)) {
  throw "update-aizu-ec-prices Skillがありません。共有Skillsを同期してから再実行してください。"
}
foreach ($skillName in @("tsa-web-sales-csv", "tsa-ad-cost-csv", "tsa-ec-profit-report", "tsa-web-sales-analysis", "update-aizu-ec-product-names", "generate-aizu-ec-product-names")) {
  $skillSource = Join-Path $sourceDir "skills\$skillName"
  if (-not (Test-Path -LiteralPath (Join-Path $skillSource "SKILL.md"))) {
    throw "Bridge同梱Skillがありません: $skillSource"
  }
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "logs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "jobs") -Force | Out-Null

$startScriptPath = Join-Path $installDir "start-bridge.ps1"
$bridgePath = Join-Path $installDir "bridge.mjs"
$monitorPath = Join-Path $installDir "bridge-monitor.ps1"
$monitorLauncherPath = Join-Path $installDir "launch-bridge-monitor.ps1"
$maintenancePath = Join-Path $installDir "bridge-maintenance.lock"
$statePath = Join-Path $installDir "bridge-state.json"
$maintenanceNonce = [guid]::NewGuid().ToString("N")
[System.IO.File]::WriteAllText($maintenancePath, $maintenanceNonce, [System.Text.UTF8Encoding]::new($false))

try {
  $allProcesses = @(Get-CimInstance Win32_Process)
  $bridgeProcesses = @($allProcesses | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine.IndexOf($startScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine.IndexOf($bridgePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )
  })
  if ($bridgeProcesses.Count -gt 0) {
    $maintenanceAcknowledged = $false
    $ackDeadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $ackDeadline) {
      if (Test-Path -LiteralPath $statePath) {
        try {
          $bridgeState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
          if (
            $bridgeState.maintenanceObserved -eq $maintenanceNonce -and
            -not $bridgeState.currentJobId
          ) {
            $maintenanceAcknowledged = $true
            break
          }
        } catch {
          # The bridge may be replacing the small state file; retry a fresh read.
        }
      }
      Start-Sleep -Milliseconds 250
    }
    if (-not $maintenanceAcknowledged) {
      throw "Bridgeが停止準備を確認できません。実行中タスクの完了後、または旧Bridgeを終了後に再実行してください。"
    }

    $allProcesses = @(Get-CimInstance Win32_Process)
    $bridgeProcesses = @($allProcesses | Where-Object {
      $_.CommandLine -and (
        $_.CommandLine.IndexOf($startScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $_.CommandLine.IndexOf($bridgePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      )
    })
    $bridgeIds = @($bridgeProcesses | ForEach-Object { [int]$_.ProcessId })
    if ($bridgeIds -notcontains [int]$bridgeState.pid) {
      throw "停止準備を確認したBridgeプロセスが一致しません。再実行してください。"
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
          $_.CommandLine.IndexOf($monitorLauncherPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0
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

  foreach ($process in @($bridgeProcesses | Sort-Object { if ($_.Name -like "powershell*") { 0 } else { 1 } })) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  }
  if ($bridgeProcesses.Count -gt 0) { Start-Sleep -Seconds 2 }
  $remainingBridgeProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine.IndexOf($startScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine.IndexOf($bridgePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    )
  })
  if ($remainingBridgeProcesses.Count -gt 0) {
    throw "既存Bridgeを安全に停止できませんでした。"
  }
  $lockPath = Join-Path $installDir "bridge.lock"
  if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
  if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath -Force }

Copy-Item -LiteralPath (Join-Path $sourceDir "bridge.mjs") -Destination (Join-Path $installDir "bridge.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "bridge-monitor.ps1") -Destination (Join-Path $installDir "bridge-monitor.ps1") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "launch-bridge-monitor.ps1") -Destination (Join-Path $installDir "launch-bridge-monitor.ps1") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "result.schema.json") -Destination (Join-Path $installDir "result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "analysis-result.schema.json") -Destination (Join-Path $installDir "analysis-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-price-result.schema.json") -Destination (Join-Path $installDir "ec-price-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-price-plan.schema.json") -Destination (Join-Path $installDir "ec-price-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-result.schema.json") -Destination (Join-Path $installDir "ec-product-name-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-plan.schema.json") -Destination (Join-Path $installDir "ec-product-name-plan.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-product-name-ai.schema.json") -Destination (Join-Path $installDir "ec-product-name-ai.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "start-bridge.ps1") -Destination (Join-Path $installDir "start-bridge.ps1") -Force

foreach ($skillName in @("tsa-web-sales-csv", "tsa-ad-cost-csv", "tsa-ec-profit-report", "tsa-web-sales-analysis", "update-aizu-ec-product-names", "generate-aizu-ec-product-names")) {
  $skillSource = Join-Path $sourceDir "skills\$skillName"
  $skillRoot = Join-Path (Join-Path $env:USERPROFILE ".codex\skills") $skillName
  New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $skillSource "*") -Destination $skillRoot -Recurse -Force
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
  codexSessionId = $CodexSessionId
  reasoningEffort = $ReasoningEffort
  pollMs = 5000
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $installDir "bridge.config.json"), $config, [System.Text.UTF8Encoding]::new($false))

$runCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $installDir 'start-bridge.ps1')`""
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "TSA Codex Bridge" -Value $runCommand -PropertyType String -Force | Out-Null

$startScript = Join-Path $installDir "start-bridge.ps1"
$startArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $startArguments

if (Test-Path -LiteralPath $maintenancePath) {
  Remove-Item -LiteralPath $maintenancePath -Force
}
$startedState = $null
$startupDeadline = (Get-Date).AddSeconds(45)
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
        break
      }
    } catch {
      # Startup writes a small state file; retry if this read overlaps the write.
    }
  }
  Start-Sleep -Milliseconds 500
}
if (-not $startedState) {
  throw "Bridge $expectedBridgeVersion の起動・heartbeatを確認できませんでした。logsを確認してください。"
}

Write-Output "TSA Codex Bridge $expectedBridgeVersion installed and heartbeat confirmed: $installDir"
} finally {
  if (Test-Path -LiteralPath $maintenancePath) {
    Remove-Item -LiteralPath $maintenancePath -Force
  }
}
