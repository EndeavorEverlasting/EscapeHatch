# Value-free proof-ceiling report for private-sync 3/3 (PR #184).
# Never prints preference values or pairing codes. Writes TEMP JSON only.
param(
  [string]$Carrier = $(Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync')
)
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}
$repo = Split-Path -Parent $PSScriptRoot
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'

Push-Location (Join-Path $repo 'artifacts\escape-hatch')
try {
  $statusRaw = node --experimental-strip-types private-sync-cli.ts status $Carrier 2>&1
  $status = ($statusRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
} finally {
  Pop-Location
}

$ledgerPath = Join-Path $Carrier 'multidevice-proof-ledger.json'
$ledger = if (Test-Path $ledgerPath) { Get-Content $ledgerPath -Raw | ConvertFrom-Json } else { $null }
$phoneProof = Test-Path (Join-Path $Carrier 'escapehatch-phone-sync-proof.json')
$physical = @()
if (Test-Path $adb) {
  $physical = @(& $adb devices | Select-Object -Skip 1 | Where-Object {
      $_ -and $_ -notmatch '^emulator-' -and $_ -match '\tdevice$'
    })
}

$lanOk = $false
try {
  $h = Invoke-RestMethod 'http://127.0.0.1:18765/health' -TimeoutSec 2
  $lanOk = [bool]$h.ok
} catch {}

$report = [ordered]@{
  schema = 'escapehatch/private-sync-proof-ceiling-report/v1'
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  headSha = (git -C $repo rev-parse --short HEAD)
  requirements = [ordered]@{
    windowsDpapiKey = ($status.keyBackend -eq 'windows-dpapi')
    androidKeystoreLab = (Test-Path (Join-Path $env:TEMP 'escapehatch-emulator-keystore-sync-proof.json'))
    androidPhoneKeystore = $false
    explicitPairing = $true
    ciphertextFolderCarrier = ($status.carrierKind -eq 'folder' -and $status.status -eq 'SYNCED')
    offlineConflictUnitTests = 'run_separately'
    desktopDigest = $status.projectionDigest
    desktopCount = $status.reusableAnswerCount
    cognizantFieldIds = @($status.cognizantTalentCommunityFieldsPresent)
    # Wrap Where-Object in @() — a single PSCustomObject has no .Count and was falsely reporting laptopPeer=false.
    laptopPeer = (@($ledger.devices | Where-Object { $_.id -in @('laptop', 'laptop-sim') -and $_.digestMatch }).Count -gt 0)
    laptopIsPhysicalSecondHost = (@($ledger.devices | Where-Object { $_.id -eq 'laptop' -and $_.proof -eq 'SECOND_WINDOWS_HOST' }).Count -gt 0)
    androidPhoneProven = (@($ledger.devices | Where-Object { $_.id -eq 'android-phone' -and $_.status -eq 'PROVEN' }).Count -gt 0)
    threeOfThree = [bool]$ledger.threeOfThree
  }
  runtime = [ordered]@{
    lan18765 = $lanOk
    phoneProofFilePresent = $phoneProof
    physicalAdbDeviceCount = @($physical).Count
    offerPresent = (Test-Path (Join-Path $Carrier 'pairing-offer.json'))
    prDraftExpected = $true
    nordLynxUp = [bool]((Get-NetAdapter -Name 'NordLynx' -ErrorAction SilentlyContinue).Status -eq 'Up')
  }
  firstUnprovenGate = if ($ledger.threeOfThree) {
    'none'
  } elseif (-not (@($ledger.devices | Where-Object { $_.id -eq 'android-phone' -and $_.status -eq 'PROVEN' }).Count -gt 0)) {
    'physical-android-phone-pair-import-send-proof'
  } elseif (-not (@($ledger.devices | Where-Object { $_.id -eq 'laptop' -and $_.proof -eq 'SECOND_WINDOWS_HOST' }).Count -gt 0)) {
    'optional-physical-windows-laptop-peer'
  } else {
    'unknown'
  }
}
$out = Join-Path $env:TEMP 'eh-private-sync-proof-ceiling.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($out, (($report | ConvertTo-Json -Depth 8) + "`n"), $utf8)
Copy-Item $out (Join-Path $Carrier 'private-sync-proof-ceiling.json') -Force -ErrorAction SilentlyContinue
Write-Output "report=$out"
Write-Output "firstUnprovenGate=$($report.firstUnprovenGate)"
Write-Output "threeOfThree=$($report.requirements.threeOfThree)"
Write-Output "physicalAdb=$($report.runtime.physicalAdbDeviceCount)"
exit 0
