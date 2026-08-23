param(
  [Parameter(Mandatory = $true)]
  [string]$StatePath,
  [Parameter(Mandatory = $true)]
  [string]$JobId,
  [Parameter(Mandatory = $true)]
  [string]$AckPath
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$shortJobId = if ($JobId.Length -gt 8) { $JobId.Substring(0, 8) } else { $JobId }
$Host.UI.RawUI.WindowTitle = "TSA Codex Bridge 実行モニター [$shortJobId]"
$finalStatuses = @("completed", "waiting_for_user", "needs_review", "failed", "cancelled")
$mutexName = "Local\TsaCodexBridgeMonitor_{0}" -f ($JobId -replace "[^a-zA-Z0-9]", "")
$createdNew = $false
$monitorMutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
  $monitorMutex.Dispose()
  exit 0
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TsaBridgeMonitorWindow {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
  [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
  [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$windowHandle = [TsaBridgeMonitorWindow]::GetConsoleWindow()
$inputHandle = [TsaBridgeMonitorWindow]::GetStdHandle(-10)
$consoleMode = [uint32]0
if ($inputHandle -ne [IntPtr]::Zero -and [TsaBridgeMonitorWindow]::GetConsoleMode($inputHandle, [ref]$consoleMode)) {
  $consoleMode = ($consoleMode -bor 0x80) -band (-bnot 0x40)
  [void][TsaBridgeMonitorWindow]::SetConsoleMode($inputHandle, $consoleMode)
}
$foregroundActivated = $false
if ($windowHandle -ne [IntPtr]::Zero) {
  [void][TsaBridgeMonitorWindow]::ShowWindowAsync($windowHandle, 9)
  $foregroundActivated = [TsaBridgeMonitorWindow]::SetForegroundWindow($windowHandle)
}
$acknowledgement = @{
  jobId = $JobId
  monitorPid = $PID
  windowHandle = $windowHandle.ToInt64()
  foregroundActivated = $foregroundActivated
  startedAt = [DateTimeOffset]::UtcNow.ToString("o")
} | ConvertTo-Json
[System.IO.File]::WriteAllText($AckPath, $acknowledgement, [System.Text.UTF8Encoding]::new($false))

function Format-Duration([double]$Seconds) {
  $value = [Math]::Max(0, [Math]::Floor($Seconds))
  $hours = [Math]::Floor($value / 3600)
  $minutes = [Math]::Floor(($value % 3600) / 60)
  $seconds = $value % 60
  if ($hours -gt 0) { return "{0}時間{1:00}分{2:00}秒" -f $hours, $minutes, $seconds }
  return "{0}分{1:00}秒" -f $minutes, $seconds
}

function Format-Time([string]$Value) {
  if (-not $Value) { return "算出中" }
  try { return ([DateTimeOffset]::Parse($Value)).ToLocalTime().ToString("HH:mm") } catch { return "算出中" }
}

function Format-EtaWindow([string]$EarliestValue, [string]$LatestValue, [DateTimeOffset]$Now) {
  if (-not $EarliestValue -or -not $LatestValue) { return "算出中" }
  try {
    $earliest = ([DateTimeOffset]::Parse($EarliestValue)).ToLocalTime()
    $latest = ([DateTimeOffset]::Parse($LatestValue)).ToLocalTime()
    if ($latest -lt $Now) { return "目安超過（処理継続中）" }
    return "{0} - {1} 頃" -f $earliest.ToString("HH:mm"), $latest.ToString("HH:mm")
  } catch {
    return "算出中"
  }
}

function Status-Label([string]$Status) {
  switch ($Status) {
    "completed" { return "完了" }
    "waiting_for_user" { return "操作待ち" }
    "needs_review" { return "確認待ち" }
    "failed" { return "失敗" }
    "cancelled" { return "停止済み" }
    default { return "実行中" }
  }
}

try {
  $lastRenderKey = ""
  $waitingRendered = $false
  Write-Host "TSA Codex Bridge 実行モニター" -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkGray

  while ($true) {
    if (-not (Test-Path -LiteralPath $StatePath)) {
      if (-not $waitingRendered) {
        Write-Host "ジョブ情報の受信を待っています..." -ForegroundColor Yellow
        $waitingRendered = $true
      }
      Start-Sleep -Seconds 1
      continue
    }

    try {
      $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    } catch {
      Start-Sleep -Milliseconds 500
      continue
    }
    if ([string]$state.jobId -ne $JobId) { break }

    $now = [DateTimeOffset]::Now
    try { $started = ([DateTimeOffset]::Parse([string]$state.startedAt)).ToLocalTime() } catch { $started = $now }
    try { $responded = ([DateTimeOffset]::Parse([string]$state.lastResponseAt)).ToLocalTime() } catch { $responded = $now }
    $elapsed = ($now - $started).TotalSeconds
    $responseAge = ($now - $responded).TotalSeconds
    $progress = [Math]::Max(0, [Math]::Min(100, [int]$state.progress))
    $filled = [Math]::Floor($progress * 40 / 100)
    $bar = ("#" * $filled).PadRight(40, "-")
    $status = [string]$state.status
    $isFinal = $finalStatuses -contains $status
    $statusColor = if ($status -eq "completed") { "Green" } elseif ($isFinal) { "Yellow" } else { "Cyan" }
    $codexAlive = $false
    if ($state.codexPid) { $codexAlive = $null -ne (Get-Process -Id ([int]$state.codexPid) -ErrorAction SilentlyContinue) }
    $etaWindow = Format-EtaWindow ([string]$state.estimatedEarliestAt) ([string]$state.estimatedLatestAt) $now
    $renderKey = "{0}|{1}|{2}|{3}|{4}" -f $status, $progress, [string]$state.currentStep, [string]$state.summary, [string]$state.codexPid

    if ($renderKey -ne $lastRenderKey) {
      Write-Host ("[{0}] {1}  {2}%" -f $now.ToString("HH:mm:ss"), (Status-Label $status), $progress) -ForegroundColor $statusColor
      Write-Host ("処理       : {0}" -f [string]$state.taskLabel)
      if ($state.productName) { Write-Host ("対象       : {0}" -f [string]$state.productName) }
      if ($state.targets -and $state.targets.Count -gt 0) { Write-Host ("対象EC     : {0}" -f (($state.targets | ForEach-Object { [string]$_ }) -join ", ")) }
      Write-Host ("現在の工程 : {0}" -f [string]$state.currentStep) -ForegroundColor White
      Write-Host ("[{0}] {1,3}%" -f $bar, $progress) -ForegroundColor Cyan
      Write-Host ("経過時間   : {0}" -f (Format-Duration $elapsed))
      if (-not $isFinal) { Write-Host ("完了目安   : {0}" -f $etaWindow) -ForegroundColor Yellow }
      Write-Host ("最終応答   : {0}前" -f (Format-Duration $responseAge))
      Write-Host ("Bridge PID : {0}  {1}" -f [string]$state.bridgePid, $(if (Get-Process -Id ([int]$state.bridgePid) -ErrorAction SilentlyContinue) { "稼働中" } else { "停止" }))
      $codexStatus = if ($codexAlive) { "CLI実行中" } elseif ($isFinal) { "終了" } else { "準備・切替中" }
      Write-Host ("Codex PID  : {0}  {1}" -f $(if ($state.codexPid) { [string]$state.codexPid } else { "-" }), $codexStatus)
      Write-Host ("Job ID     : {0}" -f [string]$state.jobId) -ForegroundColor DarkGray
      if ($state.summary) { Write-Host ("直近の応答 : {0}" -f [string]$state.summary) -ForegroundColor DarkCyan }
      Write-Host ("-" * 72) -ForegroundColor DarkGray
      $lastRenderKey = $renderKey
    }

    if ($isFinal) {
      Write-Host "処理は終了しました。この画面は30秒後に閉じます。" -ForegroundColor $statusColor
      Start-Sleep -Seconds 30
      break
    }
    Start-Sleep -Seconds 1
  }
} finally {
  if ($createdNew) { [void]$monitorMutex.ReleaseMutex() }
  $monitorMutex.Dispose()
}
