param(
    [ValidateSet('daily_data','manual_test')][string]$BackupType = 'daily_data',
    [switch]$TestMode,
    [string]$ConfigPath = 'C:\ProgramData\TSA-Backup\backup.config.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Backup.Common.ps1')

$config = Get-TsaBackupConfig -Path $ConfigPath
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$runId = '{0}-{1}' -f $BackupType, (Get-Date -Format 'yyyyMMddTHHmmss')
$workRoot = Join-Path $config.WorkRoot $runId
$plainRoot = Join-Path $workRoot 'plain'
$protectedRoot = Join-Path $workRoot 'protected'
$nasDestination = Join-Path (Join-Path $config.NasRoot 'daily') (Join-Path (Get-Date -Format 'yyyy') (Join-Path (Get-Date -Format 'yyyy-MM-dd') $runId))
$cloudDestination = Join-Path (Join-Path $config.CloudRoot 'daily') (Join-Path (Get-Date -Format 'yyyy') (Join-Path (Get-Date -Format 'yyyy-MM-dd') $runId))
$databaseChecks = @{}
$details = @{ mode = $(if ($TestMode) { 'test' } else { 'full' }); encrypted = $true; hmac = 'HMAC-SHA256'; retentionDays = 30 }
$warnings = New-Object System.Collections.Generic.List[string]
$finalStatus = 'failed'
$totalBytes = 0L
$fileCount = 0
$cloudCopied = $false

$history = @{
    runId = $runId; backupType = $BackupType; status = 'running'; workerId = 'tsa-office-01'
    hostName = $env:COMPUTERNAME; startedAt = $startedAt; completedAt = $null
    bytesTotal = 0; fileCount = 0; nasPath = $nasDestination; cloudPath = $cloudDestination
    usbPath = $config.UsbRoot; databaseChecks = @{}; details = $details; errorMessage = $null
}

New-Item -ItemType Directory -Path $plainRoot, $protectedRoot -Force | Out-Null
Write-TsaBackupLog -Config $config -Message "開始 $runId"
Send-TsaBackupHistory -Config $config -Payload $history | Out-Null

