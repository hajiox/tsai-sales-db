param(
  [ValidatePattern("^[a-z0-9][a-z0-9-]{0,39}$")][string]$RuntimeName = "ai-01"
)

$ErrorActionPreference = "Stop"
$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path (Join-Path $installDir "workers") $RuntimeName
$configPath = Join-Path $runtimeDir "bridge.config.json"
$bridgePath = Join-Path $installDir "bridge.mjs"
$maintenancePath = Join-Path $installDir "bridge-maintenance.lock"
$statePath = Join-Path $runtimeDir "bridge-state.json"
$lockPath = Join-Path $runtimeDir "bridge.lock"
$launcherLogPath = Join-Path $runtimeDir "logs\launcher.log"

function Write-LauncherLog([string]$Message) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $launcherLogPath) -Force | Out-Null
  $line = "{0} [{1}] {2}" -f (Get-Date).ToUniversalTime().ToString("o"), $RuntimeName, $Message
  Add-Content -LiteralPath $launcherLogPath -Value $line -Encoding UTF8
}

function Remove-VerifiedRuntimeFile([string]$Path) {
  $resolvedRuntime = [System.IO.Path]::GetFullPath($runtimeDir).TrimEnd('\') + '\'
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedRuntime, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ログイン前Bridge外のファイルは削除できません: $resolvedPath"
  }
  if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
    [System.IO.File]::Delete($resolvedPath)
  }
}

function Prepare-HeadlessWorkerStart {
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf) -and -not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    return "start"
  }
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    Write-LauncherLog "START BLOCKED state is missing while a lock remains; no process was stopped"
    return "blocked"
  }

  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $statePid = [int]$state.pid
    $lockPid = if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
      [int](Get-Content -LiteralPath $lockPath -Raw)
    } else {
      $null
    }
    if (
      $statePid -le 0 -or
      ($null -ne $lockPid -and $lockPid -ne $statePid) -or
      $state.executionMode -ne "headless-prelogin" -or
      [string]$state.workerId -ne [string]$config.workerId
    ) {
      Write-LauncherLog "START BLOCKED state/lock identity mismatch; no process was stopped"
      return "blocked"
    }
    if ($state.currentJobId) {
      Write-LauncherLog "START BLOCKED worker $statePid still owns job $($state.currentJobId)"
      return "blocked"
    }

    $existing = Get-Process -Id $statePid -ErrorAction SilentlyContinue
    if (-not $existing) {
      Remove-VerifiedRuntimeFile $lockPath
      Remove-VerifiedRuntimeFile $statePath
      Write-LauncherLog "removed stale state for missing process $statePid"
      return "start"
    }
    $stateUpdatedAt = [DateTimeOffset]::Parse([string]$state.updatedAt).UtcDateTime
    if ($existing.StartTime.ToUniversalTime() -gt $stateUpdatedAt.AddSeconds(5)) {
      Remove-VerifiedRuntimeFile $lockPath
      Remove-VerifiedRuntimeFile $statePath
      Write-LauncherLog "removed stale state for reused PID $statePid without stopping that process"
      return "start"
    }
    if ($existing.ProcessName -ne "node") {
      Write-LauncherLog "START BLOCKED PID $statePid is not node; no process was stopped"
      return "blocked"
    }

    $bridgeSource = Get-Content -LiteralPath $bridgePath -Raw
    $versionMatch = [regex]::Match($bridgeSource, 'const VERSION = "([^"]+)";')
    if (-not $versionMatch.Success) {
      Write-LauncherLog "START BLOCKED installed Bridge version is unreadable"
      return "blocked"
    }
    $expectedVersion = $versionMatch.Groups[1].Value
    if ([string]$state.version -eq $expectedVersion) {
      Write-LauncherLog "skipped because Bridge $expectedVersion is already running as PID $statePid"
      return "already-running"
    }

    Stop-Process -Id $statePid -Force -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline -and (Get-Process -Id $statePid -ErrorAction SilentlyContinue)) {
      Start-Sleep -Milliseconds 250
    }
    if (Get-Process -Id $statePid -ErrorAction SilentlyContinue) {
      Write-LauncherLog "START BLOCKED stale Bridge $($state.version) PID $statePid did not stop"
      return "blocked"
    }
    Remove-VerifiedRuntimeFile $lockPath
    Remove-VerifiedRuntimeFile $statePath
    Write-LauncherLog "retired stale Bridge $($state.version) PID $statePid for $expectedVersion"
    return "start"
  } catch {
    Write-LauncherLog "START BLOCKED $($_.Exception.Message)"
    return "blocked"
  }
}

$startupDisposition = Prepare-HeadlessWorkerStart
if ($startupDisposition -ne "start") {
  exit 0
}

while ($true) {
  try {
    if (-not (Test-Path -LiteralPath $configPath)) {
      throw "ログイン前Bridgeの設定ファイルがありません: $configPath"
    }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $userProfile = [string]$config.userProfile
    $localAppData = [string]$config.localAppData
    $nodePath = [string]$config.nodePath
    if (-not (Test-Path -LiteralPath $userProfile -PathType Container)) {
      throw "Windowsユーザープロファイルがありません: $userProfile"
    }
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
      throw "Node.jsがありません: $nodePath"
    }

    $env:USERPROFILE = $userProfile
    $env:HOME = $userProfile
    $env:LOCALAPPDATA = $localAppData
    $env:APPDATA = Join-Path $userProfile "AppData\Roaming"
    $env:CODEX_HOME = [string]$config.codexHome
    $env:TSA_CODEX_BRIDGE_APP_DIR = $runtimeDir
    $env:TSA_CODEX_BRIDGE_CONFIG = $configPath
    $env:TSA_CODEX_BRIDGE_MAINTENANCE_PATH = $maintenancePath
    $env:TSA_CODEX_BRIDGE_EXECUTION_MODE = "headless-prelogin"

    & $nodePath $bridgePath
  } catch {
    Write-LauncherLog "LAUNCH ERROR $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 15
}
