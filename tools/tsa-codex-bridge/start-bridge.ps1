$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "TSA Codex Bridge"
$node = (Get-Command node -ErrorAction Stop).Source
$bridge = Join-Path $installDir "bridge.mjs"

while ($true) {
  while (Test-Path -LiteralPath (Join-Path $installDir "bridge-maintenance.lock")) {
    Start-Sleep -Milliseconds 250
  }
  & $node $bridge
  Start-Sleep -Seconds 15
}
