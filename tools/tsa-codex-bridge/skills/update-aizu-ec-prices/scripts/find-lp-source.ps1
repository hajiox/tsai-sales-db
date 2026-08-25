param(
    [Parameter(Mandatory = $true)]
    [string]$LpUrl,

    [string]$WorkspaceRoot = ('C:\' + [char]0x4F5C + [char]0x696D + [char]0x7528),

    [Alias('CloneMissing')]
    [switch]$FreshClone,

    [string]$ExpectedGithubRepository,

    [string]$ExpectedProductionBranch
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
    throw "Workspace root not found: $WorkspaceRoot"
}

try {
    $lpUri = [Uri]$LpUrl
} catch {
    throw "Invalid LP URL: $LpUrl"
}

if (($ExpectedGithubRepository -and -not $ExpectedProductionBranch) -or
    ($ExpectedProductionBranch -and -not $ExpectedGithubRepository)) {
    throw 'ExpectedGithubRepository and ExpectedProductionBranch must be specified together.'
}
if ($ExpectedGithubRepository -and $ExpectedGithubRepository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw "Invalid expected GitHub repository: $ExpectedGithubRepository"
}
if ($ExpectedProductionBranch -and $ExpectedProductionBranch -notmatch '^[A-Za-z0-9._/-]+$') {
    throw "Invalid expected production branch: $ExpectedProductionBranch"
}

$workspacePath = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$rgCommand = Get-Command rg -ErrorAction SilentlyContinue
if ($null -eq $rgCommand) {
    throw 'rg is required but was not found on PATH.'
}

function Resolve-VercelSource([Uri]$Uri) {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($null -eq $npx) {
        return $null
    }

    $commandRoot = Join-Path ([IO.Path]::GetTempPath()) 'tsa-lp-source-resolver'
    New-Item -ItemType Directory -Path $commandRoot -Force | Out-Null
    Push-Location $commandRoot
    try {
        $domainOutput = (& cmd.exe /d /c "npx vercel domains inspect $($Uri.Host) 2>&1" | Out-String)
        $domainExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($domainExitCode -ne 0) {
        return $null
    }
    $domainPattern = '(?m)^\s*(?<project>[A-Za-z0-9._-]+)\s+' + [regex]::Escape($Uri.Host) + '\s*$'
    $projectMatch = [regex]::Match($domainOutput, $domainPattern)
    if (-not $projectMatch.Success) {
        return $null
    }

    $projectName = $projectMatch.Groups['project'].Value
    Push-Location $commandRoot
    try {
        $projectJsonText = (& cmd.exe /d /c "npx vercel api /v9/projects/$projectName 2>NUL" | Out-String).Trim()
        $projectExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($projectExitCode -ne 0 -or -not $projectJsonText) {
        return [pscustomobject]@{
            project = $projectName
            github_repository = $null
            production_branch = $null
        }
    }

    try {
        $project = $projectJsonText | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{
            project = $projectName
            github_repository = $null
            production_branch = $null
        }
    }
    $githubRepository = if ($project.link.type -eq 'github' -and $project.link.org -and $project.link.repo) {
        "$($project.link.org)/$($project.link.repo)"
    } else {
        $null
    }
    return [pscustomobject]@{
        project = $projectName
        github_repository = $githubRepository
        production_branch = if ($project.link.productionBranch) { $project.link.productionBranch } else { 'main' }
    }
}

$rgArguments = @(
    '--files-with-matches',
    '--hidden',
    '--fixed-strings',
    '--glob', '!**/.git/**',
    '--glob', '!**/node_modules/**',
    '--glob', '!**/.next/**',
    '--glob', '!**/.vercel/**',
    '--glob', '!**/dist/**',
    '--glob', '!**/build/**',
    '--glob', '!**/out/**',
    $lpUri.Host,
    $workspacePath
)

$matchedFiles = if ($FreshClone) { @() } else { @(& $rgCommand.Source @rgArguments 2>$null) }
$vercelSource = if ($ExpectedGithubRepository) {
    [pscustomobject]@{
        project = $null
        github_repository = $ExpectedGithubRepository
        production_branch = $ExpectedProductionBranch
    }
} else {
    Resolve-VercelSource $lpUri
}
$projectRoots = @()
$cloned = $false
$sourceResolution = if ($ExpectedGithubRepository) {
    'server_allowlist'
} elseif ($null -ne $vercelSource -and $vercelSource.github_repository) {
    'vercel'
} else {
    $null
}

if ($FreshClone) {
    if ($null -eq $vercelSource -or -not $vercelSource.github_repository) {
        throw 'The LP is not linked to a GitHub repository in Vercel. Existing local clones will not be used.'
    }
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($null -eq $gh) {
        throw 'GitHub CLI (gh) is required to obtain the latest LP source repository.'
    }
    $repoName = $vercelSource.github_repository.Split('/')[-1]
    $freshRoot = Join-Path $workspacePath '.lp-price-jobs'
    New-Item -ItemType Directory -Path $freshRoot -Force | Out-Null
    $targetRoot = Join-Path $freshRoot "$repoName-$([DateTime]::Now.ToString('yyyyMMddHHmmss'))-$PID"
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $cloneOutput = (& $gh.Source repo clone $vercelSource.github_repository $targetRoot -- --branch $vercelSource.production_branch --single-branch 2>&1 | Out-String)
        $cloneExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($cloneExitCode -ne 0) {
        throw "Failed to clone $($vercelSource.github_repository): $cloneOutput"
    }
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $git) {
        throw 'git is required to verify the fresh LP clone.'
    }
    $originUrl = (& $git.Source -C $targetRoot remote get-url origin | Out-String).Trim()
    $headCommit = (& $git.Source -C $targetRoot rev-parse HEAD | Out-String).Trim()
    $originCommit = (& $git.Source -C $targetRoot rev-parse "origin/$($vercelSource.production_branch)" | Out-String).Trim()
    $workingTree = (& $git.Source -C $targetRoot status --porcelain | Out-String).Trim()
    $normalizedOrigin = $originUrl.ToLowerInvariant().Replace('git@github.com:', 'github.com/').Replace('https://', '').Replace('http://', '')
    if ($normalizedOrigin.EndsWith('.git')) {
        $normalizedOrigin = $normalizedOrigin.Substring(0, $normalizedOrigin.Length - 4)
    }
    if ($normalizedOrigin -ne "github.com/$($vercelSource.github_repository.ToLowerInvariant())") {
        throw "Fresh clone origin does not match the approved repository: $originUrl"
    }
    if ($headCommit -notmatch '^[0-9a-f]{40}$' -or $headCommit -ne $originCommit) {
        throw 'Fresh clone HEAD does not match the approved origin production branch.'
    }
    if ($workingTree) {
        throw 'Fresh LP clone is not clean.'
    }
    $projectRoots = @($targetRoot)
    $cloned = $true
}

[pscustomobject]@{
    url = $lpUri.AbsoluteUri
    host = $lpUri.Host
    vercel_project = if ($null -ne $vercelSource) { $vercelSource.project } else { $null }
    github_repository = if ($null -ne $vercelSource) { $vercelSource.github_repository } else { $null }
    production_branch = if ($null -ne $vercelSource) { $vercelSource.production_branch } else { $null }
    source_resolution = $sourceResolution
    source_commit = if ($FreshClone) { $headCommit } else { $null }
    matched_files = @($matchedFiles)
    project_roots = @($projectRoots | Sort-Object -Unique)
    cloned = $cloned
} | ConvertTo-Json -Depth 4
