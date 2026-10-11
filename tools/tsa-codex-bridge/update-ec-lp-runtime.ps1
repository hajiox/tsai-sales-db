param(
    [string]$SourceDir = $PSScriptRoot,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$installDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'TSA Codex Bridge'))
$skillDir = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.codex\skills\update-aizu-ec-prices'))
$sourceRoot = (Resolve-Path -LiteralPath $SourceDir).Path
$bridgePath = Join-Path $installDir 'bridge.mjs'
$startPath = Join-Path $installDir 'start-bridge.ps1'
$maintenancePath = Join-Path $installDir 'bridge-maintenance.lock'
$strictUtf8 = New-Object Text.UTF8Encoding($false, $true)
$nonce = [guid]::NewGuid().ToString('N')
$ownsMaintenance = $false
$copiesStarted = $false
$backupDir = $null

function Assert-PlainPath([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if ($full -ne $base -and -not $full.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing a path outside the fixed runtime or Skill directory.'
    }
    $cursor = $full
    while ($cursor -and $cursor.Length -ge $base.Length) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Runtime and Skill paths must not contain junctions or symbolic links.'
            }
        }
        if ($cursor -eq $base) { break }
        $cursor = Split-Path -Parent $cursor
    }
    return $full
}
function Read-Text([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        $reader = New-Object IO.StreamReader($stream, $strictUtf8, $false)
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
}
function Read-Json([string]$Path) { return (Read-Text $Path) | ConvertFrom-Json }
function File-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
function Read-Worker($Spec, [switch]$RequireIdle, [switch]$RequireMaintenance) {
    $state = Read-Json $Spec.State
    if (-not $state.pid -or $state.workerId -ne $Spec.WorkerId -or $state.workerRole -ne $Spec.Role -or
        [string]$state.version -ne '1.9.101' -or
        [DateTimeOffset]::Parse([string]$state.updatedAt).UtcDateTime -lt [DateTime]::UtcNow.AddSeconds(-90)) {
        throw "Worker identity or heartbeat is invalid: $($Spec.Name)"
    }
    if ($RequireIdle -and $state.currentJobId) { throw "Worker is busy: $($Spec.Name)" }
    if ($RequireMaintenance -and [string]$state.maintenanceObserved -cne $nonce) {
        throw "Worker has not acknowledged this maintenance: $($Spec.Name)"
    }
    $workerPid = [int]$state.pid
    if ([int]((Read-Text $Spec.Lock).Trim()) -ne $workerPid) { throw 'Worker state and lock disagree.' }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid"
    if (-not $process -or $process.Name -ne 'node.exe' -or -not $process.CreationDate -or
        $process.CreationDate.ToUniversalTime() -gt [DateTimeOffset]::Parse([string]$state.updatedAt).UtcDateTime.AddSeconds(5) -or
        (($Spec.Name -eq 'interactive' -or $process.CommandLine) -and
            [string]$process.CommandLine -notmatch ('(?:^|[\s"])' + [regex]::Escape($bridgePath) + '(?:[\s"]|$)'))) {
        throw "Worker process identity is invalid: $($Spec.Name)"
    }
    return [pscustomobject]@{ State = $state; Process = $process }
}
function Assert-Interactive($Worker, [int]$ExpectedParent) {
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($Worker.Process.ParentProcessId)"
    if (-not $parent -or $parent.Name -notin @('powershell.exe', 'pwsh.exe') -or
        ($ExpectedParent -and [int]$parent.ProcessId -ne $ExpectedParent) -or
        [string]$parent.CommandLine -notmatch ('(?:^|[\s"])' + [regex]::Escape($startPath) + '(?:[\s"]|$)') -or
        $parent.CreationDate -gt $Worker.Process.CreationDate) { throw 'The existing interactive supervisor could not be verified.' }
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($Worker.Process.ProcessId)")
    if ($children.Count -ne 0) { throw 'The interactive worker still has child processes; no process was stopped.' }
    return [int]$parent.ProcessId
}
function Assert-RecordedSupervisor($Worker) {
    $parentPid = [int]$Worker.Process.ParentProcessId
    if (-not $supervisors.ContainsKey($parentPid)) { throw 'The new worker has an unknown supervisor.' }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $parentPid"
    if (-not $parent -or $parent.Name -notin @('powershell.exe', 'pwsh.exe') -or
        $parent.CreationDate -ne $supervisors[$parentPid] -or
        $parent.CreationDate -gt $Worker.Process.CreationDate -or
        [string]$parent.CommandLine -notmatch ('(?:^|[\s"])' + [regex]::Escape($startPath) + '(?:[\s"]|$)')) {
        throw 'A recorded supervisor identity changed.'
    }
    return $parentPid
}
function Assert-ConfigHashes {
    foreach ($spec in $workers) {
        if ((File-Hash $spec.Config) -cne $spec.ConfigHash) { throw 'An existing worker config changed during maintenance.' }
    }
}
function Release-OwnedMaintenance {
    if ($ownsMaintenance -and (Test-Path -LiteralPath $maintenancePath) -and
        (Read-Text $maintenancePath) -ceq $nonce) {
        Remove-Item -LiteralPath $maintenancePath -Force
    }
}

foreach ($path in @($installDir, $bridgePath, $startPath, $maintenancePath)) { Assert-PlainPath $path $installDir | Out-Null }
Assert-PlainPath $skillDir $skillDir | Out-Null
if (Test-Path -LiteralPath $maintenancePath) { throw 'Existing maintenance is active; nothing was changed.' }
$files = @(
    @{ Relative = 'bridge.mjs'; Source = (Join-Path $sourceRoot 'bridge.mjs'); Target = $bridgePath },
    @{ Relative = 'Skill-SKILL.md'; Source = (Join-Path $sourceRoot 'skills\update-aizu-ec-prices\SKILL.md'); Target = (Join-Path $skillDir 'SKILL.md') },
    @{ Relative = 'Skill-lp-workflow.md'; Source = (Join-Path $sourceRoot 'skills\update-aizu-ec-prices\references\lp-workflow.md'); Target = (Join-Path $skillDir 'references\lp-workflow.md') },
    @{ Relative = 'Skill-find-lp-source.ps1'; Source = (Join-Path $sourceRoot 'skills\update-aizu-ec-prices\scripts\find-lp-source.ps1'); Target = (Join-Path $skillDir 'scripts\find-lp-source.ps1') }
)
foreach ($file in $files) {
    Assert-PlainPath $file.Source $sourceRoot | Out-Null
    Assert-PlainPath $file.Target $(if ($file.Relative -eq 'bridge.mjs') { $installDir } else { $skillDir }) | Out-Null
    if (-not (Test-Path -LiteralPath $file.Source -PathType Leaf) -or -not (Test-Path -LiteralPath $file.Target -PathType Leaf)) {
        throw 'A required source or installed file is missing.'
    }
    $file.SourceHash = File-Hash $file.Source
    $file.OldHash = File-Hash $file.Target
}
foreach ($path in @($files[0].Source, $bridgePath)) {
    if ([IO.File]::ReadAllText($path) -notmatch 'const VERSION = "1\.9\.101";') { throw 'This targeted updater requires Bridge version 1.9.101.' }
}
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
& $node --check $files[0].Source
if ($LASTEXITCODE -ne 0) { throw 'Source bridge.mjs failed node --check.' }
$workers = @()
foreach ($name in @('interactive', 'ai-01', 'ai-02', 'analysis-01')) {
    $runtime = if ($name -eq 'interactive') { $installDir } else { Join-Path $installDir "workers\$name" }
    $spec = @{ Name = $name; Config = (Join-Path $runtime 'bridge.config.json'); State = (Join-Path $runtime 'bridge-state.json'); Lock = (Join-Path $runtime 'bridge.lock') }
    foreach ($path in @($spec.Config, $spec.State, $spec.Lock)) { Assert-PlainPath $path $installDir | Out-Null }
    $config = Read-Json $spec.Config
    $spec.WorkerId = [string]$config.workerId
    $spec.Role = if ($name -eq 'interactive') { 'interactive' } elseif ($name -eq 'analysis-01') { 'analysis' } else { 'ai-generation' }
    if (-not $spec.WorkerId -or $config.workerRole -ne $spec.Role -or
        [IO.Path]::GetFullPath([string]$config.codexHome) -ne (Split-Path -Parent (Split-Path -Parent $skillDir))) {
        throw 'Worker role or installed Skill location does not match this targeted updater.'
    }
    $spec.ConfigHash = File-Hash $spec.Config
    $worker = Read-Worker $spec -RequireIdle
    $spec.Pid = [int]$worker.State.pid
    $spec.CreatedAt = $worker.Process.CreationDate
    $workers += $spec
}
if (@($workers.Pid | Select-Object -Unique).Count -ne 4) { throw 'Four distinct verified workers are required.' }
$supervisorPid = Assert-Interactive (Read-Worker $workers[0] -RequireIdle) 0
# Pre-existing duplicate supervisors can race to acquire the one worker lock.
$supervisors = @{}
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'")) {
    if ($process.CreationDate -and [string]$process.CommandLine -match ('(?:^|[\s"])' + [regex]::Escape($startPath) + '(?:[\s"]|$)')) {
        $supervisors[[int]$process.ProcessId] = $process.CreationDate
    }
}
Assert-RecordedSupervisor (Read-Worker $workers[0] -RequireIdle) | Out-Null
if ($DryRun) {
    [pscustomobject]@{ dry_run = $true; version = '1.9.101'; files = $files.Count; interactive_pid = $workers[0].Pid; supervisor_pid = $supervisorPid; recorded_supervisor_pids = @($supervisors.Keys | Sort-Object); headless_pids = @($workers[1..3].Pid); configs_preserved = $true } | ConvertTo-Json -Compress
    return
}

