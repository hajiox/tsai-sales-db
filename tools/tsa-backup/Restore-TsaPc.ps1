param(
    [string]$SourceRoot = '\\tshdd\disk\NEW\TSA-PC-Backup\daily',
    [string]$RunId,
    [string]$RecoveryRoot = 'C:\TSA-Restore-Staging',
    [string]$KeyPath,
    [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Backup.Common.ps1')

if (-not $KeyPath) {
    $localKey = 'C:\ProgramData\TSA-Backup\backup-aes.key'
    $usbKey = Join-Path $PSScriptRoot 'KEYS\backup-aes.key'
    if (Test-Path -LiteralPath $localKey) { $KeyPath = $localKey }
    elseif (Test-Path -LiteralPath $usbKey) { $KeyPath = $usbKey }
    else { throw '復旧鍵が見つかりません。USBのKEYSフォルダを確認してください。' }
}

$manifests = Get-ChildItem -LiteralPath $SourceRoot -Filter 'manifest.json' -File -Recurse -ErrorAction Stop |
    Sort-Object LastWriteTime -Descending
if ($ListOnly) {
    $manifests | ForEach-Object {
        $m = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        [pscustomobject]@{ RunId=$m.runId; CompletedAt=$m.completedAt; Files=@($m.files).Count; Path=$_.DirectoryName }
    } | Format-Table -AutoSize
    return
}

$selected = if ($RunId) {
    $manifests | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).runId -eq $RunId } | Select-Object -First 1
} else { $manifests | Select-Object -First 1 }
if (-not $selected) { throw '指定したバックアップが見つかりません。' }

$manifest = Get-Content -LiteralPath $selected.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$destination = Join-Path $RecoveryRoot $manifest.runId
if (Test-Path -LiteralPath $destination) { throw "復旧先が既に存在します。内容を確認してから別名にしてください: $destination" }
New-Item -ItemType Directory -Path $destination -Force | Out-Null

foreach ($file in $manifest.files) {
    $encrypted = Join-Path $selected.DirectoryName $file.file
    if (-not (Test-TsaProtectedFile -Path $encrypted -KeyPath $KeyPath)) { throw "検証に失敗しました: $($file.name)" }
    $archive = Join-Path $destination ("{0}.tar.gz" -f $file.name)
    Unprotect-TsaFile -Source $encrypted -Destination $archive -KeyPath $KeyPath
    $extract = Join-Path $destination $file.name
    New-Item -ItemType Directory -Path $extract -Force | Out-Null
    & tar.exe -xzf $archive -C $extract
    if ($LASTEXITCODE -ne 0) { throw "展開に失敗しました: $($file.name)" }
    Remove-Item -LiteralPath $archive -Force
}

@(
    "復旧データを安全なステージングへ展開しました: $destination",
    'まだ本番データは変更していません。',
    'README_最初にお読みください.html の「データ復旧」を確認し、FAX・メール・定期処理を停止してから切り替えてください。'
) | ForEach-Object { Write-Host $_ }
