param(
  [Parameter(Mandatory = $true)][string]$StateDirectory,
  [Parameter(Mandatory = $true)][string]$AckPath,
  [string]$WindowConfigPath,
  [switch]$BringForward
)

$ErrorActionPreference = "Stop"
$monitorScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "bridge-monitor.ps1"
$placementScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "monitor-window-placement.ps1"
if (-not (Test-Path -LiteralPath $monitorScript)) {
  throw "Bridge monitor script not found: $monitorScript"
}
if (-not $WindowConfigPath) {
  $WindowConfigPath = Join-Path $env:LOCALAPPDATA "Codex Bridge Monitor\monitor.config.json"
}
if (Test-Path -LiteralPath $placementScript -PathType Leaf) {
  . $placementScript
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

$acknowledgement = Read-Utf8Json $AckPath
if ($acknowledgement -and $acknowledgement.monitorId -eq "codex-bridge-unified" -and (Test-ProcessId $acknowledgement.monitorPid)) {
  if ((Get-Command Get-CodexBridgeMonitorPlacement -ErrorAction SilentlyContinue) -and [int64]$acknowledgement.windowHandle -ne 0) {
    $placement = Get-CodexBridgeMonitorPlacement $WindowConfigPath
    if ($placement) {
      [void](Move-CodexBridgeMonitorWindow ([IntPtr]([int64]$acknowledgement.windowHandle)) $placement)
    }
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

$monitor = Start-Process -FilePath $consoleHost -ArgumentList $arguments -WindowStyle Normal -PassThru
if (-not $monitor) {
  throw "Bridge unified monitor console host did not start"
}