try {
    $stream = New-Object IO.FileStream($maintenancePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = $strictUtf8.GetBytes($nonce); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $ownsMaintenance = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $ready = $true
        foreach ($spec in $workers) {
            try {
                $worker = Read-Worker $spec -RequireIdle -RequireMaintenance
                if ([int]$worker.State.pid -ne $spec.Pid -or $worker.Process.CreationDate -ne $spec.CreatedAt) { throw 'Worker identity changed.' }
            } catch { $ready = $false }
        }
        if ($ready) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'All four workers did not acknowledge idle maintenance within 30 seconds; no files or processes were changed.' }
    Assert-ConfigHashes
    $backupDir = Assert-PlainPath (Join-Path $installDir ('backups\ec-lp-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmss') + '-' + $nonce)) $installDir
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    foreach ($file in $files) {
        if ((File-Hash $file.Source) -cne $file.SourceHash -or (File-Hash $file.Target) -cne $file.OldHash) { throw 'Source or installed files changed during validation.' }
        $file.Backup = Assert-PlainPath (Join-Path $backupDir $file.Relative) $installDir
        [IO.File]::Copy($file.Target, $file.Backup, $false)
        if ((File-Hash $file.Backup) -cne $file.OldHash) { throw 'A runtime backup did not verify.' }
    }
    $interactive = Read-Worker $workers[0] -RequireIdle -RequireMaintenance
    if ([int]$interactive.State.pid -ne $workers[0].Pid -or $interactive.Process.CreationDate -ne $workers[0].CreatedAt) { throw 'Interactive process identity changed before stop.' }
    Assert-Interactive $interactive $supervisorPid | Out-Null
    Assert-RecordedSupervisor $interactive | Out-Null
    Assert-ConfigHashes
    Stop-Process -Id $workers[0].Pid -Force -ErrorAction Stop
    $stopDeadline = [DateTime]::UtcNow.AddSeconds(5)
    while ((Get-Process -Id $workers[0].Pid -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $stopDeadline) { Start-Sleep -Milliseconds 100 }
    if (Get-Process -Id $workers[0].Pid -ErrorAction SilentlyContinue) { throw 'The verified idle interactive process did not stop.' }
    $copiesStarted = $true
    foreach ($file in $files) {
        [IO.File]::Copy($file.Source, $file.Target, $true)
        if ((File-Hash $file.Target) -cne $file.SourceHash) { throw 'An installed file did not match the validated source.' }
    }
    Assert-ConfigHashes
} catch {
    if ($copiesStarted) {
        try {
            foreach ($file in $files) { [IO.File]::Copy($file.Backup, $file.Target, $true) }
            foreach ($file in $files) { if ((File-Hash $file.Target) -cne $file.OldHash) { throw 'Rollback hash mismatch.' } }
        } catch {
            $ownsMaintenance = $false
            throw 'Runtime rollback did not verify; maintenance remains locked. Inspect the preserved backup before removing the lock.'
        }
    }
    throw
} finally {
    $releasedAt = [DateTime]::UtcNow
    Release-OwnedMaintenance
}

