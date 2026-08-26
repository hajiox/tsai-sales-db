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

function Add-EdgeScrim {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$CanvasWidth,
    [int]$CanvasHeight,
    [string]$Anchor
  )
  $isPortrait = $CanvasHeight -gt ($CanvasWidth * 1.15)
  $isBottom = $Anchor.StartsWith("bottom")
  $isRight = $Anchor.EndsWith("right")
  $dark = [System.Drawing.Color]::FromArgb(188, 12, 17, 20)
  $transparent = [System.Drawing.Color]::FromArgb(0, 12, 17, 20)
  $scrim = $null
  if ($isPortrait) {
    $extent = [float]($CanvasHeight * 0.46)
    $y = if ($isBottom) { [float]($CanvasHeight - $extent) } else { [float]0 }
    $bounds = [System.Drawing.RectangleF]::new(0, $y, $CanvasWidth, $extent)
    $start = if ($isBottom) { $transparent } else { $dark }
    $end = if ($isBottom) { $dark } else { $transparent }
    $scrim = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $bounds,
      $start,
      $end,
      [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
  } else {
    $extent = [float]($CanvasWidth * 0.62)
    $x = if ($isRight) { [float]($CanvasWidth - $extent) } else { [float]0 }
    $bounds = [System.Drawing.RectangleF]::new($x, 0, $extent, $CanvasHeight)
    $start = if ($isRight) { $transparent } else { $dark }
    $end = if ($isRight) { $dark } else { $transparent }
    $scrim = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $bounds,
      $start,
      $end,
      [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
    )
  }
  try {
    $Graphics.FillRectangle($scrim, $bounds)
  } finally {
    if ($null -ne $scrim) {
      $scrim.Dispose()
    }
  }
}

function Draw-StringWithShadow {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [System.Drawing.RectangleF]$Bounds,
    [float]$Offset
  )
  $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150, 0, 0, 0))
  try {
    $shadowBounds = [System.Drawing.RectangleF]::new(
      $Bounds.X + $Offset,
      $Bounds.Y + $Offset,
      $Bounds.Width,
      $Bounds.Height
    )
    $Graphics.DrawString($Text, $Font, $shadow, $shadowBounds)
    $Graphics.DrawString($Text, $Font, $Brush, $Bounds)
  } finally {
    $shadow.Dispose()
  }
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
    Add-EdgeScrim -Graphics $graphics -CanvasWidth $Width -CanvasHeight $Height -Anchor $Placement
    $isPortrait = $Height -gt ($Width * 1.15)
    $margin = [float]([Math]::Round([Math]::Min($Width, $Height) * 0.062))
    $contentWidth = if ($isPortrait) { [float]($Width - ($margin * 2)) } else { [float]($Width * 0.44) }
    $contentHeight = if ($isPortrait) { [float]($Height * 0.29) } else { [float]($Height * 0.56) }
    $contentX = if ($Placement.EndsWith("right")) { [float]($Width - $contentWidth - $margin) } else { $margin }
    $contentY = if ($Placement.StartsWith("bottom")) { [float]($Height - $contentHeight - $margin) } else { $margin }
    $brandBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 255, 250, 244))
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 253, 249))
    $sublineBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 255, 253, 249))
    $accentPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 226, 74, 51), [float]([Math]::Max(4, $Width * 0.004)))
    $brandFont = [System.Drawing.Font]::new("Meiryo", [float]([Math]::Max(16, [Math]::Min($Width, $Height) * 0.021)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    try {
      $brandHeight = [float]([Math]::Max(24, $contentHeight * 0.1))
      $brandBounds = [System.Drawing.RectangleF]::new($contentX, $contentY, $contentWidth, $brandHeight)
      Draw-StringWithShadow -Graphics $graphics -Text "会津ブランド館" -Font $brandFont -Brush $brandBrush -Bounds $brandBounds -Offset 2
      $ruleY = [float]($contentY + $brandHeight + ($margin * 0.13))
      $ruleLength = [float]([Math]::Min($contentWidth * 0.22, [Math]::Max(64, $Width * 0.09)))
      $graphics.DrawLine($accentPen, $contentX, $ruleY, $contentX + $ruleLength, $ruleY)

      $headlineY = [float]($ruleY + ($margin * 0.26))
      $headlineHeightRatio = if ([string]::IsNullOrWhiteSpace($Subline)) { 0.72 } else { 0.54 }
      $headlineHeight = [float]($contentHeight * $headlineHeightRatio)
      $headlineBounds = [System.Drawing.RectangleF]::new($contentX, $headlineY, $contentWidth, $headlineHeight)
      $headlineMaximum = if ($isPortrait) { [float]($Width * 0.064) } else { [float]([Math]::Min($Width, $Height) * 0.057) }
      if ($Headline.Length -le 18) {
        $singleLineMaximum = [float](($contentWidth / [Math]::Max(1, $Headline.Length)) * 0.9)
        $headlineMaximum = [float]([Math]::Min($headlineMaximum, $singleLineMaximum))
      }
      $headlineFont = New-FittingFont -Graphics $graphics -Text $Headline -Bounds $headlineBounds -MaximumSize $headlineMaximum -MinimumSize 26 -Style ([System.Drawing.FontStyle]::Bold)
      $headlineMeasuredHeight = [float]($graphics.MeasureString($Headline, $headlineFont, [int]$contentWidth).Height)
      try {
        Draw-StringWithShadow -Graphics $graphics -Text $Headline -Font $headlineFont -Brush $textBrush -Bounds $headlineBounds -Offset 3
      } finally {
        $headlineFont.Dispose()
      }

      if (-not [string]::IsNullOrWhiteSpace($Subline)) {
        $sublineY = [float]($headlineY + [Math]::Min($headlineHeight, $headlineMeasuredHeight) + ($margin * 0.32))
        $sublineBounds = [System.Drawing.RectangleF]::new($contentX, $sublineY, $contentWidth, $contentHeight * 0.24)
        $sublineFont = New-FittingFont -Graphics $graphics -Text $Subline -Bounds $sublineBounds -MaximumSize ([float]([Math]::Max(20, [Math]::Min($Width, $Height) * 0.029))) -MinimumSize 17 -Style ([System.Drawing.FontStyle]::Regular)
        try {
          Draw-StringWithShadow -Graphics $graphics -Text $Subline -Font $sublineFont -Brush $sublineBrush -Bounds $sublineBounds -Offset 2
        } finally {
          $sublineFont.Dispose()
        }
      }
    } finally {
      $brandFont.Dispose()
      $brandBrush.Dispose()
      $textBrush.Dispose()
      $sublineBrush.Dispose()
      $accentPen.Dispose()
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
