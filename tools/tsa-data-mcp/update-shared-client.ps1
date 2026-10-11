[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedSha256
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'ZIP SHA256 mismatch.' }
$base = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'AizuDataMCP/20261008'))
$target = [IO.Path]::GetFullPath((Join-Path $base 'tsa-data-mcp'))
$stage = [IO.Path]::GetFullPath((Join-Path $base ('tsa-mcp-staging-' + [Guid]::NewGuid().ToString('N'))))
$backup = [IO.Path]::GetFullPath((Join-Path $base ('tsa-data-mcp-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))))
function Assert-Contained([string]$candidate) {
  if (-not $candidate.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside the MCP installation.' }
}
foreach ($candidate in @($target, $stage, $backup)) { Assert-Contained $candidate }
if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw 'Existing TSA installation not found. Use the initial installation instructions.' }
foreach ($candidate in @($base, $target)) {
  if ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse-point installation is not supported.' }
}
if (Test-Path -LiteralPath $backup) { throw 'Backup already exists. Do not overwrite it.' }
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if (-not $name.StartsWith('tsa-data-mcp/') -or $name -match '(^|/)\.\.(/|$)|^[A-Za-z]:|^/' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe ZIP entry.' }
    $resolved = [IO.Path]::GetFullPath((Join-Path $stage $name))
    if (-not $resolved.StartsWith($stage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP entry outside staging.' }
    if ($name -match '(^|/)(node_modules|\.git|\.env[^/]*|private)(/|$)|\.token$') { throw 'Unexpected private or application file in ZIP.' }
  }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($archive, $stage)
$newPackage = Join-Path $stage 'tsa-data-mcp'
$manifest = Get-Content -LiteralPath (Join-Path $newPackage 'package.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne '@aizu/tsa-data-mcp' -or $manifest.version -ne '1.4.0') { throw 'Unexpected MCP package.' }
Push-Location -LiteralPath $newPackage
try {
  & npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; original installation preserved.' }
  & node --check server.mjs
  if ($LASTEXITCODE -ne 0) { throw 'MCP syntax check failed; original installation preserved.' }
} finally { Pop-Location }
# All resolved move targets were checked above. Keep the recoverable original.
Move-Item -LiteralPath $target -Destination $backup
try { Move-Item -LiteralPath $newPackage -Destination $target }
catch {
  Move-Item -LiteralPath $backup -Destination $target
  throw
}
Write-Output 'TSA MCP 1.4.0 installed. Existing private keys, launcher, Codex config, TSG and DocScanner are unchanged.'
Write-Output ('Backup: ' + $backup)
Write-Output 'Reconnect TSA MCP in a new Codex session; verify initialize, 32 tools, tsa_operation_catalog and a read-only request.'
