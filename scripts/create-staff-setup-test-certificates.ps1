#requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$fixtureParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.vercel'))
$fixtureDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (-not [string]::Equals([IO.Path]::GetDirectoryName($fixtureDirectory), $fixtureParent, [StringComparison]::OrdinalIgnoreCase) -or
    -not [IO.Path]::GetFileName($fixtureDirectory).StartsWith('staff-setup-fixtures-') -or [IO.Directory]::Exists($fixtureDirectory)) {
    throw 'Only a fresh test fixture directory is allowed.'
}
[IO.Directory]::CreateDirectory($fixtureDirectory) | Out-Null
$fixtureNow = [DateTimeOffset]::UtcNow

function New-TestRequest([string]$Name, [Security.Cryptography.RSA]$Key, [bool]$IsCa) {
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        ('CN=TSA Staff Setup Test Only - ' + $Name), $Key,
        [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($IsCa, $IsCa, 0, $true))
    $usage = if ($IsCa) {
        [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign
    } else { [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature }
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($usage, $true))
    return $request
}

foreach ($case in @(
    @{ Name = 'valid'; Ca = $true; From = $fixtureNow.AddDays(-1); Until = $fixtureNow.AddDays(366) },
    @{ Name = 'expired'; Ca = $true; From = $fixtureNow.AddDays(-3); Until = $fixtureNow.AddDays(-2) },
    @{ Name = 'future'; Ca = $true; From = $fixtureNow.AddDays(2); Until = $fixtureNow.AddDays(3) },
    @{ Name = 'leaf'; Ca = $false; From = $fixtureNow.AddDays(-1); Until = $fixtureNow.AddDays(365) }
)) {
    $key = [Security.Cryptography.RSA]::Create(2048)
    $certificate = $null
    try {
        $request = New-TestRequest $case.Name $key $case.Ca
        $certificate = $request.CreateSelfSigned($case.From, $case.Until)
        [IO.File]::WriteAllBytes((Join-Path $fixtureDirectory ($case.Name + '.cer')),
            $certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
        if ($case.Name -eq 'valid') {
            $childKey = [Security.Cryptography.RSA]::Create(2048)
            $child = $null
            try {
                $childRequest = New-TestRequest 'subordinate-ca' $childKey $true
                $child = $childRequest.Create($certificate, $fixtureNow.AddHours(-1), $fixtureNow.AddDays(365),
                    [Security.Cryptography.RandomNumberGenerator]::GetBytes(16))
                [IO.File]::WriteAllBytes((Join-Path $fixtureDirectory 'subordinate.cer'),
                    $child.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
            } finally { if ($child) { $child.Dispose() }; $childKey.Dispose() }
        }
    } finally { if ($certificate) { $certificate.Dispose() }; $key.Dispose() }
}
Write-Output 'Public test fixtures only; no private keys or trust changes.'
