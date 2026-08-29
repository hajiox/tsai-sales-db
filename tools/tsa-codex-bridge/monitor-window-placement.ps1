function Read-CodexBridgeMonitorWindowConfig([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try {
    $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
    return [System.IO.File]::ReadAllText($Path, $strictUtf8) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-CodexBridgeMonitorPlacement([string]$ConfigPath) {
  $config = Read-CodexBridgeMonitorWindowConfig $ConfigPath
  if (-not $config) { return $null }

  Add-Type -AssemblyName System.Windows.Forms
  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  if ($screens.Count -eq 0) { return $null }

  $selected = $null
  $requestedDeviceName = [string]$config.preferredDeviceName
  if ($requestedDeviceName) {
    $selected = $screens | Where-Object {
      $_.DeviceName.Equals($requestedDeviceName, [System.StringComparison]::OrdinalIgnoreCase)
    } | Select-Object -First 1
  }

  [int]$requestedDisplayNumber = 0
  [void][int]::TryParse([string]$config.preferredDisplayNumber, [ref]$requestedDisplayNumber)
  if (-not $selected -and $requestedDisplayNumber -ge 1 -and $requestedDisplayNumber -le $screens.Count) {
    $selected = $screens[$requestedDisplayNumber - 1]
  }
  if (-not $selected) {
    $selected = $screens | Where-Object { $_.Primary } | Select-Object -First 1
  }
  if (-not $selected) { $selected = $screens[0] }

  $displayNumber = 1
  for ($index = 0; $index -lt $screens.Count; $index += 1) {
    if ($screens[$index].DeviceName -eq $selected.DeviceName) {
      $displayNumber = $index + 1
      break
    }
  }

  $work = $selected.WorkingArea
  [int]$offsetX = 24
  [int]$offsetY = 24
  [int]$width = 0
  [int]$height = 0
  [void][int]::TryParse([string]$config.offsetX, [ref]$offsetX)
  [void][int]::TryParse([string]$config.offsetY, [ref]$offsetY)
  [void][int]::TryParse([string]$config.width, [ref]$width)
  [void][int]::TryParse([string]$config.height, [ref]$height)
  $offsetX = [Math]::Max(0, [Math]::Min($offsetX, [Math]::Max(0, $work.Width - 160)))
  $offsetY = [Math]::Max(0, [Math]::Min($offsetY, [Math]::Max(0, $work.Height - 120)))

  return [pscustomobject]@{
    displayNumber = $displayNumber
    deviceName = $selected.DeviceName
    x = $work.Left + $offsetX
    y = $work.Top + $offsetY
    width = $width
    height = $height
    workingLeft = $work.Left
    workingTop = $work.Top
    workingWidth = $work.Width
    workingHeight = $work.Height
  }
}

function Initialize-CodexBridgeMonitorPlacementNative {
  if ("CodexBridgeMonitorWindowPlacementNative" -as [type]) { return }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CodexBridgeMonitorWindowPlacementNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}
"@
}

function Move-CodexBridgeMonitorWindow([IntPtr]$Handle, $Placement) {
  if ($Handle -eq [IntPtr]::Zero -or -not $Placement) { return $false }
  Initialize-CodexBridgeMonitorPlacementNative

  $rect = New-Object CodexBridgeMonitorWindowPlacementNative+RECT
  [void][CodexBridgeMonitorWindowPlacementNative]::GetWindowRect($Handle, [ref]$rect)
  $currentWidth = [Math]::Max(640, $rect.Right - $rect.Left)
  $currentHeight = [Math]::Max(360, $rect.Bottom - $rect.Top)
  $requestedWidth = if ([int]$Placement.width -gt 0) { [int]$Placement.width } else { $currentWidth }
  $requestedHeight = if ([int]$Placement.height -gt 0) { [int]$Placement.height } else { $currentHeight }
  $availableWidth = [Math]::Max(320, ([int]$Placement.workingLeft + [int]$Placement.workingWidth) - [int]$Placement.x)
  $availableHeight = [Math]::Max(240, ([int]$Placement.workingTop + [int]$Placement.workingHeight) - [int]$Placement.y)
  $width = [Math]::Min([Math]::Max(640, $requestedWidth), $availableWidth)
  $height = [Math]::Min([Math]::Max(360, $requestedHeight), $availableHeight)

  return [CodexBridgeMonitorWindowPlacementNative]::SetWindowPos(
    $Handle,
    [IntPtr]::Zero,
    [int]$Placement.x,
    [int]$Placement.y,
    $width,
    $height,
    0x0054
  )
}
