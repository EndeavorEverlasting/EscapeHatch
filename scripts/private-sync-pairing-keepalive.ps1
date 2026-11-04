# Refresh sealed pairing offer before SAS TTL expiry so a late phone attach still works.
# Updates OneDrive pairing-offer.json and TEMP pairing-code.local.txt only.
# Never prints the pairing code or preference values. Stops when phone proof appears.
param(
  [int]$MaxHours = 6,
  [int]$RefreshWhenMinutesLeft = 15
)
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

$repo = Split-Path -Parent $PSScriptRoot
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$offerPath = Join-Path $od 'pairing-offer.json'
$codeLocal = Join-Path $env:TEMP 'pairing-code.local.txt'
$offerOut = Join-Path $env:TEMP 'eh-pairing-offer-phone.json'
$proofName = 'escapehatch-phone-sync-proof.json'
$deadline = (Get-Date).AddHours([Math]::Max(1, $MaxHours))

function Get-OfferExpiryUtc {
  if (-not (Test-Path $offerPath)) { return [datetime]::MinValue }
  $raw = Get-Content $offerPath -Raw
  if ($raw -match '"expiresAt"\s*:\s*"([^"]+)"') {
    $iso = $Matches[1]
    # Prefer explicit Z/offset parse — ConvertFrom-Json Unspecified local skews TTL by hours.
    try {
      return [datetime]::Parse(
        $iso,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind
      ).ToUniversalTime()
    } catch {
      return [datetime]::MinValue
    }
  }
  return [datetime]::MinValue
}

function Refresh-Offer {
  Push-Location (Join-Path $repo 'artifacts\escape-hatch')
  try {
    if (Test-Path $offerOut) { Remove-Item $offerOut -Force }
    $exportRaw = node --experimental-strip-types private-sync-cli.ts export-pairing $od $offerOut 2>&1
    $export = ($exportRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
    if (-not $export.pairingCode) { throw 'export-pairing missing pairingCode' }
    Set-Content -Path $codeLocal -Value $export.pairingCode -NoNewline
    Copy-Item $offerOut $offerPath -Force
    Write-Output "refreshed_at=$((Get-Date).ToUniversalTime().ToString('o')) expiresAt=$($export.expiresAt) codePath=$codeLocal"
  } finally {
    Pop-Location
  }
}

Write-Output "keepalive=start until=$($deadline.ToUniversalTime().ToString('o')) refreshWhenMinutesLeft=$RefreshWhenMinutesLeft"

while ((Get-Date) -lt $deadline) {
  $proof = Get-ChildItem -Path $od, (Join-Path $env:USERPROFILE 'Downloads') -Filter $proofName -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($proof) {
    Write-Output "proof_seen=$($proof.FullName) keepalive=stop"
    exit 0
  }

  $expires = Get-OfferExpiryUtc
  $minutesLeft = ($expires - (Get-Date).ToUniversalTime()).TotalMinutes
  if ($minutesLeft -le $RefreshWhenMinutesLeft) {
    Refresh-Offer
  } else {
    Write-Output ("offer_ok minutesLeft={0:N1}" -f $minutesLeft)
  }
  Start-Sleep -Seconds 120
}

Write-Output 'keepalive=timeout'
exit 2