try {
    $dbDir = Join-Path $plainRoot 'databases'
    New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
    $sqliteJobs = @(
        @{ Name = 'doc-scanner'; Source = 'C:\作業用\doc-scanner\data\documents.db'; Destination = (Join-Path $dbDir 'doc-scanner-documents.db'); ModuleRoot = 'C:\作業用\doc-scanner' },
        @{ Name = 'yamato-analytics'; Source = 'C:\作業用\yamato-analytics\data\analytics.db'; Destination = (Join-Path $dbDir 'yamato-analytics.db'); ModuleRoot = 'C:\作業用\yamato-analytics' }
    )
    foreach ($job in $sqliteJobs) {
        $resultJson = & node.exe $config.SqliteBackupHelper $job.Source $job.Destination $job.ModuleRoot
        if ($LASTEXITCODE -ne 0) { throw "SQLiteバックアップ失敗: $($job.Name)" }
        $result = $resultJson | ConvertFrom-Json
        $databaseChecks[$job.Name] = @{ quickCheck = $result.quickCheck; bytes = $result.bytes }
    }

    $databaseUrl = Get-TsaEnvValue -Path 'C:\作業用\tsai-sales-db\.env.local' -Name 'DATABASE_URL'
    if ($databaseUrl -and (Test-Path -LiteralPath $config.PgDumpPath)) {
        $pgPath = Join-Path $dbDir 'tsa-supabase.dump'
        & $config.PgDumpPath --format=custom --no-owner --no-privileges --file=$pgPath --dbname=$databaseUrl
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pgPath)) { throw 'TSA Supabaseのpg_dumpに失敗しました。' }
        $databaseChecks['tsa-supabase'] = @{ pgDump = 'ok'; bytes = (Get-Item -LiteralPath $pgPath).Length }
    } else {
        $warnings.Add('TSA Supabaseのpg_dumpを実行できませんでした。')
        $databaseChecks['tsa-supabase'] = @{ pgDump = 'skipped' }
    }

    $archives = New-Object System.Collections.Generic.List[object]
    $dbArchive = Join-Path $plainRoot 'databases.tar.gz'
    New-TsaTarArchive -OutputPath $dbArchive -BasePath $plainRoot -Items @('databases')
    $archives.Add([pscustomobject]@{ Name = 'databases'; Path = $dbArchive })

    if (-not $TestMode) {
        $codeArchive = Join-Path $plainRoot 'application-source.tar.gz'
        New-TsaTarArchive -OutputPath $codeArchive -BasePath 'C:\作業用' -Items @('doc-scanner','tsai-sales-db','ts-groupware','yamato-analytics') -Excludes @(
            '*/node_modules/*','*/.next/*','*/data/*','*/tmp/*','*/backups/*','*/.codex-tmp/*','*.log','*.tsbuildinfo'
        )
        $archives.Add([pscustomobject]@{ Name = 'application-source'; Path = $codeArchive })

        $docDataArchive = Join-Path $plainRoot 'doc-scanner-data.tar.gz'
        New-TsaTarArchive -OutputPath $docDataArchive -BasePath 'C:\作業用\doc-scanner' -Items @('data') -Excludes @(
            'data/*.db','data/*.db-shm','data/*.db-wal','data/backups/*','data/tmp/*'
        )
        $archives.Add([pscustomobject]@{ Name = 'doc-scanner-data'; Path = $docDataArchive })

        $yamatoDataArchive = Join-Path $plainRoot 'yamato-analytics-data.tar.gz'
        New-TsaTarArchive -OutputPath $yamatoDataArchive -BasePath 'C:\作業用\yamato-analytics' -Items @('data') -Excludes @(
            'data/*.db','data/*.db-shm','data/*.db-wal','data/backups/*'
        )
        $archives.Add([pscustomobject]@{ Name = 'yamato-analytics-data'; Path = $yamatoDataArchive })

        $codexArchive = Join-Path $plainRoot 'codex-core-state.tar.gz'
        New-TsaTarArchive -OutputPath $codexArchive -BasePath 'C:\Users\ts' -Items @('.codex') -Excludes @(
            '.codex/sessions/*','.codex/archived_sessions/*','.codex/plugins/*','.codex/cache/*','.codex/.tmp/*',
            '.codex/.sandbox-bin/*','.codex/logs_2.sqlite*','.codex/vendor_imports/*'
        )
        $archives.Add([pscustomobject]@{ Name = 'codex-core-state'; Path = $codexArchive })

        if ((Get-Date).DayOfWeek -eq [DayOfWeek]::Sunday) {
            $sessionArchive = Join-Path $plainRoot 'codex-sessions-weekly.tar.gz'
            New-TsaTarArchive -OutputPath $sessionArchive -BasePath 'C:\Users\ts\.codex' -Items @('sessions','archived_sessions')
            $archives.Add([pscustomobject]@{ Name = 'codex-sessions-weekly'; Path = $sessionArchive })
            $details.codexSessions = 'weekly-included'
        }
    }

    $manifestFiles = New-Object System.Collections.Generic.List[object]
    foreach ($archive in $archives) {
        $destination = Join-Path $protectedRoot ("{0}.tar.gz.tsaenc" -f $archive.Name)
        $protected = Protect-TsaFile -Source $archive.Path -Destination $destination -KeyPath $config.KeyPath
        if (-not (Test-TsaProtectedFile -Path $protected.File -KeyPath $config.KeyPath)) { throw "暗号化後の検証に失敗しました: $($archive.Name)" }
        $manifestFiles.Add([pscustomobject]@{
            name = $archive.Name; file = (Split-Path -Leaf $protected.File); bytes = $protected.Bytes
            sha256 = (Get-FileHash -LiteralPath $protected.File -Algorithm SHA256).Hash.ToLowerInvariant(); hmac = $protected.Hmac
        })
        $totalBytes += $protected.Bytes
        $fileCount += 1
    }

    $manifest = [ordered]@{
        format = 'tsa-backup-manifest-v1'; runId = $runId; backupType = $BackupType; hostName = $env:COMPUTERNAME
        startedAt = $startedAt; completedAt = (Get-Date).ToUniversalTime().ToString('o')
        databaseChecks = $databaseChecks; files = $manifestFiles; warnings = $warnings; details = $details
    }
    $manifestPath = Join-Path $protectedRoot 'manifest.json'
    $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    New-Item -ItemType Directory -Path $nasDestination -Force | Out-Null
    foreach ($file in $manifestFiles) { Copy-TsaVerifiedFile -Source (Join-Path $protectedRoot $file.file) -DestinationDirectory $nasDestination | Out-Null }
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $nasDestination 'manifest.json') -Force

    try {
        New-Item -ItemType Directory -Path $cloudDestination -Force | Out-Null
        foreach ($file in $manifestFiles) { Copy-TsaVerifiedFile -Source (Join-Path $protectedRoot $file.file) -DestinationDirectory $cloudDestination | Out-Null }
        Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $cloudDestination 'manifest.json') -Force
        $cloudCopied = $true
    } catch {
        $warnings.Add("Google Driveコピー失敗: $($_.Exception.Message)")
        Write-TsaBackupLog -Config $config -Level WARN -Message $warnings[$warnings.Count - 1]
    }

    Remove-TsaOldGenerations -Root (Join-Path $config.NasRoot 'daily') -Keep 30
    try { Remove-TsaOldGenerations -Root (Join-Path $config.CloudRoot 'daily') -Keep 30 } catch { $warnings.Add("Google Drive世代整理失敗: $($_.Exception.Message)") }

    if (Test-Path -LiteralPath $config.UsbRoot) {
        $statusText = @(
            'TSA PC BACKUP STATUS', "Run: $runId", "Status: $(if ($warnings.Count) { 'WARNING' } else { 'SUCCESS' })",
            "Completed: $($manifest.completedAt)", "NAS: $nasDestination", "Google Drive: $cloudDestination"
        ) -join [Environment]::NewLine
        Set-Content -LiteralPath (Join-Path $config.UsbRoot 'LATEST_BACKUP_STATUS.txt') -Value $statusText -Encoding UTF8
    } else { $warnings.Add('復旧USBが接続されていません。') }

    $manifest.warnings = @($warnings)
    $manifest.details = $details
    $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $nasDestination 'manifest.json') -Force
    if (Test-Path -LiteralPath $cloudDestination) {
        try { Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $cloudDestination 'manifest.json') -Force }
        catch { Write-TsaBackupLog -Config $config -Level WARN -Message "Google Driveマニフェスト更新失敗: $($_.Exception.Message)" }
    }

    $finalStatus = if ($warnings.Count) { 'warning' } else { 'success' }
    $history.status = $finalStatus
    $history.completedAt = $manifest.completedAt
    $history.bytesTotal = $totalBytes
    $history.fileCount = $fileCount
    $history.cloudPath = $(if ($cloudCopied) { $cloudDestination } else { $null })
    $history.databaseChecks = $databaseChecks
    $details.warnings = @($warnings)
    $history.details = $details
    Send-TsaBackupHistory -Config $config -Payload $history | Out-Null
    Write-TsaBackupLog -Config $config -Message "完了 $runId status=$finalStatus files=$fileCount bytes=$totalBytes"
} catch {
    $history.status = 'failed'
    $history.completedAt = (Get-Date).ToUniversalTime().ToString('o')
    $history.databaseChecks = $databaseChecks
    $history.errorMessage = $_.Exception.Message
    Send-TsaBackupHistory -Config $config -Payload $history | Out-Null
    Write-TsaBackupLog -Config $config -Level ERROR -Message "失敗 $runId $($_.Exception.Message)"
    throw
} finally {
    if (Test-Path -LiteralPath $workRoot) { Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
