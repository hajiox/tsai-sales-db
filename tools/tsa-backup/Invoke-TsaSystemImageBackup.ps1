param([string]$ConfigPath = 'C:\ProgramData\TSA-Backup\backup.config.json')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$config = Get-TsaBackupConfig -Path $ConfigPath
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$runId = 'weekly_system_image-{0}' -f (Get-Date -Format 'yyyyMMddTHHmmss')
$slot = if ([int](Get-Date -UFormat %V) % 2 -eq 0) { 'slot-A' } else { 'slot-B' }
$target = Join-Path (Join-Path $config.NasRoot 'system-image') $slot
$history = @{
    runId=$runId; backupType='weekly_system_image'; status='running'; workerId='tsa-office-01'; hostName=$env:COMPUTERNAME
    startedAt=$startedAt; completedAt=$null; bytesTotal=0; fileCount=0; nasPath=$target; cloudPath=$null
    usbPath=$config.UsbRoot; databaseChecks=@{}; details=@{ slot=$slot; tool='wbadmin'; includes='C:,allCritical' }; errorMessage=$null
}
Send-TsaBackupHistory -Config $config -Payload $history | Out-Null
Write-TsaBackupLog -Config $config -Message "システムイメージ開始 $runId target=$target"
try {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    & wbadmin.exe start backup "-backupTarget:$target" '-include:C:' -allCritical -vssCopy -quiet
    if ($LASTEXITCODE -ne 0) { throw "wbadminが終了コード$LASTEXITCODEを返しました。" }
    $history.status = 'success'
    $history.completedAt = (Get-Date).ToUniversalTime().ToString('o')
    $history.fileCount = (Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    $history.bytesTotal = [int64](Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    Send-TsaBackupHistory -Config $config -Payload $history | Out-Null
    Write-TsaBackupLog -Config $config -Message "システムイメージ完了 $runId"
} catch {
    $history.status = 'failed'; $history.completedAt = (Get-Date).ToUniversalTime().ToString('o'); $history.errorMessage = $_.Exception.Message
    Send-TsaBackupHistory -Config $config -Payload $history | Out-Null
    Write-TsaBackupLog -Config $config -Level ERROR -Message "システムイメージ失敗 $runId $($_.Exception.Message)"
    throw
}
