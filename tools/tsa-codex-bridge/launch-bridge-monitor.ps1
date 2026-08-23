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

$arguments = @(
  "-NoProfile"
  "-ExecutionPolicy", "Bypass"
  "-File", "`"$monitorScript`""
  "-StatePath", "`"$StatePath`""
  "-JobId", "`"$JobId`""
  "-AckPath", "`"$AckPath`""
)

$monitor = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Normal -PassThru
if (-not $monitor) {
  throw "Bridge monitor process did not start"
}
