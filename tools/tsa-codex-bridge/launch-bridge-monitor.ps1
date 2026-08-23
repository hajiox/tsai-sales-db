param(
  [Parameter(Mandatory = $true)][string]$StatePath,
  [Parameter(Mandatory = $true)][string]$JobId,
  [Parameter(Mandatory = $true)][string]$AckPath
)

$ErrorActionPreference = "Stop"
$monitorScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "bridge-monitor.ps1"
if (-not (Test-Path -LiteralPath $monitorScript)) {
  throw "Bridge monitor script not found: $monitorScript"
}

$consoleHost = Join-Path $env:SystemRoot "System32\conhost.exe"
$arguments = @(
  "powershell.exe"
  "-NoProfile"
  "-ExecutionPolicy", "Bypass"
  "-File", "`"$monitorScript`""
  "-StatePath", "`"$StatePath`""
  "-JobId", "`"$JobId`""
  "-AckPath", "`"$AckPath`""
)

$monitor = Start-Process -FilePath $consoleHost -ArgumentList $arguments -WindowStyle Normal -PassThru
if (-not $monitor) {
  throw "Bridge monitor console host did not start"
}
