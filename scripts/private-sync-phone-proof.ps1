# Prepares value-free phone sync proof artifacts and sideloads when adb sees a device.
# Never prints preference values or the pairing code to the console.
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
  if (Test-Path $offerOut) { Remove-Item $offerOut -Force }
  $exportRaw = node --experimental-strip-types private-sync-cli.ts export-pairing $od $offerOut 2>&1
  $export = ($exportRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
} finally {
  Pop-Location
}

Set-Content -Path $codeLocal -Value $export.pairingCode -NoNewline
Copy-Item $offerOut (Join-Path $od 'pairing-offer.json') -Force
$capsule = Get-ChildItem $od -Filter '*.ehsync' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

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
    python -c "import qrcode; qrcode.make(r'$lanUrl').save(r'$($qrPath.Replace('\','\\'))')"
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

$deadline = (Get-Date).AddMinutes(20)
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
    Write-Output "NEXT=Open EscapeHatch Assist → Pair sync vault (code in $codeLocal) → Import encrypted answers (.ehsync)"
    exit 0
  }
  Start-Sleep -Seconds 5
}

Write-Output "adb_device=none_within_20m"
Write-Output "NEXT=Connect phone with USB debugging, rerun this script, or install APK manually from $apk"
exit 2
