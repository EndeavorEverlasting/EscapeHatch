# Prepares value-free phone sync proof artifacts and sideloads when adb sees a device.
# Never prints preference values or the pairing code to the console.
param(
  [int]$WaitMinutes = 20,
  # Skip offer re-export (use existing OneDrive/TEMP artifacts). For background ADB waiters.
  [switch]$AttachOnly
)
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo 'artifacts\escape-hatch\private-sync-cli.ts'))) {
  throw "EscapeHatch worktree not found at $repo"
}

$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
New-Item -ItemType Directory -Force -Path $od | Out-Null
$offerOut = Join-Path $env:TEMP 'eh-pairing-offer-phone.json'
$codeLocal = Join-Path $env:TEMP 'pairing-code.local.txt'
$receipt = Join-Path $env:TEMP 'eh-sync-proof-receipt.json'
$apkCandidates = @(
  (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk'),
  (Join-Path $repo 'android\application-assist\app\build\outputs\apk\debug\app-debug.apk')
)
$apk = $apkCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($apk) {
  Copy-Item $apk (Join-Path $od 'EscapeHatchAssist-debug.apk') -Force
  $apk = Join-Path $od 'EscapeHatchAssist-debug.apk'
}
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb missing at $adb" }

Push-Location (Join-Path $repo 'artifacts\escape-hatch')
try {
  $statusRaw = node --experimental-strip-types private-sync-cli.ts status $od 2>&1
  $status = ($statusRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if (-not $AttachOnly) {
    if (Test-Path $offerOut) { Remove-Item $offerOut -Force }
    $exportRaw = node --experimental-strip-types private-sync-cli.ts export-pairing $od $offerOut 2>&1
    $export = ($exportRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
    Set-Content -Path $codeLocal -Value $export.pairingCode -NoNewline
    Copy-Item $offerOut (Join-Path $od 'pairing-offer.json') -Force
  } else {
    if (-not (Test-Path (Join-Path $od 'pairing-offer.json'))) {
      throw 'AttachOnly requires existing pairing-offer.json in EscapeHatchPrivateSync'
    }
    $export = [pscustomobject]@{ vaultId = 'existing-offer'; pairingCode = $null }
  }
} finally {
  Pop-Location
}

$capsule = Get-ChildItem $od -Filter '*.ehsync' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $AttachOnly) {
  $proof = [ordered]@{
    schema = 'escapehatch/private-sync-phone-proof-receipt/v1'
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    vaultId = $export.vaultId
    desktopStatus = $status.status
    reusableAnswerCount = $status.reusableAnswerCount
    projectionDigest = $status.projectionDigest
    cognizantTalentCommunityFieldsPresent = $status.cognizantTalentCommunityFieldsPresent
    carrierPath = $od
    capsuleFile = if ($capsule) { $capsule.Name } else { $null }
    pairingOfferPath = (Join-Path $od 'pairing-offer.json')
    pairingCodePath = $codeLocal
    pairingExpiresHint = '60m from export'
    apkPath = $apk
    phoneState = 'UNPROVEN'
  }
  $proof | ConvertTo-Json -Depth 5 | Set-Content -Path $receipt -Encoding utf8
} else {
  $proof = [ordered]@{
    pairingOfferPath = (Join-Path $od 'pairing-offer.json')
    pairingCodePath = $codeLocal
    projectionDigest = $status.projectionDigest
  }
}

if (-not $AttachOnly) {
  # Best-effort QR for LAN install page (USB-free). Never embeds the pairing code.
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
      $_.IPAddress -like '192.168.*' -and $_.InterfaceAlias -match 'Wi-?Fi|WLAN'
    } | Select-Object -First 1 -ExpandProperty IPAddress)
  if (-not $lanIp) {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notmatch '^(127\.|169\.254\.|10\.5\.)'
      } | Select-Object -First 1 -ExpandProperty IPAddress)
  }
  # Dedicated EscapeHatch phone-proof port (avoid PiShark / other apps on 8765).
  $lanPort = 18765
  $lanUrl = if ($lanIp) { "http://${lanIp}:${lanPort}/" } else { $null }
  $qrPath = Join-Path $od 'phone-install-qr.png'
  if ($lanUrl) {
    try {
      $qrTemp = Join-Path $env:TEMP 'escapehatch-phone-install-qr.png'
      $qrTempPosix = ($qrTemp -replace '\\', '/')
      python -c "import qrcode; qrcode.make(r'''$lanUrl''').save(r'''$qrTempPosix''')"
      try {
        Copy-Item -LiteralPath $qrTemp -Destination $qrPath -Force -ErrorAction Stop
      } catch {
        $qrPath = $qrTemp
        Write-Output "qr_onedrive_locked=using_temp"
      }
    } catch {
      Write-Output "qr_skip=$($_.Exception.Message)"
    }
  }

  Write-Output "receipt=$receipt"
  Write-Output "digest=$($status.projectionDigest)"
  Write-Output "count=$($status.reusableAnswerCount)"
  Write-Output "cognizant=$($status.cognizantTalentCommunityFieldsPresent -join ',')"
  Write-Output "offer=$($proof.pairingOfferPath)"
  Write-Output "codePath=$codeLocal"
  Write-Output "apk=$apk"
  Write-Output "lanUrl=$lanUrl"
  Write-Output "qrPath=$qrPath"

  $helper = Join-Path $od 'PHONE_PROOF_HELPER.html'
  $steps = Join-Path $od 'PHONE_PROOF_STEPS.txt'
  @(
    'EscapeHatch phone proof (LAN / OneDrive / USB)',
    'A. Same Wi-Fi: scan phone-install-qr.png or open http://<pc-ip>:18765/ → download APK.',
    'B. Or OneDrive → EscapeHatchPrivateSync → EscapeHatchAssist-debug.apk.',
    'C. Or USB debugging: desktop auto-installs when adb sees the device.',
    '2. Open EscapeHatch Assist → Pair this phone.',
    '3. Enter the pairing code from desktop TEMP\pairing-code.local.txt (never in OneDrive / never on :18765).',
    '4. Choose sealed offer: pairing-offer.json (OneDrive or LAN /offer).',
    '5. Import encrypted answers: newest .ehsync (OneDrive or LAN /capsule).',
    '6. Save proof → escapehatch-phone-sync-proof.json in EscapeHatchPrivateSync (or Downloads).',
    "Desktop digest to match: $($status.projectionDigest)",
    'Values are never written to this helper or the proof receipt.'
  ) | Set-Content -Path $steps -Encoding utf8
  $digestShort = $status.projectionDigest.Substring(0, 16)
  $lanLine = if ($lanUrl) { "<p>LAN install: <a href=`"$lanUrl`" style=`"color:#c8f542`">$lanUrl</a> (APK + sealed offer/capsule only).</p>" } else { '' }
  @"
<!doctype html><html lang="en"><meta charset="utf-8"><title>EscapeHatch phone proof</title>
<body style="font:16px/1.45 Georgia,serif;max-width:40rem;margin:2rem;background:#0b1210;color:#e8efe9">
<h1 style="font:700 1.6rem system-ui,sans-serif">Phone proof — LAN / OneDrive</h1>
<p>Install the APK, pair with the desktop TEMP code, import sealed offer + <code>.ehsync</code>, save value-free proof JSON back to EscapeHatchPrivateSync.</p>
$lanLine
<ol>
<li>Install <strong>EscapeHatchAssist-debug.apk</strong> (LAN :18765, OneDrive, or USB auto-install)</li>
<li>Assist → <strong>Pair this phone</strong> → enter desktop TEMP pairing code</li>
<li>Choose sealed offer <code>pairing-offer.json</code></li>
<li>Import newest <code>.ehsync</code></li>
<li>Save proof → desktop watcher matches digest <code>${digestShort}…</code></li>
</ol>
<p style="color:#9aab9e">No answer values or pairing codes are shown here.</p>
</body></html>
"@ | Set-Content -Path $helper -Encoding utf8
  Write-Output "helper=$helper"
  Write-Output "steps=$steps"
} else {
  Write-Output "attachOnly=1 digest=$($status.projectionDigest) offer=$($proof.pairingOfferPath)"
}

