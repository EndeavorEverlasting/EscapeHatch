[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Protect', 'Unprotect')]
    [string]$Action,

    # Base64url or standard Base64 of exactly 32 bytes (Protect) or DPAPI blob (Unprotect).
    [Parameter(Mandatory = $true)]
    [string]$Payload
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

function ConvertFrom-FlexibleBase64([string]$Value) {
    $normalized = $Value.Trim().Replace('-', '+').Replace('_', '/')
    switch ($normalized.Length % 4) {
        2 { $normalized += '==' }
        3 { $normalized += '=' }
    }
    return [Convert]::FromBase64String($normalized)
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
    return ([Convert]::ToBase64String($Bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$bytes = ConvertFrom-FlexibleBase64 $Payload
if ($Action -eq 'Protect') {
    if ($bytes.Length -ne 32) { throw 'INVALID_SYNC_KEY' }
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    Write-Output (ConvertTo-Base64Url $protected)
    exit 0
}

if ($bytes.Length -lt 16 -or $bytes.Length -gt 4096) { throw 'INVALID_DPAPI_BLOB' }
try {
    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
} catch {
    throw 'DPAPI_UNPROTECT_FAILED'
}
if ($plain.Length -ne 32) { throw 'INVALID_SYNC_KEY' }
Write-Output (ConvertTo-Base64Url $plain)
