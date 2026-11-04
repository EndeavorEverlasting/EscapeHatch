# Prepares value-free phone sync proof artifacts and sideloads when adb sees a device.
# Never prints preference values or the pairing code to the console.
param(
  [int]$WaitMinutes = 20,
  # Skip offer re-export (use existing OneDrive/TEMP artifacts). For background ADB waiters.
  [switch]$AttachOnly,
  # Regression: long TEMP path + PNG write (8.3 short names break Pillow on Windows).
  [switch]$SelfTestQr
)
$ErrorActionPreference = 'Stop'

function Get-PhoneQrTempRoot {
  $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
  if ($tempRoot -match '~') {
    $tempRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp'))
  }
  if ($tempRoot -match '~') {
    throw "TEMP resolves to short path: $tempRoot"
  }
  return $tempRoot
}

function Write-PhoneInstallQrPng {
  param(
    [Parameter(Mandatory = $true)][string]$LanUrl,
    [Parameter(Mandatory = $true)][string]$DestinationPng
  )
  $tempRoot = Get-PhoneQrTempRoot
  # Unique names: a stale/locked escapehatch-phone-install-qr.png can make Pillow raise EINVAL.
  $stamp = [guid]::NewGuid().ToString('N').Substring(0, 8)
  $candidates = @(
    (Join-Path $tempRoot "eh-phone-qr-$stamp.png"),
    (Join-Path $env:LOCALAPPDATA "EscapeHatch\eh-phone-qr-$stamp.png")
  )
  New-Item -ItemType Directory -Force -Path (Join-Path $env:LOCALAPPDATA 'EscapeHatch') | Out-Null
  $pySave = @'
import qrcode, pathlib, sys
url, dest = sys.argv[1], pathlib.Path(sys.argv[2])
dest.parent.mkdir(parents=True, exist_ok=True)
qrcode.make(url).save(dest)
'@
  $pyFile = Join-Path $tempRoot "eh-write-phone-qr-$stamp.py"
  Set-Content -LiteralPath $pyFile -Value $pySave -Encoding utf8
  $qrTemp = $null
  foreach ($cand in $candidates) {
    & python $pyFile $LanUrl $cand
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $cand)) {
      $qrTemp = $cand
      break
    }
  }
  if (-not $qrTemp) {
    throw 'qr png missing after python write'
  }
  $hdr = Get-Content -LiteralPath $qrTemp -Encoding Byte -TotalCount 8
  $pngMagic = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
  for ($i = 0; $i -lt 8; $i++) {
    if ($hdr[$i] -ne $pngMagic[$i]) { throw "qr png magic mismatch at $qrTemp" }
  }
  try {
    Copy-Item -LiteralPath $qrTemp -Destination $DestinationPng -Force -ErrorAction Stop
    return $DestinationPng
  } catch {
    # Host stream only — Write-Output would pollute the return path string.
    Write-Host 'qr_onedrive_locked=using_temp'
    return $qrTemp
  }
}

