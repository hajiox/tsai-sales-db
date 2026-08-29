param(
  [Parameter(Mandatory = $true)][string]$StateDirectory,
  [Parameter(Mandatory = $true)][string]$AckPath,
  [string]$WindowConfigPath,
  [string]$WindowPlacementBase64,
  [switch]$BringForward
)

$ErrorActionPreference = "Stop"
$monitorScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "bridge-monitor.ps1"
$placementScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "monitor-window-placement.ps1"
$diagnosticPath = Join-Path (Split-Path -Parent $AckPath) "monitor-launch-diagnostic.jsonl"
function Write-LaunchDiagnostic([string]$EventName, $Detail) {
  try {
    $entry = [ordered]@{
      at = [DateTimeOffset]::Now.ToString("o")
      launcherPid = $PID
      event = $EventName
      detail = $Detail
    } | ConvertTo-Json -Depth 4 -Compress
    [System.IO.File]::AppendAllText($diagnosticPath, $entry + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  } catch {
    # Diagnostics must never block monitor startup.
  }
}
Write-LaunchDiagnostic "launcher_started" @{}
if (-not (Test-Path -LiteralPath $monitorScript)) {
  throw "Bridge monitor script not found: $monitorScript"
}
if (-not $WindowConfigPath) {
  $WindowConfigPath = Join-Path $env:LOCALAPPDATA "Codex Bridge Monitor\monitor.config.json"
}
if (Test-Path -LiteralPath $placementScript -PathType Leaf) {
  . $placementScript
}
$inlineWindowPlacement = if ($WindowPlacementBase64) {
  ConvertFrom-CodexBridgeMonitorPlacementBase64 $WindowPlacementBase64
} else {
  $null
}

function Read-Utf8Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
    return [System.IO.File]::ReadAllText($Path, $strictUtf8) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-ProcessId($Value) {
  [int]$processId = 0
  if (-not [int]::TryParse([string]$Value, [ref]$processId) -or $processId -le 0) { return $false }
  return $null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Move-AcknowledgedMonitor($Acknowledgement) {
  $script:lastPlacementAvailable = $false
  $script:lastMoveResult = $false
  if (
    -not $Acknowledgement -or
    $Acknowledgement.monitorId -ne "codex-bridge-unified" -or
    -not (Test-ProcessId $Acknowledgement.monitorPid) -or
    [int64]$Acknowledgement.windowHandle -eq 0 -or
    -not (Get-Command Get-CodexBridgeMonitorPlacement -ErrorAction SilentlyContinue)
  ) {
    return $false
  }
  $placement = if ($inlineWindowPlacement) {
    $inlineWindowPlacement
  } else {
    Get-CodexBridgeMonitorPlacement $WindowConfigPath
  }
  if (-not $placement) { return $false }
  $script:lastPlacementAvailable = $true
  $script:lastMoveResult = Move-CodexBridgeMonitorWindow ([IntPtr]([int64]$Acknowledgement.windowHandle)) $placement
  return $script:lastMoveResult
}

$acknowledgement = Read-Utf8Json $AckPath
if ($acknowledgement -and $acknowledgement.monitorId -eq "codex-bridge-unified" -and (Test-ProcessId $acknowledgement.monitorPid)) {
  $existingMoveResult = Move-AcknowledgedMonitor $acknowledgement
  Write-LaunchDiagnostic "existing_monitor_reused" @{
    monitorPid = [int]$acknowledgement.monitorPid
    placementAvailable = $script:lastPlacementAvailable
    moveResult = $existingMoveResult
  }
  if ($BringForward -and [int64]$acknowledgement.windowHandle -ne 0) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CodexBridgeUnifiedMonitorLauncherWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
"@
    $handle = [IntPtr]([int64]$acknowledgement.windowHandle)
    [void][CodexBridgeUnifiedMonitorLauncherWindow]::ShowWindowAsync($handle, 9)
    [void][CodexBridgeUnifiedMonitorLauncherWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 0, 0, 0x0043)
    Start-Sleep -Milliseconds 100
    [void][CodexBridgeUnifiedMonitorLauncherWindow]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, 0x0043)
    [void][CodexBridgeUnifiedMonitorLauncherWindow]::SetForegroundWindow($handle)
  }
  exit 0
}

if ($acknowledgement -and -not (Test-ProcessId $acknowledgement.monitorPid)) {
  Remove-Item -LiteralPath $AckPath -Force -ErrorAction SilentlyContinue
}

$consoleHost = Join-Path $env:SystemRoot "System32\conhost.exe"
$arguments = @(
  "powershell.exe"
  "-NoProfile"
  "-ExecutionPolicy", "Bypass"
  "-File", "`"$monitorScript`""
  "-StateDirectory", "`"$StateDirectory`""
  "-AckPath", "`"$AckPath`""
  "-WindowPlacementScript", "`"$placementScript`""
  "-WindowConfigPath", "`"$WindowConfigPath`""
)
if ($WindowPlacementBase64) {
  $arguments += @("-WindowPlacementBase64", "`"$WindowPlacementBase64`"")
}

$monitor = Start-Process -FilePath $consoleHost -ArgumentList $arguments -WindowStyle Normal -PassThru
if (-not $monitor) {
  throw "Bridge unified monitor console host did not start"
}
Write-LaunchDiagnostic "console_host_started" @{ consoleHostPid = $monitor.Id }

$placementDeadline = (Get-Date).AddSeconds(8)
$moveAttempts = 0
$moveSuccesses = 0
$acknowledgedMonitorPid = $null
while ((Get-Date) -lt $placementDeadline) {
  $startedAcknowledgement = Read-Utf8Json $AckPath
  if (
    $startedAcknowledgement -and
    $startedAcknowledgement.monitorId -eq "codex-bridge-unified" -and
    (Test-ProcessId $startedAcknowledgement.monitorPid)
  ) {
    $acknowledgedMonitorPid = [int]$startedAcknowledgement.monitorPid
    $moveAttempts += 1
    if (Move-AcknowledgedMonitor $startedAcknowledgement) { $moveSuccesses += 1 }
    Start-Sleep -Milliseconds 250
  } else {
    Start-Sleep -Milliseconds 100
  }
}
Write-LaunchDiagnostic "placement_finished" @{
  monitorPid = $acknowledgedMonitorPid
  attempts = $moveAttempts
  successes = $moveSuccesses
  placementAvailable = $script:lastPlacementAvailable
  lastMoveResult = $script:lastMoveResult
}
