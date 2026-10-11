param(
    [Parameter(Mandatory = $true)]
    [string]$LpUrl,

    [string]$WorkspaceRoot = ('C:\' + [char]0x4F5C + [char]0x696D + [char]0x7528),

    [Alias('CloneMissing')]
    [switch]$FreshClone,

    [string]$ExpectedGithubRepository,

    [string]$ExpectedProductionBranch,

    # Read-only evidence search names one known repository/subdirectory.
    [string]$SearchRoot
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
    throw "Workspace root not found: $WorkspaceRoot"
}
$lpUri = $null
if (-not [Uri]::TryCreate($LpUrl, [UriKind]::Absolute, [ref]$lpUri) -or
    $lpUri.Scheme -notin @('https', 'http') -or $lpUri.UserInfo -or
    $lpUri.DnsSafeHost -notmatch '^[A-Za-z0-9.-]+$') {
    throw 'LP URL must be an absolute HTTP(S) URL without embedded credentials.'
}

function Assert-LpSource([string]$Repository, [string]$Branch) {
    if ($Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_][A-Za-z0-9_.-]*$') {
        throw 'The GitHub repository must be an explicit owner/repository value.'
    }
    if ($Branch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$') {
        throw 'An explicit production branch is required; a default branch will not be guessed.'
    }
}

if (($ExpectedGithubRepository -and -not $ExpectedProductionBranch) -or
    ($ExpectedProductionBranch -and -not $ExpectedGithubRepository)) {
    throw 'ExpectedGithubRepository and ExpectedProductionBranch must be specified together.'
}
if ($ExpectedGithubRepository) {
    Assert-LpSource $ExpectedGithubRepository $ExpectedProductionBranch
}

$workspacePath = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
if (-not $FreshClone -and -not $SearchRoot) {
    throw 'Read-only discovery requires -SearchRoot for one known repository/subdirectory. Editing always requires -FreshClone.'
}

function Invoke-LpCli([string]$Command, [string[]]$Arguments) {
    # Use existing authentication; never start interactive login or package installation.
    $environment = @{ CI = '1'; NO_COLOR = '1'; GH_PROMPT_DISABLED = '1'; GIT_TERMINAL_PROMPT = '0' }
    $previousEnvironment = @{}
    foreach ($name in $environment.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process')
    }
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    $stderrFile = [IO.Path]::GetTempFileName()
    try {
        $output = (& $Command @Arguments 2> $stderrFile | Out-String).Trim()
        $code = $LASTEXITCODE
        $errorOutput = [IO.File]::ReadAllText($stderrFile).Trim()
    } finally {
        $ErrorActionPreference = $previousErrorPreference
        foreach ($name in $environment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
        }
        try { [IO.File]::Delete($stderrFile) } catch [IO.IOException] {
            Write-Verbose 'The task-owned CLI stderr file is still in use; it was preserved.'
        } catch [UnauthorizedAccessException] {
            Write-Verbose 'The task-owned CLI stderr file could not be removed; it was preserved.'
        }
    }
    return [pscustomobject]@{ output = $output; error_output = $errorOutput; exit_code = $code }
}