$deadline = (Get-Date).AddMinutes([Math]::Max(0, $WaitMinutes))
while ((Get-Date) -lt $deadline) {
  $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' }
  if ($devices) {
    Write-Output "adb_device=attached"
    if ($apk) {
      & $adb install -r $apk
      Write-Output "apk_install_exit=$LASTEXITCODE"
    }
    $remoteDir = '/sdcard/Download/EscapeHatchPrivateSync'
    & $adb shell mkdir -p $remoteDir
    if ($capsule) { & $adb push $capsule.FullName "$remoteDir/" }
    & $adb push (Join-Path $od 'pairing-offer.json') "$remoteDir/"
    Write-Output "pushed_files=$remoteDir"
    # Launch companion UI; pairing code stays on desktop TEMP only.
    & $adb shell am start -n com.escapehatch.assist/.CompanionActivity | Out-Null
    Write-Output "companion_launched=1"
    Write-Output "NEXT=On phone: Pair this phone → enter TEMP pairing code → Import .ehsync from $remoteDir → Save proof"
    exit 0
  }
  Start-Sleep -Seconds 5
}

Write-Output "adb_device=none_within_${WaitMinutes}m"
Write-Output "NEXT=Install via LAN QR/http :18765, OneDrive helper $helper, or USB-debug with -WaitMinutes 20"
exit 2
