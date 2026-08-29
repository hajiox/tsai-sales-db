param(
  [Parameter(Mandatory = $true)]
  [string]$StateDirectory,
  [Parameter(Mandatory = $true)]
  [string]$AckPath,
  [string]$WindowPlacementScript,
  [string]$WindowConfigPath,
  [string]$MutexName = "Local\CodexBridgeUnifiedMonitor",
  [ValidateRange(100, 10000)]
  [int]$RefreshMilliseconds = 1000,
  [ValidateRange(0, 10000)]
  [int]$ExitAfterIterations = 0,
  [switch]$PlainOutput,
  [switch]$SkipForeground,
  [ValidateRange(0, 5000)]
  [int]$ReadHoldMilliseconds = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$Host.UI.RawUI.WindowTitle = "Codex Bridge 統合モニター"
if (-not $WindowPlacementScript) {
  $WindowPlacementScript = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "monitor-window-placement.ps1"
}
if (-not $WindowConfigPath) {
  $monitorConfigRoot = if ($env:CODEX_BRIDGE_MONITOR_DIR) {
    $env:CODEX_BRIDGE_MONITOR_DIR
  } else {
    Join-Path $env:LOCALAPPDATA "Codex Bridge Monitor"
  }
  $WindowConfigPath = Join-Path $monitorConfigRoot "monitor.config.json"
}
$windowPlacement = $null
$windowPlacementError = $null
$windowPlacementApplied = $false
if ($WindowPlacementScript -and (Test-Path -LiteralPath $WindowPlacementScript -PathType Leaf)) {
  try {
    . $WindowPlacementScript
    $windowPlacement = Get-CodexBridgeMonitorPlacement $WindowConfigPath
  } catch {
    $windowPlacementError = $_.Exception.Message
  }
}
$finalStatuses = @("completed", "waiting_for_user", "needs_review", "failed", "cancelled")
$knownSystems = @(
  @{ id = "tsa"; label = "TSA" },
  @{ id = "tsg"; label = "TSG" },
  @{ id = "docscanner"; label = "DocScanner" }
)
$createdNew = $false
$monitorMutex = New-Object System.Threading.Mutex($true, $MutexName, [ref]$createdNew)
if (-not $createdNew) {
  $monitorMutex.Dispose()
  exit 0
}

function Write-Utf8Json([string]$Path, $Value) {
  $parent = Split-Path -Parent $Path
  if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $json = $Value | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Read-Utf8Json([string]$Path) {
  $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
  $shareMode = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
  $stream = [System.IO.FileStream]::new(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    $shareMode
  )
  try {
    $reader = [System.IO.StreamReader]::new($stream, $strictUtf8, $true, 1024, $true)
    try {
      $json = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    if ($ReadHoldMilliseconds -gt 0) {
      Start-Sleep -Milliseconds $ReadHoldMilliseconds
    }
  } finally {
    $stream.Dispose()
  }
  if ([string]::IsNullOrWhiteSpace($json)) { throw "状態ファイルが空です" }
  return $json | ConvertFrom-Json -ErrorAction Stop
}

function Parse-Time([string]$Value) {
  if (-not $Value) { return $null }
  try { return ([DateTimeOffset]::Parse($Value)).ToLocalTime() } catch { return $null }
}

function Format-Duration([double]$Seconds) {
  $value = [Math]::Max(0, [Math]::Floor($Seconds))
  $hours = [Math]::Floor($value / 3600)
  $minutes = [Math]::Floor(($value % 3600) / 60)
  $seconds = $value % 60
  if ($hours -gt 0) { return "{0}時間{1:00}分{2:00}秒" -f $hours, $minutes, $seconds }
  return "{0}分{1:00}秒" -f $minutes, $seconds
}

function Format-EtaWindow([string]$EarliestValue, [string]$LatestValue, [DateTimeOffset]$Now) {
  $earliest = Parse-Time $EarliestValue
  $latest = Parse-Time $LatestValue
  if ($null -eq $earliest -or $null -eq $latest) { return "算出中" }
  if ($latest -lt $Now) { return "目安超過（処理継続中）" }
  return "{0} - {1}頃" -f $earliest.ToString("HH:mm"), $latest.ToString("HH:mm")
}

function Clean-Text($Value, [int]$Maximum = 100) {
  $text = [regex]::Replace([string]$Value, "https?://\S+", "[URL]", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text = [regex]::Replace($text, "\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text = [regex]::Replace($text, "\b(password|passwd|token|secret|cookie|authorization)\s*[:=]\s*[^\s,;]+", '$1=[REDACTED]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text = ($text -replace "[\r\n\t]+", " " -replace "\s{2,}", " ").Trim()
  if ($text.Length -le $Maximum) { return $text }
  return $text.Substring(0, [Math]::Max(1, $Maximum - 1)) + "…"
}

function Test-LocalProcess($Value) {
  [int]$processId = 0
  if (-not [int]::TryParse([string]$Value, [ref]$processId) -or $processId -le 0) { return $false }
  return $null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Status-Display([string]$Status) {
  switch ($Status) {
    "idle" { return @{ label = "待機中"; color = "DarkCyan" } }
    "running" { return @{ label = "実行中"; color = "Cyan" } }
    "completed" { return @{ label = "完了"; color = "Green" } }
    "waiting_for_user" { return @{ label = "操作待ち"; color = "Yellow" } }
    "needs_review" { return @{ label = "確認待ち"; color = "Yellow" } }
    "failed" { return @{ label = "失敗"; color = "Red" } }
    "cancelled" { return @{ label = "停止済み"; color = "DarkYellow" } }
    "stalled" { return @{ label = "応答停止"; color = "Red" } }
    "offline" { return @{ label = "オフライン"; color = "DarkYellow" } }
    default { return @{ label = "状態不明"; color = "Yellow" } }
  }
}

function Add-Line($Lines, [string]$Text, [string]$Color = "Gray") {
  $Lines.Add([pscustomobject]@{ text = $Text; color = $Color }) | Out-Null
}

function Get-StateSnapshot([string]$Directory) {
  $states = New-Object System.Collections.Generic.List[object]
  $errors = New-Object System.Collections.Generic.List[string]
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  foreach ($file in @(Get-ChildItem -LiteralPath $Directory -File -Filter "*.json" -ErrorAction SilentlyContinue | Sort-Object Name)) {
    try {
      $state = Read-Utf8Json $file.FullName
      if (-not $state.system -or -not $state.workerId) { throw "systemまたはworkerIdがありません" }
      $state | Add-Member -NotePropertyName sourceFile -NotePropertyValue $file.Name -Force
      $states.Add($state) | Out-Null
    } catch {
      $errors.Add(("{0}: {1}" -f $file.Name, (Clean-Text $_.Exception.Message 100))) | Out-Null
    }
  }
  return [pscustomobject]@{ states = $states.ToArray(); errors = $errors.ToArray() }
}

$windowHandle = [IntPtr]::Zero
$foregroundActivated = $false
$broughtForward = $false
$cursorRendering = $false
if (-not $PlainOutput) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CodexBridgeUnifiedMonitorWindow {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
  [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
  [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
"@
  $windowHandle = [CodexBridgeUnifiedMonitorWindow]::GetConsoleWindow()
  $inputHandle = [CodexBridgeUnifiedMonitorWindow]::GetStdHandle(-10)
  $consoleMode = [uint32]0
  if ($inputHandle -ne [IntPtr]::Zero -and [CodexBridgeUnifiedMonitorWindow]::GetConsoleMode($inputHandle, [ref]$consoleMode)) {
    $consoleMode = ($consoleMode -bor 0x80) -band (-bnot 0x40)
    [void][CodexBridgeUnifiedMonitorWindow]::SetConsoleMode($inputHandle, $consoleMode)
  }
  if (-not $SkipForeground -and $windowHandle -ne [IntPtr]::Zero) {
    [void][CodexBridgeUnifiedMonitorWindow]::ShowWindowAsync($windowHandle, 9)
    if ($windowPlacement) {
      try {
        $windowPlacementApplied = Move-CodexBridgeMonitorWindow $windowHandle $windowPlacement
      } catch {
        $windowPlacementError = $_.Exception.Message
      }
    }
    $topmostShown = [CodexBridgeUnifiedMonitorWindow]::SetWindowPos($windowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x0043)
    Start-Sleep -Milliseconds 150
    $topmostReleased = [CodexBridgeUnifiedMonitorWindow]::SetWindowPos($windowHandle, [IntPtr](-2), 0, 0, 0, 0, 0x0043)
    $broughtForward = $topmostShown -and $topmostReleased
    $foregroundActivated = [CodexBridgeUnifiedMonitorWindow]::SetForegroundWindow($windowHandle)
  }
  try {
    [Console]::CursorVisible = $false
    [Console]::SetCursorPosition(0, 0)
    $cursorRendering = $true
  } catch {
    $cursorRendering = $false
  }
}

$acknowledgement = @{
  monitorId = "codex-bridge-unified"
  monitorVersion = 2
  monitorPid = $PID
  windowHandle = $windowHandle.ToInt64()
  stateDirectory = $StateDirectory
  foregroundActivated = $foregroundActivated
  broughtForward = $broughtForward
  windowPlacement = if ($windowPlacement) {
    @{
      requested = $true
      applied = $windowPlacementApplied
      displayNumber = $windowPlacement.displayNumber
      deviceName = $windowPlacement.deviceName
      x = $windowPlacement.x
      y = $windowPlacement.y
      width = $windowPlacement.width
      height = $windowPlacement.height
      error = $windowPlacementError
    }
  } else {
    @{ requested = $false; applied = $false; error = $windowPlacementError }
  }
  startedAt = [DateTimeOffset]::UtcNow.ToString("o")
}
Write-Utf8Json $AckPath $acknowledgement

$previousRenderedLines = @()
$previousRenderWidth = 0
$lastCursorKey = ""
$lastFallbackKey = ""
$nextWindowPlacementRetryAt = [DateTimeOffset]::UtcNow
function Get-ConsoleCodePointWidth([int]$CodePoint) {
  if ($CodePoint -gt 0xFFFF) { return 2 }
  if (
    ($CodePoint -ge 0x1100 -and $CodePoint -le 0x115F) -or
    ($CodePoint -ge 0x2329 -and $CodePoint -le 0x232A) -or
    ($CodePoint -ge 0x2E80 -and $CodePoint -le 0xA4CF) -or
    ($CodePoint -ge 0xAC00 -and $CodePoint -le 0xD7A3) -or
    ($CodePoint -ge 0xF900 -and $CodePoint -le 0xFAFF) -or
    ($CodePoint -ge 0xFE10 -and $CodePoint -le 0xFE19) -or
    ($CodePoint -ge 0xFE30 -and $CodePoint -le 0xFE6F) -or
    ($CodePoint -ge 0xFF00 -and $CodePoint -le 0xFF60) -or
    ($CodePoint -ge 0xFFE0 -and $CodePoint -le 0xFFE6)
  ) { return 2 }
  return 1
}

function ConvertTo-StableConsoleLine([string]$Text, [int]$Width) {
  $clean = Clean-Text $Text 1000
  $fragments = New-Object System.Collections.Generic.List[object]
  $totalCells = 0
  for ($index = 0; $index -lt $clean.Length; $index += 1) {
    $length = 1
    $codePoint = [int][char]$clean[$index]
    if (
      [char]::IsHighSurrogate($clean[$index]) -and
      $index + 1 -lt $clean.Length -and
      [char]::IsLowSurrogate($clean[$index + 1])
    ) {
      $codePoint = [char]::ConvertToUtf32($clean, $index)
      $length = 2
    }
    $cells = Get-ConsoleCodePointWidth $codePoint
    $fragments.Add([pscustomobject]@{
      text = $clean.Substring($index, $length)
      cells = $cells
    }) | Out-Null
    $totalCells += $cells
    if ($length -eq 2) { $index += 1 }
  }

  $builder = New-Object System.Text.StringBuilder
  $usedCells = 0
  if ($totalCells -le $Width) {
    foreach ($fragment in $fragments) {
      [void]$builder.Append($fragment.text)
      $usedCells += $fragment.cells
    }
  } else {
    $contentLimit = [Math]::Max(1, $Width - 3)
    foreach ($fragment in $fragments) {
      if ($usedCells + $fragment.cells -gt $contentLimit) { break }
      [void]$builder.Append($fragment.text)
      $usedCells += $fragment.cells
    }
    [void]$builder.Append("...")
    $usedCells += 3
  }
  if ($usedCells -lt $Width) { [void]$builder.Append(" " * ($Width - $usedCells)) }
  return $builder.ToString()
}

function Render-Dashboard($Lines, [string]$RenderKey) {
  if ($PlainOutput) {
    foreach ($line in $Lines) { Write-Output $line.text }
    return
  }
  if (-not $cursorRendering) {
    if ($RenderKey -eq $script:lastFallbackKey) { return }
    foreach ($line in $Lines) { Write-Host $line.text -ForegroundColor $line.color }
    Write-Host ("=" * 72) -ForegroundColor DarkGray
    $script:lastFallbackKey = $RenderKey
    return
  }
  try {
    $width = [Math]::Max(60, [Math]::Min(140, [Console]::WindowWidth - 1))
    if ($RenderKey -eq $script:lastCursorKey -and $width -eq $script:previousRenderWidth) { return }
    $renderedLines = @(
      foreach ($entry in $Lines) {
        [pscustomobject]@{
          text = ConvertTo-StableConsoleLine $entry.text $width
          color = [string]$entry.color
        }
      }
    )
    $lineCount = [Math]::Max($script:previousRenderedLines.Count, $renderedLines.Count)
    $originalColor = [Console]::ForegroundColor
    for ($index = 0; $index -lt $lineCount; $index += 1) {
      if ($index -lt $renderedLines.Count) {
        $entry = $renderedLines[$index]
      } else {
        $entry = [pscustomobject]@{ text = " " * $width; color = "Gray" }
      }
      $previous = if ($index -lt $script:previousRenderedLines.Count) { $script:previousRenderedLines[$index] } else { $null }
      if ($previous -and $previous.text -ceq $entry.text -and $previous.color -ceq $entry.color) { continue }
      [Console]::SetCursorPosition(0, $index)
      [Console]::ForegroundColor = [System.Enum]::Parse([ConsoleColor], $entry.color)
      [Console]::Write($entry.text)
    }
    [Console]::ForegroundColor = $originalColor
    [Console]::SetCursorPosition(0, [Math]::Min($renderedLines.Count, [Console]::BufferHeight - 1))
    $script:previousRenderedLines = $renderedLines
    $script:previousRenderWidth = $width
    $script:lastCursorKey = $RenderKey
  } catch {
    $script:cursorRendering = $false
    $script:lastFallbackKey = ""
  }
}

try {
  $iteration = 0
  while ($true) {
    $now = [DateTimeOffset]::Now
    if (
      -not $windowPlacement -and
      $WindowPlacementScript -and
      $now -ge $nextWindowPlacementRetryAt
    ) {
      $nextWindowPlacementRetryAt = $now.AddSeconds(5)
      try {
        if (-not (Get-Command Get-CodexBridgeMonitorPlacement -ErrorAction SilentlyContinue)) {
          . $WindowPlacementScript
        }
        $recoveredPlacement = Get-CodexBridgeMonitorPlacement $WindowConfigPath
        if ($recoveredPlacement) {
          $windowPlacement = $recoveredPlacement
          $windowPlacementError = $null
          if (-not $PlainOutput -and $windowHandle -ne [IntPtr]::Zero) {
            $windowPlacementApplied = Move-CodexBridgeMonitorWindow $windowHandle $windowPlacement
          }
          $acknowledgement.windowPlacement = @{
            requested = $true
            applied = $windowPlacementApplied
            displayNumber = $windowPlacement.displayNumber
            deviceName = $windowPlacement.deviceName
            x = $windowPlacement.x
            y = $windowPlacement.y
            width = $windowPlacement.width
            height = $windowPlacement.height
            error = $null
          }
          Write-Utf8Json $AckPath $acknowledgement
        }
      } catch {
        $windowPlacementError = $_.Exception.Message
        $acknowledgement.windowPlacement.error = $windowPlacementError
      }
    }
    $snapshot = Get-StateSnapshot $StateDirectory
    $lines = New-Object System.Collections.Generic.List[object]
    Add-Line $lines "Codex Bridge 統合モニター" "Cyan"
    Add-Line $lines ("更新 {0}  1画面でTSA・TSG・DocScannerを監視" -f $now.ToString("yyyy/MM/dd HH:mm:ss")) "DarkGray"
    Add-Line $lines ("=" * 72) "DarkGray"

    foreach ($definition in $knownSystems) {
      Add-Line $lines $definition.label "White"
      $records = @($snapshot.states | Where-Object { [string]$_.system -eq $definition.id } | Sort-Object @{ Expression = { if ($_.executionMode -eq "interactive") { 0 } else { 1 } } }, workerName)
      if ($records.Count -eq 0) {
        Add-Line $lines "  [未導入] Bridge状態ファイルがありません" "DarkYellow"
        Add-Line $lines "" "Gray"
        continue
      }

      foreach ($state in $records) {
        $heartbeat = Parse-Time ([string]$state.heartbeatAt)
        if ($null -eq $heartbeat) { $heartbeat = Parse-Time ([string]$state.updatedAt) }
        $heartbeatAge = if ($null -eq $heartbeat) { [double]::PositiveInfinity } else { ($now - $heartbeat).TotalSeconds }
        $bridgeAlive = Test-LocalProcess $state.bridgePid
        $status = [string]$state.status
        if (-not $status) { $status = "offline" }
        if (-not $bridgeAlive) {
          $status = "offline"
        } elseif ($heartbeatAge -gt 30 -and -not ($finalStatuses -contains $status)) {
          $status = "stalled"
        }
        $display = Status-Display $status
        $mode = if ($state.executionMode -eq "headless-prelogin") { "ログイン前" } else { "通常" }
        $progress = [Math]::Max(0, [Math]::Min(100, [int]$state.progress))
        $task = if ($state.taskLabel) { Clean-Text $state.taskLabel 55 } else { "ジョブなし" }
        $target = if ($state.productName) { " / " + (Clean-Text $state.productName 45) } else { "" }
        Add-Line $lines ("  {0} [{1} {2}%] {3}{4}" -f (Clean-Text $state.workerName 30), $display.label, $progress, $task, $target) $display.color

        if ($status -in @("running", "waiting_for_user", "needs_review", "failed", "cancelled", "completed", "stalled")) {
          Add-Line $lines ("    工程: {0}" -f (Clean-Text $state.currentStep 100)) "Gray"
          $started = Parse-Time ([string]$state.startedAt)
          $elapsed = if ($null -eq $started) { "不明" } else { Format-Duration (($now - $started).TotalSeconds) }
          $response = Parse-Time ([string]$state.lastResponseAt)
          $responseAge = if ($null -eq $response) { "不明" } else { (Format-Duration (($now - $response).TotalSeconds)) + "前" }
          $eta = if ($finalStatuses -contains [string]$state.status) { "終了" } else { Format-EtaWindow ([string]$state.estimatedEarliestAt) ([string]$state.estimatedLatestAt) $now }
          Add-Line $lines ("    経過: {0} / 完了目安: {1} / 最終応答: {2}" -f $elapsed, $eta, $responseAge) "DarkGray"
          if ($state.operatorWaitReason) { Add-Line $lines ("    操作待ち: {0}" -f (Clean-Text $state.operatorWaitReason 100)) "Yellow" }
        } else {
          $heartbeatText = if ([double]::IsPositiveInfinity($heartbeatAge)) { "不明" } else { (Format-Duration $heartbeatAge) + "前" }
          Add-Line $lines ("    {0} / 状態更新: {1}" -f $mode, $heartbeatText) "DarkGray"
        }

        $codexPid = if ($state.codexPid) { [string]$state.codexPid } else { "-" }
        $jobId = if ($state.jobId) { Clean-Text $state.jobId 44 } else { "-" }
        Add-Line $lines ("    Bridge PID {0} / Codex PID {1} / Job {2}" -f [string]$state.bridgePid, $codexPid, $jobId) "DarkGray"
        if ($state.lastTerminal -and $status -in @("idle", "offline")) {
          Add-Line $lines ("    直近: {0} / {1} / {2}" -f (Clean-Text $state.lastTerminal.taskLabel 40), (Status-Display ([string]$state.lastTerminal.status)).label, (Clean-Text $state.lastTerminal.summary 70)) "DarkCyan"
        }
      }
      Add-Line $lines "" "Gray"
    }

    if ($snapshot.errors.Count -gt 0) {
      Add-Line $lines "状態読込エラー（Bridge本体の処理は継続）" "Red"
      foreach ($readError in $snapshot.errors) { Add-Line $lines ("  " + $readError) "DarkYellow" }
    }
    Add-Line $lines "モニターを閉じてもBridgeジョブは停止しません。" "DarkGray"

    $ageBucket = [Math]::Floor($now.ToUnixTimeSeconds() / 5)
    $renderKey = (($snapshot.states | ConvertTo-Json -Depth 8 -Compress) + "|" + ($snapshot.errors -join "|") + "|" + $ageBucket)
    Render-Dashboard $lines $renderKey
    if (-not (Test-Path -LiteralPath $AckPath -PathType Leaf) -or ($iteration % 30) -eq 0) {
      $acknowledgement.lastConfirmedAt = [DateTimeOffset]::UtcNow.ToString("o")
      Write-Utf8Json $AckPath $acknowledgement
    }
    $iteration += 1
    if ($ExitAfterIterations -gt 0 -and $iteration -ge $ExitAfterIterations) { break }
    Start-Sleep -Milliseconds $RefreshMilliseconds
  }
} catch {
  Write-Host "統合モニター表示エラー。Bridge本体の処理は継続しています。" -ForegroundColor Red
  Write-Host ("詳細: {0}" -f (Clean-Text $_.Exception.Message 160)) -ForegroundColor DarkYellow
  if ($_.InvocationInfo.PositionMessage) {
    Write-Host ("発生箇所: {0}" -f (Clean-Text $_.InvocationInfo.PositionMessage 200)) -ForegroundColor DarkGray
  }
  if ($ExitAfterIterations -eq 0) { Start-Sleep -Seconds 15 }
} finally {
  if (-not $PlainOutput) {
    try { [Console]::CursorVisible = $true } catch { }
  }
  if ($createdNew) { [void]$monitorMutex.ReleaseMutex() }
  $monitorMutex.Dispose()
}
