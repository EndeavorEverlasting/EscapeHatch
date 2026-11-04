# Watches OneDrive for escapehatch-phone-sync-proof.json and compares digests.
# Never prints preference values.
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

$repo = Split-Path -Parent $PSScriptRoot
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$proofName = 'escapehatch-phone-sync-proof.json'
$expectedDigest = 'd9c4a8b80682fd06ffe0f1d0de14aa0622ac7338660f8dc33b147a426d8c448e'
$deadline = (Get-Date).AddMinutes(45)

Push-Location (Join-Path $repo 'artifacts\escape-hatch')
try {
  $statusRaw = node --experimental-strip-types private-sync-cli.ts status $od 2>&1
  $status = ($statusRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if ($status.projectionDigest) { $expectedDigest = $status.projectionDigest }
} finally {
  Pop-Location
}

Write-Output "watching=$od\$proofName"
Write-Output "expectedDigest=$expectedDigest"

while ((Get-Date) -lt $deadline) {
  $candidate = Get-ChildItem -Path $od,$env:USERPROFILE\Downloads -Filter $proofName -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) {
    $proof = Get-Content $candidate.FullName -Raw | ConvertFrom-Json
    $match = ($proof.projectionDigest -eq $expectedDigest) -and ($proof.reusableAnswerCount -eq $status.reusableAnswerCount)
    $phoneCog = @($proof.cognizantTalentCommunityFieldsPresent) | Sort-Object
    $deskCog = @($status.cognizantTalentCommunityFieldsPresent) | Sort-Object
    $cognizantOk = ($phoneCog -join ',') -eq ($deskCog -join ',')
    $result = [ordered]@{
      schema = 'escapehatch/private-sync-phone-proof-receipt/v1'
      phoneState = if ($match -and $cognizantOk) { 'PROVEN' } else { 'MISMATCH' }
      proofPath = $candidate.FullName
      phoneDigest = $proof.projectionDigest
      desktopDigest = $expectedDigest
      digestsMatch = $match
      cognizantMatch = $cognizantOk
      phoneCount = $proof.reusableAnswerCount
      desktopCount = $status.reusableAnswerCount
      checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $out = Join-Path $env:TEMP 'eh-sync-proof-receipt.json'
    $result | ConvertTo-Json -Depth 5 | Set-Content $out -Encoding utf8
    Write-Output ($result | ConvertTo-Json -Compress)
    if ($result.phoneState -eq 'PROVEN') { exit 0 } else { exit 3 }
  }
  Start-Sleep -Seconds 5
}

Write-Output "phone_proof=TIMEOUT"
exit 2