if ($SelfTestQr) {
  $dest = Join-Path (Get-PhoneQrTempRoot) 'eh-selftest-phone-qr.png'
  $written = Write-PhoneInstallQrPng -LanUrl 'http://192.0.2.1:18765/' -DestinationPng $dest
  if (-not (Test-Path -LiteralPath $written)) { throw "SelfTestQr missing $written" }
  Write-Output "selfTestQr=PASS path=$written bytes=$((Get-Item -LiteralPath $written).Length)"
  exit 0
}

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
# Prefer the newest companion APK (build output often newer than a stale TEMP copy).
$apkCandidates = @(
  (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk'),
  (Join-Path $repo 'android\application-assist\app\build\outputs\apk\debug\app-debug.apk')
) | Where-Object { Test-Path $_ }
$apk = $apkCandidates |
  ForEach-Object { Get-Item $_ } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if ($apk) {
  $staged = Join-Path $od 'EscapeHatchAssist-debug.apk'
  Copy-Item $apk $staged -Force
  # Keep TEMP in sync so later AttachOnly runs do not re-stage an older APK.
  Copy-Item $apk (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk') -Force
  $apk = $staged
  Write-Output "apk_staged=$apk bytes=$((Get-Item $apk).Length) mtime=$((Get-Item $apk).LastWriteTime.ToString('o'))"
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
      $qrPath = Write-PhoneInstallQrPng -LanUrl $lanUrl -DestinationPng $qrPath
      Write-Output "qrPath=$qrPath"
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
    '6. Send proof to PC (LAN :18765/proof) or save escapehatch-phone-sync-proof.json in EscapeHatchPrivateSync.',
    "Desktop digest to match: $($status.projectionDigest)",
    'Values are never written to this helper or the proof receipt. Emulator cannot close phone 3/3.'
  ) | Set-Content -Path $steps -Encoding utf8
  $digestShort = $status.projectionDigest.Substring(0, 16)
  $lanLine = if ($lanUrl) { "<p>LAN install: <a href=`"$lanUrl`" style=`"color:#c8f542`">$lanUrl</a> (APK + sealed offer/capsule + proof POST).</p>" } else { '' }
  @"
<!doctype html><html lang="en"><meta charset="utf-8"><title>EscapeHatch phone proof</title>
<body style="font:16px/1.45 Georgia,serif;max-width:40rem;margin:2rem;background:#0b1210;color:#e8efe9">
<h1 style="font:700 1.6rem system-ui,sans-serif">Phone proof — LAN / OneDrive</h1>
<p>Install the APK, pair with the desktop TEMP code, import sealed offer + <code>.ehsync</code>, then <strong>Send proof to PC</strong> (or save proof JSON into EscapeHatchPrivateSync).</p>
$lanLine
<ol>
<li>Install <strong>EscapeHatchAssist-debug.apk</strong> (LAN :18765, OneDrive, or USB auto-install)</li>
<li>Assist → <strong>Pair this phone</strong> → enter desktop TEMP pairing code</li>
<li>Choose sealed offer <code>pairing-offer.json</code> (or Fetch from PC)</li>
<li>Import newest <code>.ehsync</code> (or Fetch capsule from PC)</li>
<li><strong>Send proof to PC</strong> — desktop watcher matches digest <code>${digestShort}…</code></li>
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
$wirelessHelper = Join-Path $PSScriptRoot 'private-sync-adb-wireless.ps1'
$nextWirelessProbe = Get-Date
while ((Get-Date) -lt $deadline) {
  # USB or wireless (mDNS / TEMP\eh-adb-wireless.local.txt / ESCAPEHATCH_ADB_CONNECT)
  if ((Get-Date) -ge $nextWirelessProbe -and (Test-Path $wirelessHelper)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $wirelessHelper -Adb $adb | ForEach-Object { Write-Output $_ }
    $nextWirelessProbe = (Get-Date).AddSeconds(30)
  }
  # Physical phone only — Android emulators are Keystore lab devices, not android-phone 3/3.
  $physicalRows = & $adb devices | Select-Object -Skip 1 | Where-Object {
    $_ -and $_ -notmatch '^emulator-' -and $_ -notmatch '^\s*$'
  }
  if ($physicalRows | Where-Object { $_ -match '\tunauthorized' }) {
    Write-Output 'adb_device=unauthorized_tap_allow_on_phone'
  }
  $devices = @($physicalRows | Where-Object { $_ -match '\tdevice$' })
  if ($devices) {
    Write-Output "adb_device=attached"
    $serial = (($devices[0] -split '\s+')[0])
    if ($apk) {
      & $adb -s $serial install -r $apk
      Write-Output "apk_install_exit=$LASTEXITCODE"
    }
    $remoteDir = '/sdcard/Download/EscapeHatchPrivateSync'
    & $adb -s $serial shell mkdir -p $remoteDir
    if ($capsule) { & $adb -s $serial push $capsule.FullName "$remoteDir/" }
    & $adb -s $serial push (Join-Path $od 'pairing-offer.json') "$remoteDir/"
    Write-Output "pushed_files=$remoteDir"
    # Launch pair UI via exported deep link (activities stay non-exported for release).
    # Pairing code stays on desktop TEMP only (never pushed).
    & $adb -s $serial shell am start -a android.intent.action.VIEW -d 'escapehatch://assist/pair' | Out-Null
    Write-Output "pairing_ui_launched=1"
    Set-Content -Path (Join-Path $env:TEMP 'eh-physical-phone-attached.flag') -Value ((Get-Date).ToUniversalTime().ToString('o')) -NoNewline
    try {
      Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
      Add-Type -AssemblyName System.Drawing -ErrorAction Stop
      $ni = New-Object System.Windows.Forms.NotifyIcon
      $ni.Icon = [System.Drawing.SystemIcons]::Information
      $ni.Visible = $true
      $ni.ShowBalloonTip(
        15000,
        'EscapeHatch phone attached',
        'Pair on phone with TEMP\pairing-code.local.txt, import capsule, then Send proof to PC.',
        [System.Windows.Forms.ToolTipIcon]::Info
      )
      Start-Sleep -Seconds 2
      $ni.Dispose()
    } catch {
      Write-Output 'balloon=skipped'
    }
    Start-Process 'http://127.0.0.1:18766/corridor' -ErrorAction SilentlyContinue
    Write-Output "NEXT=On phone: enter TEMP pairing code → Fetch/import capsule → Send proof to PC (LAN :18765/proof)"
    exit 0
  }
  Start-Sleep -Seconds 5
}

Write-Output "adb_device=none_within_${WaitMinutes}m"
Write-Output "NEXT=Install via LAN :18765 / OneDrive helper, USB-debug, or wireless: write pair/connect lines to TEMP\eh-adb-wireless.local.txt"
exit 2
