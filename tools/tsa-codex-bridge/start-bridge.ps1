$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "TSA Codex Bridge"
$node = (Get-Command node -ErrorAction Stop).Source
$bridge = Join-Path $installDir "bridge.mjs"

while ($true) {
  & $node $bridge
  Start-Sleep -Seconds 15
}
