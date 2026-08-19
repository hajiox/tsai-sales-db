param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$BaseUrl = "https://v0-tsa-19.vercel.app",
  [string]$WorkerId = "tsa-office-01",
  [string]$WorkerName = "事務所PC",
  [string]$Workspace = "C:\作業用",
  [string]$CodexSessionId = "",
  [ValidateSet("low", "medium", "high", "xhigh")][string]$ReasoningEffort = "low"
)

$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "TSA Codex Bridge"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "logs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $installDir "jobs") -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceDir "bridge.mjs") -Destination (Join-Path $installDir "bridge.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "result.schema.json") -Destination (Join-Path $installDir "result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "analysis-result.schema.json") -Destination (Join-Path $installDir "analysis-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "ec-price-result.schema.json") -Destination (Join-Path $installDir "ec-price-result.schema.json") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "start-bridge.ps1") -Destination (Join-Path $installDir "start-bridge.ps1") -Force

foreach ($skillName in @("tsa-web-sales-csv", "tsa-ad-cost-csv", "tsa-ec-profit-report", "tsa-web-sales-analysis")) {
  $skillSource = Join-Path $sourceDir "skills\$skillName"
  $skillRoot = Join-Path (Join-Path $env:USERPROFILE ".codex\skills") $skillName
  New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $skillSource "*") -Destination $skillRoot -Recurse -Force
}

$priceSkill = Join-Path $env:USERPROFILE ".codex\skills\update-aizu-ec-prices\SKILL.md"
if (-not (Test-Path -LiteralPath $priceSkill)) {
  throw "update-aizu-ec-prices Skillがありません。共有Skillsを同期してから再実行してください。"
}

$config = @{
  baseUrl = $BaseUrl
  token = $Token
  workerId = $WorkerId
  workerName = $WorkerName
  workspace = $Workspace
  jobRoot = (Join-Path $installDir "jobs")
  downloadsDir = (Join-Path $env:USERPROFILE "Downloads")
  codexHome = (Join-Path $env:USERPROFILE ".codex")
  codexSessionId = $CodexSessionId
  reasoningEffort = $ReasoningEffort
  pollMs = 5000
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $installDir "bridge.config.json"), $config, [System.Text.UTF8Encoding]::new($false))

$runCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $installDir 'start-bridge.ps1')`""
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "TSA Codex Bridge" -Value $runCommand -PropertyType String -Force | Out-Null

$startScript = Join-Path $installDir "start-bridge.ps1"
$startArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $startArguments

Write-Output "TSA Codex Bridge installed and started: $installDir"
