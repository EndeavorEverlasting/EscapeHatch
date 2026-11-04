# Ingest a value-free phone proof JSON into OneDrive EscapeHatchPrivateSync.
# Sources (first match): -Path file, clipboard text, stdin.
# Never prints preference values (proof must not contain them).
param(
  [string]$Path
)
$ErrorActionPreference = 'Stop'
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
New-Item -ItemType Directory -Force -Path $od | Out-Null
$dest = Join-Path $od 'escapehatch-phone-sync-proof.json'

$raw = $null
if ($Path -and (Test-Path -LiteralPath $Path)) {
  $raw = Get-Content -LiteralPath $Path -Raw
} else {
  try {
    $clip = Get-Clipboard -Raw -ErrorAction Stop
    if ($clip -and $clip.Trim().StartsWith('{')) { $raw = $clip }
  } catch { }
}
if (-not $raw) {
  throw 'Provide -Path to a proof JSON, or copy the phone proof JSON to the clipboard first.'
}

$proof = $raw | ConvertFrom-Json
if ($proof.schema -ne 'escapehatch/private-sync-phone-proof-receipt/v1') {
  throw 'INVALID_PROOF_SCHEMA'
}
if ($proof.notPhoneThreeOfThree -eq $true -or $proof.deviceKind -eq 'android-emulator') {
  throw 'REJECTED_EMULATOR_LAB_PROOF'
}
if ([string]$proof.device -ne 'android-phone') {
  throw 'REJECTED_NON_PHONE_DEVICE'
}
if (-not $proof.projectionDigest -or $proof.projectionDigest.Length -ne 64) {
  throw 'INVALID_PROOF_DIGEST'
}
# Refuse accidental value leakage: no long free-text fields beyond known keys.
$json = $proof | ConvertTo-Json -Depth 6 -Compress
if ($json -match 'password|ssn|secret|Bearer |@gmail\.com') {
  throw 'PROOF_LOOKS_LIKE_IT_CONTAINS_SENSITIVE_TEXT'
}

Set-Content -LiteralPath $dest -Value ($proof | ConvertTo-Json -Depth 6) -Encoding utf8
Write-Output "ingested=$dest"
Write-Output "digest=$($proof.projectionDigest)"
Write-Output "count=$($proof.reusableAnswerCount)"
Write-Output "NEXT=private-sync-await-phone-proof.ps1 (or already watching) will compare digests"
