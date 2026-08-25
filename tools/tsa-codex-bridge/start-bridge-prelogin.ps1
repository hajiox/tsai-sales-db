$ErrorActionPreference = "Stop"
$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $installDir "headless"
$configPath = Join-Path $runtimeDir "bridge.config.json"
$bridgePath = Join-Path $installDir "bridge.mjs"
$maintenancePath = Join-Path $installDir "bridge-maintenance.lock"

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

    # S4U起動では対話ログオン時の環境変数を引き継がないため明示する。
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
    New-Item -ItemType Directory -Path (Join-Path $runtimeDir "logs") -Force | Out-Null
    $line = "{0} PRELOGIN LAUNCH ERROR {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $_.Exception.Message
    Add-Content -LiteralPath (Join-Path $runtimeDir "logs\launcher.log") -Value $line -Encoding UTF8
  }
  Start-Sleep -Seconds 15
}
