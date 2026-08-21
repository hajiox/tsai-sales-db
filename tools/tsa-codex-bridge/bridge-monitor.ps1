param(
  [Parameter(Mandatory = $true)]
  [string]$StatePath,
  [Parameter(Mandatory = $true)]
  [string]$JobId
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$shortJobId = if ($JobId.Length -gt 8) { $JobId.Substring(0, 8) } else { $JobId }
$Host.UI.RawUI.WindowTitle = "TSA Codex Bridge 実行モニター [$shortJobId]"
$finalStatuses = @("completed", "waiting_for_user", "needs_review", "failed", "cancelled")
$finalSince = $null

function Format-Duration([double]$Seconds) {
  $value = [Math]::Max(0, [Math]::Floor($Seconds))
  $hours = [Math]::Floor($value / 3600)
  $minutes = [Math]::Floor(($value % 3600) / 60)
  $seconds = $value % 60
  if ($hours -gt 0) { return "{0}時間{1:00}分{2:00}秒" -f $hours, $minutes, $seconds }
  return "{0}分{1:00}秒" -f $minutes, $seconds
}

function Format-Time([string]$Value) {
  if (-not $Value) { return "算出中" }
  try { return ([DateTimeOffset]::Parse($Value)).ToLocalTime().ToString("HH:mm") } catch { return "算出中" }
}

function Format-EtaWindow([string]$EarliestValue, [string]$LatestValue, [DateTimeOffset]$Now) {
  if (-not $EarliestValue -or -not $LatestValue) { return "算出中" }
  try {
    $earliest = ([DateTimeOffset]::Parse($EarliestValue)).ToLocalTime()
    $latest = ([DateTimeOffset]::Parse($LatestValue)).ToLocalTime()
    if ($latest -lt $Now) { return "目安超過（処理継続中）" }
    return "{0} - {1} 頃" -f $earliest.ToString("HH:mm"), $latest.ToString("HH:mm")
  } catch {
    return "算出中"
  }
}

function Status-Label([string]$Status) {
  switch ($Status) {
    "completed" { return "完了" }
    "waiting_for_user" { return "操作待ち" }
    "needs_review" { return "確認待ち" }
    "failed" { return "失敗" }
    "cancelled" { return "停止済み" }
    default { return "実行中" }
  }
}

while ($true) {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    Clear-Host
    Write-Host "TSA Codex Bridge 実行モニター" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ジョブ情報の受信を待っています..." -ForegroundColor Yellow
    Start-Sleep -Seconds 1
    continue
  }

  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  } catch {
    Start-Sleep -Milliseconds 500
    continue
  }
  if ([string]$state.jobId -ne $JobId) { break }

  $now = [DateTimeOffset]::Now
  try { $started = ([DateTimeOffset]::Parse([string]$state.startedAt)).ToLocalTime() } catch { $started = $now }
  try { $responded = ([DateTimeOffset]::Parse([string]$state.lastResponseAt)).ToLocalTime() } catch { $responded = $now }
  $elapsed = ($now - $started).TotalSeconds
  $responseAge = ($now - $responded).TotalSeconds
  $progress = [Math]::Max(0, [Math]::Min(100, [int]$state.progress))
  $filled = [Math]::Floor($progress * 40 / 100)
  $bar = ("#" * $filled).PadRight(40, "-")
  $status = [string]$state.status
  $isFinal = $finalStatuses -contains $status
  $statusColor = if ($status -eq "completed") { "Green" } elseif ($isFinal) { "Yellow" } else { "Cyan" }
  $codexAlive = $false
  if ($state.codexPid) { $codexAlive = $null -ne (Get-Process -Id ([int]$state.codexPid) -ErrorAction SilentlyContinue) }
  $etaWindow = Format-EtaWindow ([string]$state.estimatedEarliestAt) ([string]$state.estimatedLatestAt) $now

  Clear-Host
  Write-Host "TSA Codex Bridge 実行モニター" -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkGray
  Write-Host ("状態       : {0}" -f (Status-Label $status)) -ForegroundColor $statusColor
  Write-Host ("処理       : {0}" -f [string]$state.taskLabel)
  if ($state.productName) { Write-Host ("対象       : {0}" -f [string]$state.productName) }
  if ($state.targets -and $state.targets.Count -gt 0) { Write-Host ("対象EC     : {0}" -f (($state.targets | ForEach-Object { [string]$_ }) -join ", ")) }
  Write-Host ("現在の工程 : {0}" -f [string]$state.currentStep) -ForegroundColor White
  Write-Host ""
  Write-Host ("[{0}] {1,3}%" -f $bar, $progress) -ForegroundColor Cyan
  Write-Host ("経過時間   : {0}" -f (Format-Duration $elapsed))
  if (-not $isFinal) { Write-Host ("完了目安   : {0}" -f $etaWindow) -ForegroundColor Yellow }
  Write-Host ("最終応答   : {0}前" -f (Format-Duration $responseAge))
  Write-Host ""
  Write-Host ("Bridge PID : {0}  {1}" -f [string]$state.bridgePid, $(if (Get-Process -Id ([int]$state.bridgePid) -ErrorAction SilentlyContinue) { "稼働中" } else { "停止" }))
  $codexStatus = if ($codexAlive) { "CLI実行中" } elseif ($isFinal) { "終了" } else { "準備・切替中" }
  Write-Host ("Codex PID  : {0}  {1}" -f $(if ($state.codexPid) { [string]$state.codexPid } else { "-" }), $codexStatus)
  Write-Host ("Job ID     : {0}" -f [string]$state.jobId) -ForegroundColor DarkGray
  if ($state.summary) {
    Write-Host ""
    Write-Host "直近の応答" -ForegroundColor DarkCyan
    Write-Host ([string]$state.summary)
  }
  Write-Host ""

  if ($isFinal) {
    if (-not $finalSince) { $finalSince = $now }
    $remaining = [Math]::Max(0, 30 - [Math]::Floor(($now - $finalSince).TotalSeconds))
    Write-Host ("処理は終了しました。この画面はあと{0}秒で閉じます。" -f $remaining) -ForegroundColor $statusColor
    if ($remaining -le 0) { break }
  } else {
    $finalSince = $null
    Write-Host "この画面を閉じてもBridgeの処理は継続します。" -ForegroundColor DarkGray
  }
  Start-Sleep -Seconds 1
}
