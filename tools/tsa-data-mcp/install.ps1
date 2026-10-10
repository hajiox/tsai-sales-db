[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'TSADataMCP/1.2.0')
)

$ErrorActionPreference = 'Stop'
$targetPath = [System.IO.Path]::GetFullPath($Destination)
$sourcePath = [System.IO.Path]::GetFullPath($PSScriptRoot)
if ($targetPath.StartsWith($sourcePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Install outside the source directory. Do not give the data-only account an application checkout.'
}
if (Test-Path -LiteralPath $targetPath) {
  throw 'Destination already exists. Choose a new version directory; existing files will not be overwritten.'
}
if (-not $PSCmdlet.ShouldProcess($targetPath, 'Install TSA data-only MCP without credentials or application source')) { return }

New-Item -ItemType Directory -Path $targetPath | Out-Null
foreach ($fileName in @('server.mjs', 'api-client.mjs', 'change-schemas.mjs', 'business-schemas.mjs', 'recipe-items-schemas.mjs', 'package.json', 'package-lock.json', 'codex-config.example.toml')) {
  Copy-Item -LiteralPath (Join-Path $sourcePath $fileName) -Destination (Join-Path $targetPath $fileName)
}
Copy-Item -LiteralPath (Join-Path $sourcePath 'skill') -Destination (Join-Path $targetPath 'skill') -Recurse
Push-Location -LiteralPath $targetPath
try {
  & npm ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Preserve the directory and inspect the error.' }
} finally {
  Pop-Location
}
Write-Output ('Installed: ' + $targetPath)
Write-Output ('Launch: node "' + (Join-Path $targetPath 'server.mjs') + '"')
Write-Output 'Supply TSA_DATA_API_TOKEN only through the data-only runtime environment. No Codex configuration has been changed.'
