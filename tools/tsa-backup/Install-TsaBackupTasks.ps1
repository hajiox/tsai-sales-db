param(
    [string]$NasRoot = '\\tshdd\disk\NEW\TSA-PC-Backup',
    [string]$CloudRoot = 'G:\マイドライブ\TSA-PC-Backup',
    [string]$UsbDrive = 'D:',
    [switch]$SkipCredentialPrompt,
    [switch]$RunTestBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'このインストーラーは管理者PowerShellで実行してください。'
}

$sourceRoot = $PSScriptRoot
$programRoot = 'C:\ProgramData\TSA-Backup'
$usbRoot = Join-Path $UsbDrive 'TSA-PC-RECOVERY'
$keyPath = Join-Path $programRoot 'backup-aes.key'
$configPath = Join-Path $programRoot 'backup.config.json'
New-Item -ItemType Directory -Path $programRoot, (Join-Path $programRoot 'work'), (Join-Path $programRoot 'logs'), (Join-Path $programRoot 'pending-history') -Force | Out-Null
Start-Transcript -LiteralPath (Join-Path $programRoot 'install-transcript.log') -Append -Force | Out-Null
New-Item -ItemType Directory -Path $NasRoot -Force | Out-Null
try { New-Item -ItemType Directory -Path $CloudRoot -Force | Out-Null }
catch { Write-Warning "Google Driveは現在利用できません。日次処理時に再試行します: $($_.Exception.Message)" }

Copy-Item -LiteralPath (Join-Path $sourceRoot 'Backup.Common.ps1') -Destination $programRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'backup-sqlite.cjs') -Destination $programRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Invoke-TsaDataBackup.ps1') -Destination $programRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Invoke-TsaSystemImageBackup.ps1') -Destination $programRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Invoke-TsaBackupAudit.ps1') -Destination $programRoot -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Restore-TsaPc.ps1') -Destination $programRoot -Force

if (-not (Test-Path -LiteralPath $keyPath)) {
    $key = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($key)
    [IO.File]::WriteAllBytes($keyPath, $key)
}
& icacls.exe $keyPath /inheritance:r /grant:r 'SYSTEM:(R)' "$($env:USERDOMAIN)\$($env:USERNAME):(R)" | Out-Null

$config = [ordered]@{
    Version = 1; ProgramRoot = $programRoot; WorkRoot = (Join-Path $programRoot 'work'); NasRoot = $NasRoot
    CloudRoot = $CloudRoot; UsbRoot = $usbRoot; KeyPath = $keyPath
    BridgeConfigPath = 'C:\Users\ts\AppData\Local\TSA Codex Bridge\bridge.config.json'
    HistoryEndpoint = 'https://v0-tsa-19.vercel.app/api/system/backup/history'
    SqliteBackupHelper = (Join-Path $programRoot 'backup-sqlite.cjs')
    PgDumpPath = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
  }
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding UTF8

if (Test-Path -LiteralPath $UsbDrive) {
    New-Item -ItemType Directory -Path $usbRoot, (Join-Path $usbRoot 'KEYS'), (Join-Path $usbRoot 'TOOLS') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $usbRoot '.tsa-recovery-drive') -Value 'TSA recovery media v1' -Encoding ASCII
    Copy-Item -LiteralPath $keyPath -Destination (Join-Path $usbRoot 'KEYS\backup-aes.key') -Force
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'Backup.Common.ps1') -Destination $usbRoot -Force
    Copy-Item -Path (Join-Path $sourceRoot '*.ps1') -Destination (Join-Path $usbRoot 'TOOLS') -Force
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'backup-sqlite.cjs') -Destination (Join-Path $usbRoot 'TOOLS') -Force
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'Restore-TsaPc.ps1') -Destination $usbRoot -Force
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'README_最初にお読みください.html') -Destination $usbRoot -Force
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'PC復旧手順.md') -Destination $usbRoot -Force
}

if (-not $SkipCredentialPrompt) {
    $credential = Get-Credential -UserName "$($env:USERDOMAIN)\$($env:USERNAME)" -Message 'PCがログイン画面でも実行するため、Windowsログイン用パスワードを入力してください。保存されるのはタスクスケジューラ内だけです。'
    if (-not $credential) { throw '資格情報が入力されませんでした。' }
    $user = $credential.UserName
    $password = $credential.GetNetworkCredential().Password
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 12) -MultipleInstances IgnoreNew
    $dailyTrigger = New-ScheduledTaskTrigger -Daily -At '01:30'
    $weeklyTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:00'
    $auditTrigger = New-ScheduledTaskTrigger -Daily -At '06:30'
    $dailyAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\TSA-Backup\Invoke-TsaDataBackup.ps1"'
    $weeklyAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\TSA-Backup\Invoke-TsaSystemImageBackup.ps1"'
    $auditAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\TSA-Backup\Invoke-TsaBackupAudit.ps1"'
    Register-ScheduledTask -TaskName 'TSA Nightly Data Backup' -Action $dailyAction -Trigger $dailyTrigger -Settings $settings -User $user -Password $password -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'TSA Weekly System Image Backup' -Action $weeklyAction -Trigger $weeklyTrigger -Settings $settings -User $user -Password $password -RunLevel Highest -Force | Out-Null
    Register-ScheduledTask -TaskName 'TSA Backup Audit' -Action $auditAction -Trigger $auditTrigger -Settings $settings -User $user -Password $password -RunLevel Highest -Force | Out-Null
    $password = $null
}

if ($RunTestBackup) {
    & (Join-Path $programRoot 'Invoke-TsaDataBackup.ps1') -BackupType manual_test -TestMode -ConfigPath $configPath
}

$taskState = @('TSA Nightly Data Backup','TSA Weekly System Image Backup','TSA Backup Audit') | ForEach-Object {
    $task = Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue
    [ordered]@{ Name = $_; Installed = [bool]$task; State = $(if ($task) { [string]$task.State } else { 'Missing' }) }
}
[ordered]@{
    InstalledAt = (Get-Date).ToUniversalTime().ToString('o'); Computer = $env:COMPUTERNAME; NasRoot = $NasRoot
    CloudRoot = $CloudRoot; UsbRoot = $usbRoot; Tasks = $taskState
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $programRoot 'installation-status.json') -Encoding UTF8

Write-Host 'TSAバックアップのセットアップが完了しました。' -ForegroundColor Green
Write-Host '日次データ: 毎日 01:30 / システムイメージ: 日曜 03:00 / 監査: 毎日 06:30'
Stop-Transcript | Out-Null
