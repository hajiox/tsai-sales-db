$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $root 'tools\tsa-codex-bridge\install-bridge.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'installer syntax failed' }
$functionAst = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-BridgeProcessEntryPoint'}, $true)
. ([scriptblock]::Create($functionAst.Extent.Text))
$startScriptPath = 'C:\Users\fixture\AppData\Local\TSA Codex Bridge\start-bridge.ps1'
$headlessStartScriptPath = 'C:\Users\fixture\AppData\Local\TSA Codex Bridge\start-bridge-prelogin.ps1'
$bridgePath = 'C:\Users\fixture\AppData\Local\TSA Codex Bridge\bridge.mjs'
$fixtures = @(
  @{Name='node.exe'; Line='"C:\Program Files\nodejs\node.exe" "'+$bridgePath+'"'; Expected=$true},
  @{Name='powershell.exe'; Line='powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$startScriptPath+'"'; Expected=$true},
  @{Name='pwsh.exe'; Line='"C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -File "'+$headlessStartScriptPath+'" -RuntimeName ai-01'; Expected=$true},
  @{Name='pwsh.exe'; Line='pwsh.exe -Command "Get-Content -LiteralPath '' '+$bridgePath+' ''"'; Expected=$false},
  @{Name='pwsh.exe'; Line='pwsh.exe -Command echo -File "'+$startScriptPath+'"'; Expected=$false},
  @{Name='powershell.exe'; Line='powershell.exe -EncodedCommand fixture -File "'+$startScriptPath+'"'; Expected=$false},
  @{Name='pwsh.exe'; Line='pwsh.exe -Co echo -File "'+$startScriptPath+'"'; Expected=$false},
  @{Name='node.exe'; Line='node.exe -e "fixture" "'+$bridgePath+'"'; Expected=$false},
  @{Name='node.exe'; Line='node.exe "'+$bridgePath+'.bak"'; Expected=$false},
  @{Name='cmd.exe'; Line='cmd.exe /c node.exe "'+$bridgePath+'"'; Expected=$false},
  @{Name='pwsh.exe'; Line='pwsh.exe -File C:\fixture\installer.ps1 -Path "'+$startScriptPath+'"'; Expected=$false}
)
$count = 0
foreach ($fixture in $fixtures) {
  $candidate = [pscustomobject]@{Name=$fixture.Name; CommandLine=$fixture.Line; ProcessId=12345}
  $actual = Test-BridgeProcessEntryPoint $candidate -InstallerPid 99
  if ($actual -ne $fixture.Expected) { throw "entrypoint fixture $count failed" }
  if (Test-BridgeProcessEntryPoint $candidate -InstallerPid 12345) { throw 'self process matched' }
  $count++
}
$launcherPath = Join-Path $root 'tools\tsa-codex-bridge\start-bridge.ps1'
$null = [System.Management.Automation.Language.Parser]::ParseFile($launcherPath,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'launcher syntax failed' }
$launcher = [IO.File]::ReadAllText($launcherPath)
if ($launcher.IndexOf('bridge-maintenance.lock') -gt $launcher.IndexOf('& $node $bridge')) { throw 'maintenance must gate spawn' }
Write-Output "Bridge process entrypoint fixtures passed: $count plus self exclusions; launcher syntax and maintenance gate passed."