function Resolve-VercelSource([Uri]$Uri) {
    $vercel = Get-Command vercel.cmd, vercel -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $prefix = @()
    if ($null -eq $vercel) {
        $vercel = Get-Command npx.cmd, npx -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $vercel) {
            throw 'An installed Vercel CLI is required when no server-approved LP source is supplied.'
        }
        $prefix = @('--no-install', 'vercel')
    }
    $commandRoot = Join-Path ([IO.Path]::GetTempPath()) ('tsa-lp-source-resolver-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $commandRoot | Out-Null
    Push-Location $commandRoot
    try {
        $account = Invoke-LpCli $vercel.Source ($prefix + @('whoami'))
        if ($account.exit_code -ne 0) {
            throw 'Vercel account check failed. Operator action may be required for login, permission or connectivity; no alternate repository will be used.'
        }
        $domain = Invoke-LpCli $vercel.Source ($prefix + @('domains', 'inspect', $Uri.DnsSafeHost))
        if ($domain.exit_code -ne 0) {
            throw 'Vercel domain inspection failed. Verify the existing account, permission and domain; no alternate repository will be used.'
        }
        $inProjects = $false
        $seenProjectRow = $false
        $projectNames = @()
        foreach ($line in (($domain.output + "`n" + $domain.error_output) -split '\r?\n')) {
            if ($line -match '^\s*Projects\s*$') { $inProjects = $true; continue }
            if (-not $inProjects) { continue }
            if ($seenProjectRow -and [string]::IsNullOrWhiteSpace($line)) { $inProjects = $false; continue }
            $row = [regex]::Match($line, '^\s*(?<project>[A-Za-z0-9._-]+)\s+(?<domains>[^\r\n]+?)\s*$')
            if ($row.Success) {
                if ($row.Groups['project'].Value -eq 'Project' -and $row.Groups['domains'].Value -eq 'Domains') { continue }
                $seenProjectRow = $true
                $aliases = @($row.Groups['domains'].Value.Split(',') | ForEach-Object { $_.Trim() })
                if ($aliases -contains $Uri.DnsSafeHost) { $projectNames += $row.Groups['project'].Value }
            }
        }
        $projects = @($projectNames | Sort-Object -Unique)
        if ($projects.Count -ne 1) {
            throw 'Vercel did not identify exactly one project for the registered LP domain.'
        }
        $projectName = $projects[0]
        $response = Invoke-LpCli $vercel.Source ($prefix + @('api', "/v9/projects/$projectName"))
        if ($response.exit_code -ne 0) {
            throw 'Vercel project lookup failed. Verify the existing account and permission; no alternate repository will be used.'
        }
        try { $project = $response.output | ConvertFrom-Json } catch {
            throw 'Vercel project lookup did not return valid JSON.'
        }
        if ($project.link.type -ne 'github' -or -not $project.link.org -or -not $project.link.repo) {
            throw 'Vercel did not provide a GitHub source. Supply only a server-approved LP source; do not infer one from old clones.'
        }
        $repository = "$($project.link.org)/$($project.link.repo)"
        Assert-LpSource $repository $project.link.productionBranch
        return [pscustomobject]@{
            project = $projectName
            github_repository = $repository
            production_branch = $project.link.productionBranch
        }
    } finally {
        Pop-Location
        # Remove only the empty directory created by this invocation.
        # Vercel may briefly retain its cwd; cleanup must not hide the result.
        try { [IO.Directory]::Delete($commandRoot) } catch [IO.IOException] {
            Write-Verbose 'The task-owned resolver directory is still in use; it was preserved.'
        } catch [UnauthorizedAccessException] {
            Write-Verbose 'The task-owned resolver directory could not be removed; it was preserved.'
        }
    }
}

