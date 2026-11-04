# Stage EscapeHatchPhoneDrop with FIXED filenames only.
# Phone UX contract: one folder grant → auto-load these names → auto-write proof.
# Never ask the operator to hunt hash .ehsync names or 64-char titles.
[CmdletBinding()]
param(
  [switch]$OpenCodeNotepad,
  [switch]$SkipApk
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo 'artifacts\escape-hatch\private-sync-cli.ts'))) {
  throw "EscapeHatch worktree not found at $repo"
}

$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$desk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'EscapeHatchPhoneDrop'
foreach ($d in @($od, $desk)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

$offerOut = Join-Path $env:TEMP 'eh-pairing-offer-phone.json'
$codeLocal = Join-Path $env:TEMP 'pairing-code.local.txt'
# Host + phone agree on 8h window for this pack.
$env:ESCAPEHATCH_PAIRING_TTL_MS = '28800000'

Push-Location (Join-Path $repo 'artifacts\escape-hatch')
try {
  $statusRaw = node --experimental-strip-types private-sync-cli.ts status $od 2>&1
  $status = ($statusRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if (-not $status -or $status.status -ne 'SYNCED') {
    throw "Carrier not SYNCED (got $($status.status)). Push answers first."
  }
  if (Test-Path $offerOut) { Remove-Item $offerOut -Force }
  $exportRaw = node --experimental-strip-types private-sync-cli.ts export-pairing $od $offerOut 2>&1
  $export = ($exportRaw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1) | ConvertFrom-Json
  if ($export.pairingCode -and $export.pairingCode -ne 'written_to_temp_only') {
    Set-Content -Path $codeLocal -Value $export.pairingCode -NoNewline
  }
  if (-not (Test-Path $codeLocal) -or (Get-Content $codeLocal -Raw).Length -lt 16) {
    throw 'export-pairing did not write TEMP\pairing-code.local.txt'
  }
} finally {
  Pop-Location
}

$code = (Get-Content $codeLocal -Raw).Trim()
$capsule = Get-ChildItem $od -Filter '*.ehsync' |
  Where-Object { $_.Name -ne 'escapehatch-answers.ehsync' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $capsule) {
  $capsule = Get-ChildItem $od -Filter '*.ehsync' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $capsule) { throw "No .ehsync capsule in $od" }

$apkCandidates = @(
  (Join-Path $repo 'android\application-assist\app\build\outputs\apk\debug\app-debug.apk'),
  (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk')
) | Where-Object { Test-Path $_ }
$apkItem = $apkCandidates | ForEach-Object { Get-Item $_ } | Sort-Object LastWriteTime -Descending | Select-Object -First 1

$startHere = @(
  'EscapeHatch phone pack — three steps, fixed names only',
  '',
  'On the phone (Drive / Files → EscapeHatchPhoneDrop):',
  '  1) Install EscapeHatchAssist-debug.apk',
  '  2) Assist → Pair this phone → Choose EscapeHatchPhoneDrop folder (once)',
  '  3) Confirm pairing → Import loads escapehatch-answers.ehsync → proof auto-saves',
  '',
  'Fixed files in this folder:',
  '  pairing-offer.json',
  '  PAIRING_CODE.txt',
  '  escapehatch-answers.ehsync',
  '  escapehatch-phone-sync-proof.json  (written by the phone)',
  '',
  "Desktop digest: $($status.projectionDigest)",
  'No hash filenames. No chat titles. Nord stays on for Drive path.'
) -join "`r`n"

# Visible desktop code surface (SEAM-EMPTY-CODE-SURFACE / SEAM-CODE-NOT-VISIBLE).
$desktopCode = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ESCAPE_HATCH_PAIRING_CODE.txt'
Set-Content -Path $desktopCode -Value $code -NoNewline -Encoding ascii

foreach ($target in @($od, $desk)) {
  Copy-Item $offerOut (Join-Path $target 'pairing-offer.json') -Force
  Set-Content -Path (Join-Path $target 'PAIRING_CODE.txt') -Value $code -NoNewline -Encoding ascii
  Copy-Item $capsule.FullName (Join-Path $target 'escapehatch-answers.ehsync') -Force
  Set-Content -Path (Join-Path $target 'START_HERE.txt') -Value $startHere -Encoding utf8
  if (-not $SkipApk -and $apkItem) {
    Copy-Item $apkItem.FullName (Join-Path $target 'EscapeHatchAssist-debug.apk') -Force
  }
  # Mirror Drive pointer if host previously recorded it.
  $driveState = Join-Path $env:LOCALAPPDATA 'EscapeHatch\eh-phone-drive-folder.json'
  if (Test-Path $driveState) {
    try {
      $df = Get-Content $driveState -Raw | ConvertFrom-Json
      if ($df.webViewLink) {
        Set-Content (Join-Path $target 'GOOGLE_DRIVE_FOLDER.txt') $df.webViewLink -Encoding utf8
      }
    } catch { }
  }
}

# Keep TEMP APK in sync for later attach scripts (ignore lock if another process holds it).
if ($apkItem) {
  try {
    Copy-Item $apkItem.FullName (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk') -Force -ErrorAction Stop
  } catch {
    Write-Output "temp_apk_copy=skipped ($($_.Exception.Message))"
  }
}

Write-Output "staged_desktop=$desk"
Write-Output "staged_onedrive=$od"
Write-Output "answers=escapehatch-answers.ehsync"
Write-Output "offer=pairing-offer.json"
Write-Output "code=PAIRING_CODE.txt + Desktop\ESCAPE_HATCH_PAIRING_CODE.txt (also TEMP\pairing-code.local.txt)"
if ($OpenCodeNotepad) {
  Start-Process notepad.exe $desktopCode
}
Write-Output "digest=$($status.projectionDigest)"
Write-Output "apk=$(if ($apkItem) { $apkItem.FullName } else { 'missing' })"
Write-Output "vaultId=$($export.vaultId)"

# Best-effort: mirror fixed names into recorded Google Drive folder via existing MCP/agent path is out of band.
# Operator/agent upload uses Desktop EscapeHatchPhoneDrop as the source of truth.
exit 0
