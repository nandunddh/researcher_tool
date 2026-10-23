# Clean script to sign SciProspect installer with an Authenticode certificate
$thumb = "07C9C270B7D5E294AB656C5102F7F84F407992C7"
$cert = Get-Item "Cert:\CurrentUser\My\$thumb" -ErrorAction SilentlyContinue

if (-not $cert) {
    $cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*SciProspect*" } | Select-Object -First 1
}

if (-not $cert) {
    Write-Host "Creating Code Signing Certificate..."
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject "CN=SciProspect Lead Intelligence, O=SciProspect, OU=Lead Intelligence, C=US" `
        -KeyLength 2048 `
        -HashAlgorithm "SHA256" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(5)
}

Write-Host "Signing with certificate: $($cert.Thumbprint) ($($cert.Subject))"

# Export public certificate
$cerPath = Join-Path $PSScriptRoot "SciProspect_Publisher.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Host "Exported public .cer to $cerPath"

# Sign the installer executable
$exePath = Join-Path $PSScriptRoot "dist_installer\SciProspect_Setup.exe"
if (Test-Path $exePath) {
    Unblock-File -Path $exePath
    Write-Host "Signing executable: $exePath"
    $sig = Set-AuthenticodeSignature -FilePath $exePath -Certificate $cert -HashAlgorithm SHA256
    Write-Host "Signature Result:"
    Write-Host "Status: $($sig.Status)"
    Write-Host "Signer: $($sig.SignerCertificate.Subject)"
    Write-Host "Thumbprint: $($sig.SignerCertificate.Thumbprint)"
} else {
    Write-Host "File not found: $exePath"
}