function Find-LpEvidence([string]$Root, [string]$HostName) {
    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
    if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container) -or
        ((Get-Item -LiteralPath $resolvedRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $resolvedRoot.TrimEnd('\', '/') -eq $workspacePath.TrimEnd('\', '/') -or
        -not $resolvedRoot.StartsWith($workspacePath.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'SearchRoot must be one existing repository/subdirectory inside WorkspaceRoot, not the entire workspace.'
    }
    $excluded = @('.git', 'node_modules', '.next', '.vercel', 'dist', 'build', 'out')
    $extensions = @('.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.html', '.htm', '.json', '.md', '.mdx', '.css', '.scss', '.yaml', '.yml', '.toml', '.vue', '.svelte', '.astro', '.txt')
    $pending = New-Object 'System.Collections.Generic.Queue[object]'
    $pending.Enqueue([pscustomobject]@{ path = $resolvedRoot; depth = 0 })
    $files = New-Object 'System.Collections.Generic.List[string]'
    $entryCount = 0
    while ($pending.Count -gt 0) {
        $directory = $pending.Dequeue()
        foreach ($entry in (Get-ChildItem -LiteralPath $directory.path -Force | Sort-Object Name)) {
            $entryCount++
            if ($entryCount -gt 10000) { throw 'Scoped LP evidence search exceeded 10000 entries; choose a narrower SearchRoot.' }
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            if ($entry.PSIsContainer) {
                if ($entry.Name -in $excluded) { continue }
                if ($directory.depth -ge 8) { throw 'Scoped LP evidence search exceeded depth 8; choose a narrower SearchRoot.' }
                $pending.Enqueue([pscustomobject]@{ path = $entry.FullName; depth = ($directory.depth + 1) })
            } elseif ($entry.Extension -in $extensions -and $entry.Length -le 1MB) {
                $files.Add($entry.FullName)
            }
        }
    }
    $rg = Get-Command rg -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $rg -and $files.Count -gt 0) {
        $matches = New-Object 'System.Collections.Generic.List[string]'
        for ($start = 0; $start -lt $files.Count; $start += 100) {
            $last = [Math]::Min($start + 99, $files.Count - 1)
            $result = Invoke-LpCli $rg.Source (@('--files-with-matches', '--fixed-strings', '--', $HostName) + @($files[$start..$last]))
            if ($result.exit_code -notin @(0, 1)) { throw 'Scoped rg evidence search failed.' }
            if ($result.exit_code -eq 0) {
                foreach ($line in ($result.output -split '\r?\n')) { if ($line) { $matches.Add($line) } }
            }
        }
        return @($matches | Sort-Object -Unique)
    }
    # Bounded native search remains available when rg is absent.
    if ($files.Count -eq 0) { return @() }
    return @(Select-String -LiteralPath @($files) -Pattern $HostName -SimpleMatch -CaseSensitive -List | ForEach-Object { $_.Path } | Sort-Object -Unique)
}

$matchedFiles = if ($FreshClone) { @() } else { @(Find-LpEvidence $SearchRoot $lpUri.DnsSafeHost) }
# These values must come from the immutable server-approved TASK_JSON.lpSource.
$source = if ($ExpectedGithubRepository) {
    [pscustomobject]@{
        project = $null
        github_repository = $ExpectedGithubRepository
        production_branch = $ExpectedProductionBranch
    }
} elseif ($FreshClone) { Resolve-VercelSource $lpUri } else { $null }
$projectRoots = @()
$cloned = $false
$sourceResolution = if ($ExpectedGithubRepository) { 'server_allowlist' } elseif ($null -ne $source) { 'vercel' } else { $null }

if ($FreshClone) {
    $git = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $gh = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $git -or $null -eq $gh) {
        throw 'git and GitHub CLI (gh) are required to obtain and verify a fresh LP clone.'
    }
    $branchCheck = Invoke-LpCli $git.Source @('check-ref-format', '--branch', $source.production_branch)
    if ($branchCheck.exit_code -ne 0) { throw 'The approved production branch is not a valid Git branch.' }
    $auth = Invoke-LpCli $gh.Source @('auth', 'status', '--hostname', 'github.com')
    if ($auth.exit_code -ne 0) {
        throw 'GitHub authentication check failed. Operator action is required; no login or alternate repository will be attempted.'
    }
    $freshRoot = Join-Path $workspacePath '.lp-price-jobs'
    New-Item -ItemType Directory -Path $freshRoot -Force | Out-Null
    if ((Get-Item -LiteralPath $freshRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'The fresh-clone directory must not be a junction or symbolic link.'
    }
    $repoName = $source.github_repository.Split('/')[-1]
    $targetRoot = Join-Path $freshRoot ("$repoName-" + [guid]::NewGuid().ToString('N'))
    $clone = Invoke-LpCli $gh.Source @('repo', 'clone', "https://github.com/$($source.github_repository).git", $targetRoot, '--', '--branch', $source.production_branch, '--single-branch')
    if ($clone.exit_code -ne 0) {
        throw 'Fresh LP clone failed. Verify GitHub access and the approved production branch; the partial clone is preserved for inspection.'
    }
    $checks = @{}
    foreach ($check in @(
        @{ name = 'origin'; args = @('remote', 'get-url', 'origin') },
        @{ name = 'branch'; args = @('branch', '--show-current') },
        @{ name = 'head'; args = @('rev-parse', '--verify', 'HEAD') },
        @{ name = 'remote_head'; args = @('rev-parse', '--verify', "refs/remotes/origin/$($source.production_branch)") },
        @{ name = 'status'; args = @('status', '--porcelain') }
    )) {
        $result = Invoke-LpCli $git.Source (@('-C', $targetRoot) + $check.args)
        if ($result.exit_code -ne 0) { throw "Fresh LP clone verification failed at $($check.name)." }
        $checks[$check.name] = $result.output
    }
    $repositoryPattern = [regex]::Escape($source.github_repository) + '(?:\.git)?'
    if ($checks.origin -notmatch ('^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)' + $repositoryPattern + '$')) {
        throw 'Fresh clone origin does not match the approved GitHub repository.'
    }
    if ($checks.branch -cne $source.production_branch) { throw 'Fresh clone is not on the approved production branch.' }
    if ($checks.head -notmatch '^[0-9a-f]{40}$' -or $checks.head -cne $checks.remote_head) {
        throw 'Fresh clone HEAD does not match the approved origin production branch.'
    }
    if ($checks.status) { throw 'Fresh LP clone is not clean.' }
    $headCommit = $checks.head
    $projectRoots = @($targetRoot)
    $cloned = $true
}

[pscustomobject]@{
    url = $lpUri.AbsoluteUri
    host = $lpUri.DnsSafeHost
    vercel_project = if ($null -ne $source) { $source.project } else { $null }
    github_repository = if ($null -ne $source) { $source.github_repository } else { $null }
    production_branch = if ($null -ne $source) { $source.production_branch } else { $null }
    source_resolution = $sourceResolution
    source_commit = if ($FreshClone) { $headCommit } else { $null }
    matched_files = @($matchedFiles)
    project_roots = @($projectRoots | Sort-Object -Unique)
    cloned = $cloned
} | ConvertTo-Json -Depth 4
