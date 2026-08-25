param(
  [string]$InstallDir = "",
  [string]$UserId = "",
  [string]$TaskName = "TSA Codex Bridge (Pre-login)"
)

$ErrorActionPreference = "Stop"
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$startScript = Join-Path $InstallDir "start-bridge-prelogin.ps1"
$configPath = Join-Path (Join-Path $InstallDir "headless") "bridge.config.json"
if (-not $UserId -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  try {
    $storedConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $UserId = [string]$storedConfig.windowsUserId
  } catch {
    # The guarded registration block below reports an unreadable config.
  }
}
if (-not $UserId) { $UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name }
$statusPath = Join-Path (Join-Path $InstallDir "headless") "task-registration.json"
function Write-RegistrationStatus([string]$Status, [string]$Message) {
  $payload = @{
    status = $Status
    message = $Message
    taskName = $TaskName
    userId = $UserId
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText($statusPath, $payload, [System.Text.UTF8Encoding]::new($false))
}

try {
  if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw "ログイン前Bridge起動スクリプトがありません: $startScript"
  }
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "ログイン前Bridge設定がありません: $configPath"
  }

  $powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
  $action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $InstallDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType S4U -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

  $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description "Windowsログイン前からTSAのブラウザ不要Codexジョブだけを処理します。Chrome必須ジョブは取得しません。"
  Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

  $registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  if ($registered.Principal.LogonType -ne "S4U") {
    throw "ログイン前タスクをS4Uとして登録できませんでした。"
  }
  Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-RegistrationStatus -Status "registered" -Message "S4U / AtStartupで登録し、起動要求を送信しました。"
  Write-Output "Registered: $TaskName ($UserId / S4U / AtStartup)"
} catch {
  $detail = "{0}`n{1}" -f $_.Exception.Message, $_.ScriptStackTrace
  Write-RegistrationStatus -Status "failed" -Message $detail
  throw
}
