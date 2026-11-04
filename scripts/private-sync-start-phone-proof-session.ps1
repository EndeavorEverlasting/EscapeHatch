# One operator command to prepare the USB-free Android 3/3 proof session.
# Stages APK/offer/helper, ensures localhost status+corridor, opens helper UI,
# and starts the OneDrive proof watcher. Never prints preference values or the pairing code.
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

# Ensure status server + corridor for live Pair CTA
$statusUp = $false
try {
  $null = Invoke-WebRequest 'http://127.0.0.1:18766/' -UseBasicParsing -TimeoutSec 2
  $statusUp = $true
} catch { $statusUp = $false }
if (-not $statusUp) {
  Start-Process -WindowStyle Hidden -FilePath node -ArgumentList @(
    '--experimental-strip-types', 'private-sync-status-server.ts', $od, '18766'
  ) -WorkingDirectory (Join-Path $repo 'artifacts\escape-hatch')
  Start-Sleep -Seconds 2
}

Start-Process 'http://127.0.0.1:18766/corridor'
$helper = Join-Path $od 'PHONE_PROOF_HELPER.html'
if (Test-Path $helper) { Start-Process $helper }

# Start watcher if none is already waiting on the proof file
$watchers = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'private-sync-await-phone-proof\.ps1' }
if (-not $watchers) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'private-sync-await-phone-proof.ps1')
  )
  Write-Output 'watcher=started'
} else {
  Write-Output "watcher=already_running pid=$($watchers[0].ProcessId)"
}

Write-Output "onedrive=$od"
Write-Output 'pairingCode=TEMP\pairing-code.local.txt (not printed)'
Write-Output 'corridor=http://127.0.0.1:18766/corridor'
Write-Output 'NEXT=Install APK from OneDrive EscapeHatchPrivateSync → Pair → Import .ehsync → Save/Copy proof JSON back to that folder'
exit 0
