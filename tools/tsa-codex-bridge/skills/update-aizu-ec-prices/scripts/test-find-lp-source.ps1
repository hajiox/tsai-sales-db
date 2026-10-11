param()

$ErrorActionPreference = 'Stop'
$resolver = Join-Path $PSScriptRoot 'find-lp-source.ps1'
$realGit = (Get-Command git -CommandType Application | Select-Object -First 1).Source
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('tsa-lp-resolver-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$previousEnvironment = @{}
foreach ($name in @('TSA_LP_TEST_GIT', 'TSA_LP_TEST_BARE', 'TSA_LP_TEST_SCENARIO', 'TSA_LP_TEST_CLEANUP_RECORD', 'CI', 'NO_COLOR', 'GH_PROMPT_DISABLED', 'GIT_TERMINAL_PROMPT')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$script:passed = 0
$script:rgLookups = 0

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Assert-Fails([scriptblock]$Action, [string]$MessagePattern) {
    $failed = $false
    try { & $Action | Out-Null } catch {
        $failed = $true
        if ($_.Exception.Message -notmatch $MessagePattern) { throw "Unexpected failure: $($_.Exception.Message)" }
    }
    if (-not $failed) { throw "Expected failure matching: $MessagePattern" }
    $script:passed++
}
function Invoke-FixtureResolver([hashtable]$Arguments) {
    $parameters = @{ LpUrl = 'https://lp.example.test/'; WorkspaceRoot = $fixtureRoot }
    foreach ($key in $Arguments.Keys) { $parameters[$key] = $Arguments[$key] }
    & $resolver @parameters
}

try {
    $seed = Join-Path $fixtureRoot 'seed'
    $bare = Join-Path $fixtureRoot 'fixture.git'
    & $realGit init --quiet --initial-branch production $seed
    Set-Content -LiteralPath (Join-Path $seed 'page.html') -Value '<p>lp.example.test fixture</p>' -Encoding UTF8
    & $realGit -C $seed add page.html
    & $realGit -C $seed -c user.name=Fixture -c user.email=fixture@example.test commit --quiet -m fixture
    & $realGit clone --quiet --bare $seed $bare
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local Git fixture.' }
    $env:TSA_LP_TEST_GIT = $realGit
    $env:TSA_LP_TEST_BARE = $bare
    $env:TSA_LP_TEST_CLEANUP_RECORD = Join-Path $fixtureRoot 'cleanup-record.txt'
    $ghShim = Join-Path $fixtureRoot 'gh-fixture.ps1'
    $vercelShim = Join-Path $fixtureRoot 'vercel-fixture.cmd'
    $gitShim = Join-Path $fixtureRoot 'git-fixture.ps1'
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
if ($CliArgs[0] -eq 'auth') {
    $global:LASTEXITCODE = if ($env:TSA_LP_TEST_SCENARIO -eq 'github-auth') { 1 } else { 0 }
    return
}
if ($env:TSA_LP_TEST_SCENARIO -eq 'clone-failure') { $global:LASTEXITCODE = 1; return }
$target = $CliArgs[3]
& $env:TSA_LP_TEST_GIT clone --quiet --branch $CliArgs[6] --single-branch $env:TSA_LP_TEST_BARE $target
if ($LASTEXITCODE -ne 0) { return }
& $env:TSA_LP_TEST_GIT -C $target remote set-url origin 'https://github.com/fixture-owner/fixture-lp.git'
switch ($env:TSA_LP_TEST_SCENARIO) {
    'origin-mismatch' { & $env:TSA_LP_TEST_GIT -C $target remote set-url origin 'https://github.com/fixture-owner/other.git' }
    'dirty' { Set-Content -LiteralPath (Join-Path $target 'unexpected.txt') -Value dirty }
    'detached' { & $env:TSA_LP_TEST_GIT -C $target checkout --quiet --detach }
    'head-mismatch' { & $env:TSA_LP_TEST_GIT -C $target -c user.name=Fixture -c user.email=fixture@example.test commit --quiet --allow-empty -m local-only }
}
$global:LASTEXITCODE = 0
'@ | Set-Content -LiteralPath $ghShim -Encoding UTF8
    @'
@echo off
echo Vercel CLI 50.5.0 1>&2
if "%~1"=="whoami" goto whoami
if "%~1"=="domains" goto domains
if "%TSA_LP_TEST_SCENARIO%"=="vercel-api" exit /b 1
if "%TSA_LP_TEST_SCENARIO%"=="cleanup-api-failure" exit /b 1
if "%TSA_LP_TEST_SCENARIO%"=="invalid-json" goto invalidjson
if "%TSA_LP_TEST_SCENARIO%"=="missing-branch" goto missingbranch
echo {"link":{"type":"github","org":"fixture-owner","repo":"fixture-lp","productionBranch":"production"}}
exit /b 0
:whoami
if "%TSA_LP_TEST_SCENARIO%"=="cleanup-success" echo fixture>held-cwd.txt
if "%TSA_LP_TEST_SCENARIO%"=="cleanup-success" cd > "%TSA_LP_TEST_CLEANUP_RECORD%"
if "%TSA_LP_TEST_SCENARIO%"=="cleanup-api-failure" echo fixture>held-cwd.txt
if "%TSA_LP_TEST_SCENARIO%"=="cleanup-api-failure" cd > "%TSA_LP_TEST_CLEANUP_RECORD%"
if "%TSA_LP_TEST_SCENARIO%"=="vercel-auth" exit /b 1
exit /b 0
:domains
echo   General 1>&2
echo     Name lp.example.test 1>&2
echo. 1>&2
echo   Projects 1>&2
echo     Project          Domains 1>&2
echo     fixture-project  lp.example.test, www.lp.example.test 1>&2
if "%TSA_LP_TEST_SCENARIO%"=="multiple-projects" echo     another-project lp.example.test 1>&2
echo. 1>&2
echo   Name lp.example.test 1>&2
exit /b 0
:invalidjson
echo not-json
exit /b 0
:missingbranch
echo {"link":{"type":"github","org":"fixture-owner","repo":"fixture-lp"}}
exit /b 0
'@ | Set-Content -LiteralPath $vercelShim -Encoding ASCII
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
if ($env:TSA_LP_TEST_SCENARIO -eq 'git-status-failure' -and $CliArgs -contains 'status') {
    $global:LASTEXITCODE = 1
    return
}
& $env:TSA_LP_TEST_GIT @CliArgs
'@ | Set-Content -LiteralPath $gitShim -Encoding UTF8

    # Resolve only fixture CLI shims using local Git and cmd. No network,
    # production business writes or real account reads are performed.
    function Get-Command {
        [CmdletBinding()]
        param([string[]]$Name, [string]$CommandType)
        switch ($Name[0]) {
            'git' { [pscustomobject]@{ Source = $gitShim }; return }
            'gh' { [pscustomobject]@{ Source = $ghShim }; return }
            'vercel.cmd' { [pscustomobject]@{ Source = $vercelShim }; return }
            'rg' { $script:rgLookups++; return }
            default { throw "Unexpected command lookup: $Name" }
        }
    }
    $approved = @{ FreshClone = $true; ExpectedGithubRepository = 'fixture-owner/fixture-lp'; ExpectedProductionBranch = 'production' }
    $env:TSA_LP_TEST_SCENARIO = 'success'
    # This file is deliberately dirty and must never be used or changed.
    $oldMarker = Join-Path $seed 'user-change.txt'
    Set-Content -LiteralPath $oldMarker -Value 'preserve old clone'
    $rgBefore = $script:rgLookups
    Push-Location $fixtureRoot
    try { $result = Invoke-FixtureResolver $approved | ConvertFrom-Json } finally { Pop-Location }
    Assert-True ($result.cloned -and $result.source_resolution -eq 'server_allowlist') 'Approved source did not produce a verified clone.'
    Assert-True ($result.production_branch -eq 'production' -and $result.source_commit -match '^[0-9a-f]{40}$') 'Clone evidence is incomplete.'
    Assert-True ($script:rgLookups -eq $rgBefore) 'FreshClone unexpectedly required local search or rg.'
    Assert-True ((Get-Content -LiteralPath $oldMarker) -eq 'preserve old clone') 'Old clone was changed.'
    $script:passed++
    $next = Invoke-FixtureResolver $approved | ConvertFrom-Json
    Assert-True ($next.project_roots[0] -ne $result.project_roots[0]) 'Each run must create a new clone.'
    $script:passed++
    $discovered = Invoke-FixtureResolver @{ FreshClone = $true } | ConvertFrom-Json
    Assert-True ($discovered.source_resolution -eq 'vercel' -and $discovered.vercel_project -eq 'fixture-project') 'Vercel source discovery failed.'
    $script:passed++

    foreach ($cleanupScenario in @('cleanup-success', 'cleanup-api-failure')) {
        $env:TSA_LP_TEST_SCENARIO = $cleanupScenario
        try {
            if ($cleanupScenario -eq 'cleanup-success') {
                $cleanupResult = Invoke-FixtureResolver @{ FreshClone = $true } | ConvertFrom-Json
                Assert-True $cleanupResult.cloned 'Nonempty temporary-directory cleanup hid a successful result.'
                $script:passed++
            } else {
                Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true } } 'Vercel project lookup failed'
            }
        } finally {
            $ownedResolverRoot = Get-Content -LiteralPath $env:TSA_LP_TEST_CLEANUP_RECORD
            $tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
            if ((Split-Path -Parent $ownedResolverRoot) -ne $tempParent -or
                (Split-Path -Leaf $ownedResolverRoot) -notlike 'tsa-lp-source-resolver-*') {
                throw 'Unexpected resolver fixture cleanup path.'
            }
            Remove-Item -LiteralPath (Join-Path $ownedResolverRoot 'held-cwd.txt')
            [IO.Directory]::Delete($ownedResolverRoot)
        }
    }

    foreach ($case in @(
        @{ scenario = 'github-auth'; pattern = 'GitHub authentication check failed' },
        @{ scenario = 'clone-failure'; pattern = 'Fresh LP clone failed' },
        @{ scenario = 'origin-mismatch'; pattern = 'origin does not match' },
        @{ scenario = 'dirty'; pattern = 'not clean' },
        @{ scenario = 'detached'; pattern = 'not on the approved production branch' },
        @{ scenario = 'head-mismatch'; pattern = 'HEAD does not match' },
        @{ scenario = 'git-status-failure'; pattern = 'verification failed at status' }
    )) {
        $env:TSA_LP_TEST_SCENARIO = $case.scenario
        Assert-Fails { Invoke-FixtureResolver $approved } $case.pattern
    }
    foreach ($case in @(
        @{ scenario = 'vercel-auth'; pattern = 'Vercel account check failed' },
        @{ scenario = 'vercel-api'; pattern = 'Vercel project lookup failed' },
        @{ scenario = 'missing-branch'; pattern = 'explicit production branch' },
        @{ scenario = 'multiple-projects'; pattern = 'exactly one project' },
        @{ scenario = 'invalid-json'; pattern = 'valid JSON' }
    )) {
        $env:TSA_LP_TEST_SCENARIO = $case.scenario
        Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true } } $case.pattern
    }
    Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true; LpUrl = 'file:///C:/private' } } 'absolute HTTP'
    Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true; LpUrl = 'https://user:password@lp.example.test' } } 'without embedded credentials'
    Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true; ExpectedGithubRepository = 'fixture-owner/fixture-lp' } } 'specified together'
    Assert-Fails { Invoke-FixtureResolver @{} } 'Read-only discovery requires'
    Assert-Fails { Invoke-FixtureResolver @{ SearchRoot = $fixtureRoot } } 'not the entire workspace'
    Assert-Fails { Invoke-FixtureResolver @{ FreshClone = $true; ExpectedGithubRepository = 'fixture-owner/fixture-lp'; ExpectedProductionBranch = 'production..bad' } } 'not a valid Git branch'

    $search = Join-Path $fixtureRoot 'search-source'
    $sourceDir = Join-Path $search 'src'
    $excludedDir = Join-Path $search 'node_modules'
    New-Item -ItemType Directory -Path $sourceDir, $excludedDir | Out-Null
    $sourceFile = Join-Path $sourceDir 'page.tsx'
    Set-Content -LiteralPath $sourceFile -Value 'https://lp.example.test/'
    Set-Content -LiteralPath (Join-Path $excludedDir 'ignore.js') -Value 'lp.example.test'
    Set-Content -LiteralPath (Join-Path $search 'large.txt') -Value ('lp.example.test' + ('x' * 1MB))
    $evidence = Invoke-FixtureResolver @{ SearchRoot = $search } | ConvertFrom-Json
    Assert-True (-not $evidence.cloned -and $evidence.project_roots.Count -eq 0) 'Read-only evidence must not authorize an old clone.'
    Assert-True ($evidence.matched_files.Count -eq 1 -and $evidence.matched_files[0] -eq $sourceFile) "Native fallback did not honor file and directory bounds: $($evidence.matched_files -join ', ')"
    $script:passed++
    $deep = $sourceDir
    foreach ($i in 1..9) { $deep = Join-Path $deep "depth$i"; New-Item -ItemType Directory -Path $deep | Out-Null }
    Assert-Fails { Invoke-FixtureResolver @{ SearchRoot = $search } } 'exceeded depth 8'
    Write-Output "PASS: $script:passed LP resolver fixture checks (no network or production writes)."
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
    if (-not $resolvedFixture.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolvedFixture) -notlike 'tsa-lp-resolver-test-*') {
        throw 'Refusing cleanup outside the task-owned temporary fixture directory.'
    }
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
