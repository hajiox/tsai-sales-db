param([switch]$DiagnosticOnly)
﻿$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Write-DialogEvent([string]$Phase, [string]$Reason = "") {
  [Console]::Error.WriteLine('TSA_BROWSER_CONFIRMATION_EVENT ' + (@{ presentation=$Phase; reason=$Reason } | ConvertTo-Json -Compress))
}
if ($DiagnosticOnly) {
  # Explicitly synthetic, always cancelled; this path never consumes a real browser form.
  $request = @{ target='表示診断テスト（自動終了・業務操作なし）'; message='この画面は表示診断用です。2秒で閉じます。ブラウザー操作や許可の回答は行いません。'; fields=@() }
} else {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
}
if (-not [Environment]::UserInteractive -or [System.Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
  Write-DialogEvent 'failed' 'noninteractive_session'
  [Console]::Write('{"action":"cancel","content":null,"reason":"noninteractive_session"}')
  exit 0
}
$response = @{ action = 'cancel'; content = $null; reason = 'dialog_closed' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$mutex = New-Object System.Threading.Mutex($false, 'Local\TSA-SNS-Browser-Confirmation')
$locked = $false
try {
  $locked = $mutex.WaitOne(1000)
  if ($locked) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'TSA Bridge - ブラウザー確認'
    $form.Size = New-Object System.Drawing.Size(760, 680)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true
    $form.Font = New-Object System.Drawing.Font('Yu Gothic UI', 10)
    $layout = New-Object System.Windows.Forms.FlowLayoutPanel
    $layout.Dock = 'Fill'
    $layout.FlowDirection = 'TopDown'
    $layout.WrapContents = $false
    $layout.AutoScroll = $true
    $form.Controls.Add($layout)
    $heading = New-Object System.Windows.Forms.Label
    $heading.Text = [string]$request.target + "`r`nこの確認はブラウザーから届いたものです。内容を確認して回答すると、Bridgeが同じ処理を続行します。"
    $heading.Size = New-Object System.Drawing.Size(700, 70)
    $layout.Controls.Add($heading)
    $message = New-Object System.Windows.Forms.TextBox
    $message.Multiline = $true
    $message.ReadOnly = $true
    $message.ScrollBars = 'Vertical'
    $message.Text = [string]$request.message
    $message.Size = New-Object System.Drawing.Size(700, 220)
    $layout.Controls.Add($message)
    $controls = @{}
    foreach ($field in $request.fields) {
      $label = New-Object System.Windows.Forms.Label
      $label.Text = [string]$field.title + "`r`n" + [string]$field.description
      $label.AutoSize = $true
      $label.MaximumSize = New-Object System.Drawing.Size(700, 0)
      $layout.Controls.Add($label)
      if ($field.type -eq 'boolean') {
        $control = New-Object System.Windows.Forms.CheckBox
        $control.Text = 'はい（チェックなしは「いいえ」）'
        $control.Checked = $false
      } else {
        $control = New-Object System.Windows.Forms.ComboBox
        $control.DropDownStyle = 'DropDownList'
        foreach ($choice in $field.choices) { [void]$control.Items.Add([string]$choice) }
        $control.SelectedIndex = -1
      }
      $control.Width = 680
      $controls[[string]$field.name] = $control
      $layout.Controls.Add($control)
    }
    $buttons = New-Object System.Windows.Forms.FlowLayoutPanel
    $buttons.Size = New-Object System.Drawing.Size(700, 50)
    $submit = New-Object System.Windows.Forms.Button
    $submit.Text = '回答を送信'
    $submit.Width = 180
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = '中止'
    $cancel.Width = 100
    $cancel.Add_Click({ $form.Tag = @{ action='cancel'; content=$null; reason='user_cancelled' }; $form.Close() })
    $submit.Add_Click({
      if ($DiagnosticOnly) { $form.Close(); return }
      $values = @{}
      foreach ($field in $request.fields) {
        $control = $controls[[string]$field.name]
        if ($field.type -eq 'boolean') { $values[[string]$field.name] = $control.Checked }
        elseif ($control.SelectedIndex -ge 0) { $values[[string]$field.name] = [string]$control.SelectedItem }
        elseif ($field.required) { return }
      }
      $form.Tag = @{ action = 'accept'; content = $values }
      $form.Close()
    })
    $buttons.Controls.Add($submit)
    $buttons.Controls.Add($cancel)
    $layout.Controls.Add($buttons)
    # No default affirmative button. Close, Escape, and timeout are cancellation.
    $form.CancelButton = $cancel
    $expires = if ($DiagnosticOnly) { [DateTime]::UtcNow.AddSeconds(2) } else { [DateTime]::UtcNow.AddMinutes(5) }
    $form.Add_Shown({
      $form.Activate()
      $form.BringToFront()
      if ($form.Visible) { Write-DialogEvent 'shown' }
    })
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $timer.Add_Tick({
      if ([DateTime]::UtcNow -gt $expires) {
        $form.Tag = @{ action='cancel'; content=$null; reason='confirmation_timeout' }; $form.Close()
      } elseif (-not $DiagnosticOnly -and -not (Get-Process -Id ([int]$env:TSA_SNS_RELAY_PID) -ErrorAction SilentlyContinue)) {
        $form.Tag = @{ action='cancel'; content=$null; reason='transport_cancelled' }; $form.Close()
      }
    })
    $timer.Start()
    [void]$form.ShowDialog()
    $timer.Stop()
    $timer.Dispose()
    if ($null -ne $form.Tag) { $response = $form.Tag }
    $form.Dispose()
  } else {
    Write-DialogEvent 'failed' 'mutex_busy'
    $response = @{ action='cancel'; content=$null; reason='mutex_busy' }
  }
} catch {
  Write-DialogEvent 'failed' 'dialog_start_failed'
  $response = @{ action='cancel'; content=$null; reason='dialog_start_failed' }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
[Console]::Write(($response | ConvertTo-Json -Depth 10 -Compress))
