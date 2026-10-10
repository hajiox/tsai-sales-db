$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLauncher = Join-Path $taskRoot 'tools\tsa-codex-bridge\start-bridge-prelogin.ps1'
$taskSource = Get-Content -LiteralPath $taskLauncher -Raw -Encoding UTF8
$taskTokens = $null; $taskErrors = $null
$taskAst = [System.Management.Automation.Language.Parser]::ParseInput($taskSource, [ref]$taskTokens, [ref]$taskErrors)
if ($taskErrors.Count) { throw 'Pre-login launcher syntax failed' }
foreach ($taskFunctionName in @('Remove-VerifiedRuntimeFile', 'Prepare-HeadlessWorkerStart', 'Wait-VerifiedHeadlessWorkerExit', 'Wait-HeadlessWorkerStart')) {
  $taskFunction = $taskAst.Find({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $taskFunctionName
  }, $true)
  if (-not $taskFunction) { throw "Missing function $taskFunctionName" }
  . ([scriptblock]::Create($taskFunction.Extent.Text))
}

$taskTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$runtimeDir = Join-Path $taskTempBase ('tsa-prelogin-supervisor-' + [guid]::NewGuid().ToString('N'))
$taskResolvedRuntime = [System.IO.Path]::GetFullPath($runtimeDir)
if (-not $taskResolvedRuntime.StartsWith($taskTempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Fixture path escaped the temporary directory'
}
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$statePath = Join-Path $runtimeDir 'bridge-state.json'
$lockPath = Join-Path $runtimeDir 'bridge.lock'
$configPath = Join-Path $runtimeDir 'bridge.config.json'
$bridgePath = Join-Path $runtimeDir 'bridge.mjs'
$script:fixtureStart = [DateTime]::UtcNow.AddMinutes(-5)
$script:fixtureMessages = @()
$script:fixtureProcesses = @{}
$script:fixtureSleeps = 0
$script:fixtureLookups = 0
$script:fixtureStops = 0
$script:fixtureScenario = ''
$script:fixtureState = $null

function Write-LauncherLog([string]$Message) { $script:fixtureMessages += $Message }
function Save-FixtureState {
  $script:fixtureState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}
function New-Fixture([string]$Scenario) {
  $script:fixtureScenario = $Scenario
  $script:fixtureSleeps = 0; $script:fixtureLookups = 0; $script:fixtureStops = 0
  $script:fixtureMessages = @()
  $script:fixtureProcesses = @{ 321 = [pscustomobject]@{ Id = 321; ProcessName = 'node'; StartTime = $script:fixtureStart } }
  $script:fixtureState = [pscustomobject]@{ pid = 321; executionMode = 'headless-prelogin'; workerId = 'fixture-ai';
    currentJobId = $null; updatedAt = [DateTime]::UtcNow.ToString('o'); version = 'fixture-version' }
  Save-FixtureState
  '321' | Set-Content -LiteralPath $lockPath -Encoding UTF8
  '{"workerId":"fixture-ai"}' | Set-Content -LiteralPath $configPath -Encoding UTF8
  'const VERSION = "fixture-version";' | Set-Content -LiteralPath $bridgePath -Encoding UTF8
}
function Get-Process {
  [CmdletBinding()]
  param([int]$Id)
  $script:fixtureLookups++
  if ($script:fixtureScenario -eq 'observation-denied' -and $script:fixtureLookups -gt 1) {
    throw [System.UnauthorizedAccessException]::new('Synthetic observation denial')
  }
  if ($script:fixtureProcesses.ContainsKey($Id)) { return $script:fixtureProcesses[$Id] }
  Write-Error -Message 'Synthetic process does not exist' -Category ObjectNotFound -ErrorId 'NoProcessFoundForGivenId'
}
function Stop-Process {
  param([int]$Id, [switch]$Force, [string]$ErrorAction)
  $script:fixtureStops++
  throw "A verified current worker must never be stopped: $Id"
}
function Start-Sleep {
  param([int]$Seconds)
  if ($Seconds -ne 5) { throw 'Unexpected supervisor interval' }
  $script:fixtureSleeps++
  if ($script:fixtureSleeps -gt 4) { throw 'Supervisor did not re-evaluate termination' }
  if (-not (Test-Path -LiteralPath $statePath) -or -not (Test-Path -LiteralPath $lockPath)) {
    throw 'Supervisor changed a live worker state or lock'
  }
  if ($script:fixtureStops) { throw 'Supervisor stopped an active worker' }
  switch ($script:fixtureScenario) {
    'live-busy-exit' {
      if ($script:fixtureSleeps -eq 1) { $script:fixtureState.currentJobId = 'synthetic-job'; Save-FixtureState }
      if ($script:fixtureSleeps -eq 3) {
        $script:fixtureState.currentJobId = $null; Save-FixtureState
        $script:fixtureProcesses.Remove(321)
      }
    }
    'busy-exit-blocked' {
      $script:fixtureState.currentJobId = 'synthetic-job'; Save-FixtureState
      $script:fixtureProcesses.Remove(321)
    }
    'pid-reused' {
      $script:fixtureProcesses[321] = [pscustomobject]@{ Id = 321; ProcessName = 'node'; StartTime = [DateTime]::UtcNow.AddMinutes(1) }
    }
    'replacement-worker' {
      if ($script:fixtureSleeps -eq 1) {
        $taskReplacementStart = [DateTime]::UtcNow
        $script:fixtureProcesses[321] = [pscustomobject]@{ Id = 321; ProcessName = 'node'; StartTime = $taskReplacementStart }
        $script:fixtureState.updatedAt = $taskReplacementStart.AddSeconds(1).ToString('o'); Save-FixtureState
      } else { $script:fixtureProcesses.Remove(321) }
    }
    default { throw "Unexpected observation for scenario $script:fixtureScenario" }
  }
}
function Assert-Fixture([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }

try {
  New-Fixture 'live-busy-exit'
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'start') 'Existing worker did not return to validated startup after exit'
  Assert-Fixture ($script:fixtureSleeps -eq 3) 'Existing worker was not observed while idle/busy'
  Assert-Fixture ($script:fixtureStops -eq 0) 'Same-version worker was stopped'
  Assert-Fixture (-not (Test-Path -LiteralPath $statePath) -and -not (Test-Path -LiteralPath $lockPath)) 'Stale worker state was not re-evaluated after exit'

  New-Fixture 'busy-exit-blocked'
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'blocked') 'A remaining job must preserve the existing blocked behavior'
  Assert-Fixture ((Test-Path -LiteralPath $statePath) -and (Test-Path -LiteralPath $lockPath)) 'Busy state was changed'
  Assert-Fixture ($script:fixtureStops -eq 0) 'Busy worker was interrupted'

  New-Fixture 'initial-busy'
  $script:fixtureState.currentJobId = 'synthetic-job'; Save-FixtureState
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'blocked') 'Initial busy state did not remain blocked'
  Assert-Fixture ($script:fixtureSleeps -eq 0 -and $script:fixtureStops -eq 0) 'Initial busy state triggered observation or stop'

  New-Fixture 'mismatched-lock'
  '999' | Set-Content -LiteralPath $lockPath -Encoding UTF8
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'blocked') 'Identity mismatch did not remain blocked'
  Assert-Fixture ((Get-Content -LiteralPath $lockPath -Raw).Trim() -eq '999') 'Mismatched lock was changed'
  Assert-Fixture ($script:fixtureSleeps -eq 0 -and $script:fixtureStops -eq 0) 'Identity mismatch triggered observation or stop'

  New-Fixture 'pid-reused'
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'start') 'Reused PID did not trigger a fresh identity check'
  Assert-Fixture ($script:fixtureProcesses.ContainsKey(321) -and $script:fixtureStops -eq 0) 'Reused PID was stopped'

  New-Fixture 'replacement-worker'
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'start') 'Replacement worker was not adopted before startup'
  Assert-Fixture ($script:fixtureSleeps -eq 2 -and $script:fixtureStops -eq 0) 'Replacement worker was interrupted or duplicated'
  Assert-Fixture (@($script:fixtureMessages | Where-Object { $_ -like 'observing existing Bridge*' }).Count -eq 2) 'A replacement must be verified by Prepare again'

  New-Fixture 'observation-denied'
  Assert-Fixture ((Wait-HeadlessWorkerStart) -eq 'blocked') 'Observation denial did not fail closed'
  Assert-Fixture ($script:fixtureStops -eq 0 -and (Test-Path -LiteralPath $statePath) -and (Test-Path -LiteralPath $lockPath)) 'Observation denial altered the worker'

  Write-Output 'PASS: pre-login supervisor adopts verified live Node, tolerates busy work, rechecks exit/reused PID/replacement, preserves blocked states and fails closed without stopping or duplicating a live worker.'
} finally {
  $taskCleanupPath = [System.IO.Path]::GetFullPath($runtimeDir)
  if ($taskCleanupPath -ne $taskResolvedRuntime -or -not $taskCleanupPath.StartsWith($taskTempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing cleanup outside the verified fixture directory'
  }
  Remove-Item -LiteralPath $taskCleanupPath -Recurse -Force
}
