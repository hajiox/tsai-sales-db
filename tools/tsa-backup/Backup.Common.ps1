Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-TsaBackupConfig {
    param([string]$Path = 'C:\ProgramData\TSA-Backup\backup.config.json')
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "バックアップ設定がありません: $Path"
    }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-TsaBackupLog {
    param([pscustomobject]$Config, [string]$Message, [ValidateSet('INFO','WARN','ERROR')][string]$Level = 'INFO')
    $logDir = Join-Path $Config.ProgramRoot 'logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath (Join-Path $logDir ('backup-{0}.log' -f (Get-Date -Format 'yyyy-MM'))) -Value $line -Encoding UTF8
}

function Get-TsaDerivedKey {
    param([byte[]]$MasterKey, [string]$Label)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($MasterKey)
    try { return $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Label)) }
    finally { $hmac.Dispose() }
}

function Get-TsaFileHmac {
    param([string]$Path, [byte[]]$Key)
    $stream = [IO.File]::OpenRead($Path)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($Key)
    try { return ([BitConverter]::ToString($hmac.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hmac.Dispose(); $stream.Dispose() }
}

function Protect-TsaFile {
    param([string]$Source, [string]$Destination, [string]$KeyPath)
    $masterKey = [IO.File]::ReadAllBytes($KeyPath)
    if ($masterKey.Length -ne 32) { throw '復旧鍵が正しくありません。32バイトの鍵が必要です。' }
    $encryptionKey = Get-TsaDerivedKey -MasterKey $masterKey -Label 'tsa-backup-encryption-v1'
    $authKey = Get-TsaDerivedKey -MasterKey $masterKey -Label 'tsa-backup-auth-v1'
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $encryptionKey
    $aes.GenerateIV()
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    $input = [IO.File]::OpenRead($Source)
    $output = [IO.File]::Create($Destination)
    try {
        $magic = [Text.Encoding]::ASCII.GetBytes("TSABKP1`n")
        $output.Write($magic, 0, $magic.Length)
        $output.Write($aes.IV, 0, $aes.IV.Length)
        $crypto = [System.Security.Cryptography.CryptoStream]::new($output, $aes.CreateEncryptor(), [System.Security.Cryptography.CryptoStreamMode]::Write)
        try { $input.CopyTo($crypto); $crypto.FlushFinalBlock() }
        finally { $crypto.Dispose() }
    } finally {
        $input.Dispose()
        $output.Dispose()
        $aes.Dispose()
    }
    $hmacValue = Get-TsaFileHmac -Path $Destination -Key $authKey
    Set-Content -LiteralPath "$Destination.hmac" -Value $hmacValue -Encoding ASCII
    return [pscustomobject]@{ File = $Destination; Bytes = (Get-Item -LiteralPath $Destination).Length; Hmac = $hmacValue }
}

function Test-TsaProtectedFile {
    param([string]$Path, [string]$KeyPath)
    if (-not (Test-Path -LiteralPath $Path) -or -not (Test-Path -LiteralPath "$Path.hmac")) { return $false }
    $masterKey = [IO.File]::ReadAllBytes($KeyPath)
    $authKey = Get-TsaDerivedKey -MasterKey $masterKey -Label 'tsa-backup-auth-v1'
    $expected = (Get-Content -LiteralPath "$Path.hmac" -Raw -Encoding ASCII).Trim().ToLowerInvariant()
    $actual = Get-TsaFileHmac -Path $Path -Key $authKey
    return $actual -eq $expected
}

function Unprotect-TsaFile {
    param([string]$Source, [string]$Destination, [string]$KeyPath)
    if (-not (Test-TsaProtectedFile -Path $Source -KeyPath $KeyPath)) { throw "暗号化ファイルの検証に失敗しました: $Source" }
    $masterKey = [IO.File]::ReadAllBytes($KeyPath)
    $encryptionKey = Get-TsaDerivedKey -MasterKey $masterKey -Label 'tsa-backup-encryption-v1'
    $input = [IO.File]::OpenRead($Source)
    try {
        $magic = New-Object byte[] 8
        if ($input.Read($magic, 0, 8) -ne 8 -or [Text.Encoding]::ASCII.GetString($magic) -ne "TSABKP1`n") { throw '暗号化ファイルの形式が不正です。' }
        $iv = New-Object byte[] 16
        if ($input.Read($iv, 0, 16) -ne 16) { throw '暗号化ファイルのIVが不正です。' }
        $aes = [System.Security.Cryptography.Aes]::Create()
        $aes.KeySize = 256; $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC; $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
        $aes.Key = $encryptionKey; $aes.IV = $iv
        New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
        $output = [IO.File]::Create($Destination)
        $crypto = [System.Security.Cryptography.CryptoStream]::new($input, $aes.CreateDecryptor(), [System.Security.Cryptography.CryptoStreamMode]::Read)
        try { $crypto.CopyTo($output) }
        finally { $crypto.Dispose(); $output.Dispose(); $aes.Dispose() }
    } finally { $input.Dispose() }
}

function New-TsaTarArchive {
    param([string]$OutputPath, [string]$BasePath, [string[]]$Items, [string[]]$Excludes = @())
    New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
    $args = @('-czf', $OutputPath)
    foreach ($exclude in $Excludes) { $args += "--exclude=$exclude" }
    $args += @('-C', $BasePath)
    $args += $Items
    & tar.exe @args
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) { throw "アーカイブ作成に失敗しました: $OutputPath" }
}

function Copy-TsaVerifiedFile {
    param([string]$Source, [string]$DestinationDirectory)
    New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
    $destination = Join-Path $DestinationDirectory (Split-Path -Leaf $Source)
    Copy-Item -LiteralPath $Source -Destination $destination -Force
    Copy-Item -LiteralPath "$Source.hmac" -Destination "$destination.hmac" -Force
    $sourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($sourceHash -ne $destinationHash) { throw "コピー後の検証に失敗しました: $destination" }
    return $destination
}

function Remove-TsaOldGenerations {
    param([string]$Root, [int]$Keep = 30)
    if (-not (Test-Path -LiteralPath $Root)) { return }
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $items = Get-ChildItem -LiteralPath $Root -Directory -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^daily_data-\d{8}T\d{6}$' } |
        Sort-Object LastWriteTime -Descending
    $items | Select-Object -Skip $Keep | ForEach-Object {
        $candidate = [IO.Path]::GetFullPath($_.FullName)
        if (-not $candidate.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "削除対象が保存先外です: $candidate" }
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

function Get-TsaBridgeToken {
    param([pscustomobject]$Config)
    $bridge = Get-Content -LiteralPath $Config.BridgeConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $bridge.token) { throw 'TSA Bridge認証トークンが設定されていません。' }
    return [string]$bridge.token
}

function Send-TsaBackupHistory {
    param([pscustomobject]$Config, [hashtable]$Payload, [switch]$NoQueue)
    try {
        $headers = @{ Authorization = "Bearer $(Get-TsaBridgeToken -Config $Config)" }
        Invoke-RestMethod -Method Post -Uri $Config.HistoryEndpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($Payload | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 45 | Out-Null
        return $true
    } catch {
        Write-TsaBackupLog -Config $Config -Level WARN -Message "TSA履歴送信を保留しました: $($_.Exception.Message)"
        if (-not $NoQueue) {
            $pendingDir = Join-Path $Config.ProgramRoot 'pending-history'
            New-Item -ItemType Directory -Path $pendingDir -Force | Out-Null
            $Payload | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $pendingDir ("{0}.json" -f $Payload.runId)) -Encoding UTF8
        }
        return $false
    }
}

function Send-TsaPendingHistory {
    param([pscustomobject]$Config)
    $pendingDir = Join-Path $Config.ProgramRoot 'pending-history'
    if (-not (Test-Path -LiteralPath $pendingDir)) { return }
    Get-ChildItem -LiteralPath $pendingDir -Filter '*.json' -File | ForEach-Object {
        $payloadObject = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $payload = @{}
        $payloadObject.psobject.Properties | ForEach-Object { $payload[$_.Name] = $_.Value }
        if (Send-TsaBackupHistory -Config $Config -Payload $payload -NoQueue) { Remove-Item -LiteralPath $_.FullName -Force }
    }
}

function Get-TsaEnvValue {
    param([string]$Path, [string]$Name)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $line = Get-Content -LiteralPath $Path -Encoding UTF8 | Where-Object { $_ -match ('^{0}=' -f [regex]::Escape($Name)) } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -split '=', 2)[1].Trim()
}
