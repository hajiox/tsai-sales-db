param([string]$ConfigPath = 'C:\ProgramData\TSA-Backup\backup.config.json')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$config = Get-TsaBackupConfig -Path $ConfigPath
Send-TsaPendingHistory -Config $config

$manifests = Get-ChildItem -LiteralPath (Join-Path $config.NasRoot 'daily') -Filter 'manifest.json' -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if (-not $manifests) {
    Write-TsaBackupLog -Config $config -Level ERROR -Message '監査対象の日次バックアップがありません。'
    exit 2
}

$manifestPath = $manifests[0].FullName
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$folder = Split-Path -Parent $manifestPath
$nasDailyRoot = Join-Path $config.NasRoot 'daily'
$relativeFolder = $folder.Substring($nasDailyRoot.Length).TrimStart('\')
$cloudFolder = Join-Path (Join-Path $config.CloudRoot 'daily') $relativeFolder
$failed = New-Object System.Collections.Generic.List[string]
$bytes = 0L
foreach ($file in $manifest.files) {
    $path = Join-Path $folder $file.file
    if (-not (Test-TsaProtectedFile -Path $path -KeyPath $config.KeyPath)) { $failed.Add([string]$file.name) }
    elseif ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$file.sha256) { $failed.Add([string]$file.name) }
    else { $bytes += (Get-Item -LiteralPath $path).Length }
}

$status = if ($failed.Count) { 'failed' } elseif (@($manifest.warnings).Count) { 'warning' } else { 'success' }
$details = @{}
if ($manifest.details) {
    $manifest.details.psobject.Properties | ForEach-Object { $details[$_.Name] = $_.Value }
}
$details.auditVerifiedAt = (Get-Date).ToUniversalTime().ToString('o')
$details.auditSource = $folder
$details.verifiedFiles = @($manifest.files).Count - $failed.Count
$details.failedFiles = @($failed)
$details.sourceWarnings = @($manifest.warnings)
$details.encrypted = $true
$payload = @{
    runId = [string]$manifest.runId; backupType = [string]$manifest.backupType; status = $status; workerId = 'tsa-office-01'
    hostName = [string]$manifest.hostName; startedAt = [string]$manifest.startedAt; completedAt = [string]$manifest.completedAt
    bytesTotal = $bytes; fileCount = @($manifest.files).Count; nasPath = $folder; usbPath = $config.UsbRoot
    databaseChecks = $manifest.databaseChecks; details = $details; errorMessage = $(if ($failed.Count) { "検証失敗: $($failed -join ', ')" } else { $null })
}
if (Test-Path -LiteralPath $cloudFolder) { $payload.cloudPath = $cloudFolder }
Send-TsaBackupHistory -Config $config -Payload $payload | Out-Null

if (Test-Path -LiteralPath $config.UsbRoot) {
    @(
        'TSA PC BACKUP AUDIT', "Run: $($manifest.runId)", "Status: $($status.ToUpperInvariant())",
        "Audited: $($details.auditVerifiedAt)", "Verified files: $($details.verifiedFiles)", "NAS: $folder"
    ) -join [Environment]::NewLine | Set-Content -LiteralPath (Join-Path $config.UsbRoot 'LATEST_BACKUP_STATUS.txt') -Encoding UTF8
}

if ($failed.Count) {
    Write-TsaBackupLog -Config $config -Level ERROR -Message "監査失敗 $($manifest.runId): $($failed -join ', ')"
    exit 3
}
Write-TsaBackupLog -Config $config -Message "監査成功 $($manifest.runId) files=$(@($manifest.files).Count)"