$deadline = $releasedAt.AddSeconds(45)
$newWorker = $null
do {
    try {
        $candidate = Read-Worker $workers[0]
        if ([int]$candidate.State.pid -eq $workers[0].Pid -or $candidate.Process.CreationDate.ToUniversalTime() -lt $releasedAt -or
            [DateTimeOffset]::Parse([string]$candidate.State.updatedAt).UtcDateTime -lt $releasedAt) { throw 'Waiting for a new interactive heartbeat.' }
        $activatedSupervisorPid = Assert-RecordedSupervisor $candidate
        $newWorker = $candidate
    } catch { Start-Sleep -Milliseconds 250 }
} while (-not $newWorker -and [DateTime]::UtcNow -lt $deadline)
if (-not $newWorker) { throw 'Files were updated, but the existing supervisor did not publish a new verified interactive heartbeat within 45 seconds.' }
Assert-ConfigHashes
foreach ($spec in $workers[1..3]) {
    $headless = Read-Worker $spec
    if ([int]$headless.State.pid -ne $spec.Pid -or $headless.Process.CreationDate -ne $spec.CreatedAt) { throw 'A headless worker identity changed during the targeted update.' }
}
foreach ($file in $files) { if ((File-Hash $file.Target) -cne $file.SourceHash) { throw 'Final installed file verification failed.' } }
[pscustomobject]@{ updated = $true; version = '1.9.101'; interactive_pid = [int]$newWorker.State.pid; supervisor_pid = $activatedSupervisorPid; headless_pids = @($workers[1..3].Pid); configs_preserved = $true; backup_directory = $backupDir } | ConvertTo-Json -Compress
