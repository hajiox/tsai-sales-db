param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$StartDate,
  [Parameter(Mandatory = $true)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$EndDate,
  [Parameter(Mandatory = $true)][string]$DownloadDirectory,
  [string]$ExpectedAccount = "会津ブランド館",
  [ValidateRange(30, 600)][int]$TimeoutSeconds = 300,
  [switch]$InspectOnly
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Result {
  param(
    [Parameter(Mandatory = $true)][string]$Status,
    [Parameter(Mandatory = $true)][string]$Summary,
    [string]$DownloadedFile = "",
    [string]$Url = ""
  )

  [ordered]@{
    status = $Status
    summary = $Summary
    downloadedFile = $DownloadedFile
    url = $Url
  } | ConvertTo-Json -Compress
}

function Get-ElementValue {
  param([Parameter(Mandatory = $true)]$Element)

  try {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    return [string]$pattern.Current.Value
  } catch {
    return ""
  }
}

function Get-CsvSnapshot {
  param([Parameter(Mandatory = $true)][string]$Directory)

  $snapshot = @{}
  Get-ChildItem -LiteralPath $Directory -File -Filter "*.csv" -ErrorAction SilentlyContinue | ForEach-Object {
    $snapshot[$_.FullName.ToLowerInvariant()] = "$($_.Length):$($_.LastWriteTimeUtc.Ticks)"
  }
  return $snapshot
}

function Find-ChangedCsv {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][hashtable]$Before,
    [Parameter(Mandatory = $true)][datetime]$InvokedAtUtc
  )

  return Get-ChildItem -LiteralPath $Directory -File -Filter "*.csv" -ErrorAction SilentlyContinue |
    Where-Object {
      $key = $_.FullName.ToLowerInvariant()
      $signature = "$($_.Length):$($_.LastWriteTimeUtc.Ticks)"
      $_.Length -gt 0 -and $_.LastWriteTimeUtc -ge $InvokedAtUtc.AddSeconds(-2) -and $Before[$key] -ne $signature
    } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
}

try {
  if (-not (Test-Path -LiteralPath $DownloadDirectory -PathType Container)) {
    throw "ダウンロードフォルダが見つかりません"
  }

  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  $expectedStart = $StartDate.Replace("-", "/")
  $expectedEnd = $EndDate.Replace("-", "/")
  $trueCondition = [System.Windows.Automation.Condition]::TrueCondition
  $candidates = @()

  foreach ($process in @(Get-Process -Name chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })) {
    try {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      if (-not $root) { continue }
      $tabs = @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition) | Where-Object {
        $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem -and
        $_.Current.Name -like "Business Reports*"
      })

      foreach ($tab in $tabs) {
        try {
          $selection = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
          $selection.Select()
          Start-Sleep -Milliseconds 500

          $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition)
          $address = @($elements | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and
            (Get-ElementValue $_) -match '^https?://sellercentral\.amazon\.co\.jp/business-reports|^sellercentral\.amazon\.co\.jp/business-reports'
          } | Select-Object -First 1)
          if ($address.Count -ne 1) { continue }

          $url = Get-ElementValue $address[0]
          if ($url -notmatch '^https?://') { $url = "https://$url" }
          $uri = [Uri]$url
          if ($uri.Host -ne "sellercentral.amazon.co.jp" -or $uri.AbsolutePath -ne "/business-reports" -or $uri.Fragment -notmatch "DetailSalesTrafficByChildItem") { continue }

          $values = @($elements | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit
          } | ForEach-Object { Get-ElementValue $_ })
          $accountCount = @($elements | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and
            $_.Current.Name -eq $ExpectedAccount
          }).Count
          $buttons = @($elements | Where-Object {
            $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
            $_.Current.Name -eq "ダウンロード（.csv）"
          })

          if ($accountCount -lt 1 -or $values -notcontains $expectedStart -or $values -notcontains $expectedEnd -or $buttons.Count -ne 1) {
            continue
          }

          $candidates += [pscustomobject]@{
            Root = $root
            Tab = $tab
            Url = $url
          }
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  if ($candidates.Count -ne 1) {
    Write-Result -Status "unsafe" -Summary "対象期間・アカウント・Amazon Business Reportsを一意に確認できませんでした（$($candidates.Count)件）"
    exit 0
  }

  $candidate = $candidates[0]
  $candidate.Tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
  Start-Sleep -Milliseconds 500
  $elements = $candidate.Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $trueCondition)
  $currentAddress = @($elements | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and
    (Get-ElementValue $_) -match '^https?://sellercentral\.amazon\.co\.jp/business-reports|^sellercentral\.amazon\.co\.jp/business-reports'
  } | Select-Object -First 1)
  $currentUrl = if ($currentAddress.Count -eq 1) { Get-ElementValue $currentAddress[0] } else { "" }
  if ($currentUrl -and $currentUrl -notmatch '^https?://') { $currentUrl = "https://$currentUrl" }
  $currentValues = @($elements | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit
  } | ForEach-Object { Get-ElementValue $_ })
  $currentAccountCount = @($elements | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and
    $_.Current.Name -eq $ExpectedAccount
  }).Count
  $button = @($elements | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
    $_.Current.Name -eq "ダウンロード（.csv）"
  })
  if (-not $currentUrl -or $currentUrl -ne $candidate.Url -or $currentUrl -notmatch "DetailSalesTrafficByChildItem" -or
    $currentAccountCount -lt 1 -or $currentValues -notcontains $expectedStart -or $currentValues -notcontains $expectedEnd -or
    $button.Count -ne 1) {
    Write-Result -Status "unsafe" -Summary "クリック直前のAmazon帳票・アカウント・対象期間・CSVボタン確認に失敗しました" -Url $currentUrl
    exit 0
  }

  if ($InspectOnly) {
    Write-Result -Status "ready" -Summary "Amazon帳票・アカウント・対象期間・CSVボタンを確認しました" -Url $candidate.Url
    exit 0
  }

  $before = Get-CsvSnapshot -Directory $DownloadDirectory
  $invokedAtUtc = [datetime]::UtcNow
  $invoke = $button[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()

  $deadline = [datetime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastPath = ""
  $lastSignature = ""
  $stableChecks = 0
  while ([datetime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 1
    $downloaded = Find-ChangedCsv -Directory $DownloadDirectory -Before $before -InvokedAtUtc $invokedAtUtc
    if (-not $downloaded) { continue }

    $signature = "$($downloaded.Length):$($downloaded.LastWriteTimeUtc.Ticks)"
    if ($downloaded.FullName -eq $lastPath -and $signature -eq $lastSignature) {
      $stableChecks++
    } else {
      $lastPath = $downloaded.FullName
      $lastSignature = $signature
      $stableChecks = 0
    }
    if ($stableChecks -ge 1) {
      Write-Result -Status "completed" -Summary "Amazon CSVをWindows経由で取得しました" -DownloadedFile $downloaded.FullName -Url $candidate.Url
      exit 0
    }
  }

  Write-Result -Status "timed_out" -Summary "Amazon CSVボタン実行後、$TimeoutSeconds秒以内にCSVを確認できませんでした" -Url $candidate.Url
  exit 0
} catch {
  Write-Result -Status "failed" -Summary ([string]$_.Exception.Message)
  exit 1
}
