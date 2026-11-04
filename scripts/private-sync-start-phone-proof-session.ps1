# One operator command to prepare the USB-free Android 3/3 proof session.
# Stages APK/offer/helper, starts LAN APK server (18765), localhost corridor (18766),
# background ADB attach installer, and the OneDrive proof watcher.
# Never prints preference values or the pairing code.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

Write-Output '=== EscapeHatch phone proof session ==='
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'private-sync-phone-proof.ps1') -WaitMinutes 0
if ($LASTEXITCODE -notin 0, 2) { throw "phone-proof prepare failed: $LASTEXITCODE" }

function Test-LocalEndpoint([string]$Url) {
  try {
    $null = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

# Localhost status server + corridor for live Pair CTA (pairing codes stay here)
if (-not (Test-LocalEndpoint 'http://127.0.0.1:18766/')) {
  Start-Process -WindowStyle Hidden -FilePath node -ArgumentList @(
    '--experimental-strip-types', 'private-sync-status-server.ts', $od, '18766'
  ) -WorkingDirectory (Join-Path $repo 'artifacts\escape-hatch')
  Start-Sleep -Seconds 2
}

# LAN APK / sealed-artifact server for phone browser install (never serves pairing code)
$lanUp = Test-LocalEndpoint 'http://127.0.0.1:18765/health'
if (-not $lanUp) {
  Start-Process -WindowStyle Hidden -FilePath node -ArgumentList @(
    '--experimental-strip-types', 'private-sync-phone-lan-server.ts', $od, '18765'
  ) -WorkingDirectory (Join-Path $repo 'artifacts\escape-hatch')
  Start-Sleep -Seconds 2
  # Private-profile inbound 18765 (UAC if needed) so the phone can reach LAN install.
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'private-sync-ensure-lan-firewall.ps1') |
    ForEach-Object { Write-Output $_ }
}

Start-Process 'http://127.0.0.1:18766/corridor'
$helper = Join-Path $od 'PHONE_PROOF_HELPER.html'
if (Test-Path $helper) { Start-Process $helper }
$qr = Join-Path $od 'phone-install-qr.png'
if (-not (Test-Path $qr)) { $qr = Join-Path $env:TEMP 'escapehatch-phone-install-qr.png' }
if (Test-Path $qr) { Start-Process $qr }

# Proof watcher (OneDrive + Downloads) — long window; ledger updates on PROVEN
$watchers = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'private-sync-await-phone-proof\.ps1' }
if (-not $watchers) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'private-sync-await-phone-proof.ps1'),
    '-WaitMinutes', '360'
  )
  Write-Output 'watcher=started'
} else {
  Write-Output "watcher=already_running pid=$($watchers[0].ProcessId)"
}

# Background ADB attach: reuse existing offer; install + push + launch when a device appears
$adbWaiters = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'private-sync-phone-proof\.ps1' -and $_.CommandLine -match 'AttachOnly' }
if (-not $adbWaiters) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'private-sync-phone-proof.ps1'),
    '-AttachOnly',
    '-WaitMinutes', '45'
  )
  Write-Output 'adb_waiter=started'
} else {
  Write-Output "adb_waiter=already_running pid=$($adbWaiters[0].ProcessId)"
}

# Keep sealed offer + TEMP pairing code fresh across SAS TTL without printing the code
$keepers = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'private-sync-pairing-keepalive\.ps1' }
if (-not $keepers) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'private-sync-pairing-keepalive.ps1'),
    '-MaxHours', '6'
  )
  Write-Output 'pairing_keepalive=started'
} else {
  Write-Output "pairing_keepalive=already_running pid=$($keepers[0].ProcessId)"
}

$lanWatchers = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'private-sync-watch-lan-phone\.ps1' }
if (-not $lanWatchers) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'private-sync-watch-lan-phone.ps1'),
    '-WaitMinutes', '360'
  )
  Write-Output 'lan_phone_watch=started'
} else {
  Write-Output "lan_phone_watch=already_running pid=$($lanWatchers[0].ProcessId)"
}

$ceiling = Join-Path $PSScriptRoot 'private-sync-proof-ceiling-report.ps1'
if (Test-Path $ceiling) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $ceiling | ForEach-Object { Write-Output $_ }
}

$lanHealth = $null
try { $lanHealth = (Invoke-RestMethod 'http://127.0.0.1:18765/health' -TimeoutSec 2) } catch { }
Write-Output "onedrive=$od"
Write-Output 'pairingCode=TEMP\pairing-code.local.txt (not printed)'
Write-Output 'corridor=http://127.0.0.1:18766/corridor'
Write-Output 'lanInstall=http://<this-pc-wifi-ip>:18765/ (QR opened when available)'
Write-Output "lanHealth=$(if ($lanHealth) { 'ok' } else { 'down' })"
Write-Output 'NEXT=Phone on same Wi-Fi: scan QR / open :18765 → install APK → Pair → Import → Send proof to PC; or USB-debug for auto install'
exit 0
