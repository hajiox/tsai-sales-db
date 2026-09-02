param(
  [string]$InstallDir = "",
  [string]$UserId = "",
  [ValidatePattern("^[a-z0-9][a-z0-9-]{0,39}$")][string]$RuntimeName = "ai-01",
  [string]$TaskName = "TSA Codex Bridge (AI 1)"
)

$ErrorActionPreference = "Stop"
if (-not $InstallDir) { $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$startScript = Join-Path $InstallDir "start-bridge-prelogin.ps1"
$runtimeDir = Join-Path (Join-Path $InstallDir "workers") $RuntimeName
$configPath = Join-Path $runtimeDir "bridge.config.json"
if (-not $UserId -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  try {
    $storedConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $UserId = [string]$storedConfig.windowsUserId
  } catch {
    # The guarded registration block below reports an unreadable config.
  }
}
if (-not $UserId) { $UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name }
$statusPath = Join-Path $runtimeDir "task-registration.json"
function Write-RegistrationStatus([string]$Status, [string]$Message) {
  $payload = @{
    status = $Status
    message = $Message
    taskName = $TaskName
    runtimeName = $RuntimeName
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
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" -RuntimeName $RuntimeName"
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

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $description = "TSA Codex Bridge worker: $([string]$config.workerName). Browserless allow-listed jobs only."
  $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description
  Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

  $registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  if ($registered.Principal.LogonType -ne "S4U") {
    throw "ログイン前タスクをS4Uとして登録できませんでした。"
  }
  Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-RegistrationStatus -Status "registered" -Message "S4U / AtStartupで登録し、起動要求を送信しました。"
  Write-Output "Registered: $TaskName ($RuntimeName / $UserId / S4U / AtStartup)"
} catch {
  $detail = "{0}`n{1}" -f $_.Exception.Message, $_.ScriptStackTrace
  Write-RegistrationStatus -Status "failed" -Message $detail
  throw
}
