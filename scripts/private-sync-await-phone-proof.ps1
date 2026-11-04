# Watches OneDrive for escapehatch-phone-sync-proof.json and compares digests.
# Never prints preference values. On PROVEN, updates the private multidevice ledger.
param(
  [int]$WaitMinutes = 360
)
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

$repo = Split-Path -Parent $PSScriptRoot
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$proofName = 'escapehatch-phone-sync-proof.json'
$expectedDigest = 'd9c4a8b80682fd06ffe0f1d0de14aa0622ac7338660f8dc33b147a426d8c448e'
# WaitMinutes 0 = single poll (CI/smoke); >0 = poll until window elapses.
$singlePass = $WaitMinutes -le 0
$deadline = (Get-Date).AddMinutes([Math]::Max(0, $WaitMinutes))

Push-Location (Join-Path $repo 'artifacts\escape-hatch')
try {
  $statusRaw = node --experimental-strip-types private-sync-cli.ts status $od 2>&1
  $status = ($statusRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if ($status.projectionDigest) { $expectedDigest = $status.projectionDigest }
} finally {
  Pop-Location
}

Write-Output "watching=$od\$proofName (+Downloads/Desktop + clipboard JSON)"
Write-Output "expectedDigest=$expectedDigest"

do {
  # Clipboard / Nearby Share path: phone copies value-free proof JSON; never logs values.
  try {
    $clip = Get-Clipboard -Raw -ErrorAction Stop
    if (
      $clip -and
      $clip.TrimStart().StartsWith('{') -and
      $clip -match 'escapehatch/private-sync-phone-proof-receipt/v1' -and
      $clip -notmatch 'password|ssn|Bearer |@gmail\.com'
    ) {
      $clipDest = Join-Path $od $proofName
      if (-not (Test-Path -LiteralPath $clipDest)) {
        Set-Content -LiteralPath $clipDest -Value $clip.Trim() -Encoding utf8
        Write-Output "phone_proof=CLIPBOARD_INGESTED path=$clipDest"
      }
    }
  } catch {
    # clipboard unavailable
  }

  $candidate = Get-ChildItem -Path $od,$env:USERPROFILE\Downloads,(Join-Path $env:USERPROFILE 'Desktop') -Filter $proofName -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) {
    $proof = Get-Content $candidate.FullName -Raw | ConvertFrom-Json
    # Emulator Keystore lab proofs must never close android-phone / threeOfThree.
    if ($proof.notPhoneThreeOfThree -eq $true -or $proof.deviceKind -eq 'android-emulator') {
      Write-Output "phone_proof=REJECTED_EMULATOR_LAB path=$($candidate.FullName)"
      Start-Sleep -Seconds 15
      continue
    }
    # Require the phone receipt's device claim (missing device is not android-phone).
    if ([string]$proof.device -ne 'android-phone') {
      Write-Output "phone_proof=REJECTED_DEVICE device=$($proof.device)"
      Start-Sleep -Seconds 15
      continue
    }
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

    # Persist value-free multidevice ledger (OneDrive only; never Git).
    $ledgerPath = Join-Path $od 'multidevice-proof-ledger.json'
    if (Test-Path $ledgerPath) {
      $ledger = Get-Content $ledgerPath -Raw | ConvertFrom-Json
      $devices = @($ledger.devices)
      $phone = $devices | Where-Object { $_.id -eq 'android-phone' } | Select-Object -First 1
      if (-not $phone) {
        $phone = [pscustomobject]@{ id = 'android-phone'; status = 'UNPROVEN'; digestMatch = $false; proof = 'AWAITING_DEVICE' }
        $devices += $phone
      }
      if ($result.phoneState -eq 'PROVEN') {
        $phone.status = 'PROVEN'
        $phone.digestMatch = $true
        $phone.proof = 'PHONE_PROOF_JSON'
        $phone | Add-Member -NotePropertyName keyBackend -NotePropertyValue 'android-keystore' -Force
        $ledger.threeOfThree = $true
        $ledger.notes = 'Values never recorded. Desktop + laptop-sim + android-phone digests matched (Cognizant field ids present).'
      } else {
        $phone.status = 'MISMATCH'
        $phone.digestMatch = $false
        $phone.proof = 'PHONE_PROOF_MISMATCH'
        $ledger.threeOfThree = $false
      }
      $ledger.devices = $devices
      $ledger.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
      $ledger.projectionDigest = $expectedDigest
      $ledger.reusableAnswerCount = $status.reusableAnswerCount
      $ledger | ConvertTo-Json -Depth 8 | Set-Content $ledgerPath -Encoding utf8
      Write-Output "ledger_updated=$ledgerPath threeOfThree=$($ledger.threeOfThree)"
    }

    if ($result.phoneState -eq 'PROVEN') { exit 0 } else { exit 3 }
  }
  if ($singlePass) { break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

Write-Output "phone_proof=TIMEOUT"
exit 2
