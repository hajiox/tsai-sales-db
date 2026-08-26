param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][int]$Width,
  [Parameter(Mandatory = $true)][int]$Height,
  [ValidateSet("normal", "creative", "arrange")][string]$Mode = "normal",
  [string]$Headline = "",
  [string]$Subline = "",
  [ValidateSet("none", "top-left", "top-right", "bottom-left", "bottom-right")][string]$Placement = "none"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
  throw "SNS image input was not found: $InputPath"
}
if ($Width -lt 320 -or $Width -gt 4000 -or $Height -lt 320 -or $Height -gt 4000) {
  throw "SNS image dimensions are outside the allowed range: ${Width}x${Height}"
}
if ($Mode -eq "creative" -and ([string]::IsNullOrWhiteSpace($Headline) -or $Placement -eq "none")) {
  throw "Creative mode requires a headline and placement"
}

function New-FittingFont {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.RectangleF]$Bounds,
    [float]$MaximumSize,
    [float]$MinimumSize,
    [System.Drawing.FontStyle]$Style
  )
  $size = $MaximumSize
  while ($size -gt $MinimumSize) {
    $font = [System.Drawing.Font]::new("Meiryo", $size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    $measured = $Graphics.MeasureString($Text, $font, [int]$Bounds.Width)
    if ($measured.Width -le $Bounds.Width -and $measured.Height -le $Bounds.Height) { return $font }
    $font.Dispose()
    $size -= 2
  }
  return [System.Drawing.Font]::new("Meiryo", $MinimumSize, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

$source = $null
$canvas = $null
$graphics = $null
$encoderParameters = $null
try {
  $source = [System.Drawing.Image]::FromFile($InputPath)
  if ($source.Width -lt 1 -or $source.Height -lt 1) { throw "SNS image dimensions could not be read" }

  $canvas = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Black)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $sourceAspect = [double]$source.Width / [double]$source.Height
  $targetAspect = [double]$Width / [double]$Height
  if ($sourceAspect -gt $targetAspect) {
    $cropHeight = [double]$source.Height
    $cropWidth = $cropHeight * $targetAspect
    $cropX = ([double]$source.Width - $cropWidth) / 2
    $cropY = 0
  } else {
    $cropWidth = [double]$source.Width
    $cropHeight = $cropWidth / $targetAspect
    $cropX = 0
    $cropY = ([double]$source.Height - $cropHeight) / 2
  }
  $graphics.DrawImage(
    $source,
    [System.Drawing.Rectangle]::new(0, 0, $Width, $Height),
    [int][Math]::Round($cropX),
    [int][Math]::Round($cropY),
    [int][Math]::Round($cropWidth),
    [int][Math]::Round($cropHeight),
    [System.Drawing.GraphicsUnit]::Pixel
  )

  if ($Mode -eq "creative") {
    $margin = [float]([Math]::Round([Math]::Min($Width, $Height) * 0.055))
    $panelWidthRatio = if ($Height -gt $Width) { 0.78 } else { 0.47 }
    $panelHeightRatio = if ($Height -gt $Width) { 0.25 } else { 0.38 }
    $panelWidth = [float]([Math]::Round($Width * $panelWidthRatio))
    $panelHeight = [float]([Math]::Round($Height * $panelHeightRatio))
    $panelX = if ($Placement.EndsWith("right")) { [float]($Width - $panelWidth - $margin) } else { $margin }
    $panelY = if ($Placement.StartsWith("bottom")) { [float]($Height - $panelHeight - $margin) } else { $margin }
    $panel = [System.Drawing.RectangleF]::new($panelX, $panelY, $panelWidth, $panelHeight)
    $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(188, 14, 18, 26))
    $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 220, 38, 38))
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $sublineBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
    try {
      $graphics.FillRectangle($panelBrush, $panel)
      $accentWidth = [float]([Math]::Max(6, [Math]::Round($Width * 0.006)))
      $graphics.FillRectangle($accentBrush, [System.Drawing.RectangleF]::new($panelX, $panelY, $accentWidth, $panelHeight))

      $innerX = $panelX + $accentWidth + ($margin * 0.48)
      $innerWidth = $panelWidth - $accentWidth - ($margin * 0.9)
      $headlineHeightRatio = if ([string]::IsNullOrWhiteSpace($Subline)) { 0.78 } else { 0.57 }
      $headlineHeight = $panelHeight * $headlineHeightRatio
      $headlineBounds = [System.Drawing.RectangleF]::new($innerX, $panelY + ($margin * 0.42), $innerWidth, $headlineHeight)
      $headlineFont = New-FittingFont -Graphics $graphics -Text $Headline -Bounds $headlineBounds -MaximumSize ([float]([Math]::Max(34, $Width * 0.055))) -MinimumSize 24 -Style ([System.Drawing.FontStyle]::Bold)
      try {
        $graphics.DrawString($Headline, $headlineFont, $textBrush, $headlineBounds)
      } finally {
        $headlineFont.Dispose()
      }

      if (-not [string]::IsNullOrWhiteSpace($Subline)) {
        $sublineBounds = [System.Drawing.RectangleF]::new($innerX, $panelY + ($panelHeight * 0.66), $innerWidth, $panelHeight * 0.24)
        $sublineFont = New-FittingFont -Graphics $graphics -Text $Subline -Bounds $sublineBounds -MaximumSize ([float]([Math]::Max(22, $Width * 0.027))) -MinimumSize 16 -Style ([System.Drawing.FontStyle]::Regular)
        try {
          $graphics.DrawString($Subline, $sublineFont, $sublineBrush, $sublineBounds)
        } finally {
          $sublineFont.Dispose()
        }
      }
    } finally {
      $panelBrush.Dispose()
      $accentBrush.Dispose()
      $textBrush.Dispose()
      $sublineBrush.Dispose()
    }
  }

  $outputDirectory = Split-Path -Parent $OutputPath
  if ($outputDirectory) { New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null }
  $jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg" | Select-Object -First 1
  if (-not $jpegEncoder) { throw "JPEG encoder was not found" }
  $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
  $encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]91)
  $canvas.Save($OutputPath, $jpegEncoder, $encoderParameters)
  Write-Output (ConvertTo-Json @{ ok = $true; path = $OutputPath; width = $Width; height = $Height; mode = $Mode } -Compress)
} finally {
  if ($encoderParameters) { $encoderParameters.Dispose() }
  if ($graphics) { $graphics.Dispose() }
  if ($canvas) { $canvas.Dispose() }
  if ($source) { $source.Dispose() }
}
