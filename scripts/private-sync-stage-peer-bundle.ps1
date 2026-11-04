# Stage a ciphertext-only Windows peer CLI bundle into the OneDrive carrier so a
# second PC can pair without cloning EscapeHatch. Never copies preference values,
# pairing codes, vault keys, or OAuth tokens.
param(
  [string]$Carrier = $(Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'),
  [string]$RepoRoot = $(Split-Path -Parent $PSScriptRoot),
  [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
if ($SelfTest) {
  $Carrier = Join-Path $env:TEMP ("eh-peer-bundle-selftest-" + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Force -Path $Carrier | Out-Null
}
$srcEh = Join-Path $RepoRoot 'artifacts\escape-hatch'
$taxonomy = Join-Path $RepoRoot 'harness\contracts\application-form-taxonomy.v1.json'
if (-not (Test-Path (Join-Path $srcEh 'private-sync-cli.ts'))) {
  throw "MISSING_CLI $srcEh\private-sync-cli.ts"
}
if (-not (Test-Path $taxonomy)) {
  throw "MISSING_TAXONOMY $taxonomy"
}

$bundle = Join-Path $Carrier 'peer-bundle'
$dstEh = Join-Path $bundle 'artifacts\escape-hatch'
$dstHarness = Join-Path $bundle 'harness\contracts'
New-Item -ItemType Directory -Force -Path $dstEh, $dstHarness, (Join-Path $dstEh 'src\lib') | Out-Null

$modules = @(
  'private-sync-cli.ts',
  'private-sync-device.ts',
  'private-sync-status.ts',
  'private-sync-crypto.ts',
  'private-sync-keystore.ts',
  'private-sync-config.ts',
  'private-sync-transport.ts',
  'private-sync-carrier.ts',
  'private-sync-chain.ts',
  'private-sync-after-write.ts',
  'private-sync-drive-oauth.ts',
  'private-sync-drive-transport.ts',
  'preference-file.ts',
  'user-data.ts',
  'src\lib\application-preferences.ts'
)
foreach ($rel in $modules) {
  $from = Join-Path $srcEh $rel
  if (-not (Test-Path $from)) { throw "MISSING_MODULE $from" }
  $to = Join-Path $dstEh $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
  Copy-Item $from $to -Force
}
Copy-Item $taxonomy (Join-Path $dstHarness 'application-form-taxonomy.v1.json') -Force

# private-sync-keystore.ts resolves ../../scripts/windows/EscapeHatch-PrivateSyncKey.ps1
# from artifacts/escape-hatch (peer-bundle layout must mirror the repo).
$dpapiHelper = Join-Path $RepoRoot 'scripts\windows\EscapeHatch-PrivateSyncKey.ps1'
if (-not (Test-Path $dpapiHelper)) { throw "MISSING_DPAPI_HELPER $dpapiHelper" }
$dstWindows = Join-Path $bundle 'scripts\windows'
New-Item -ItemType Directory -Force -Path $dstWindows | Out-Null
Copy-Item $dpapiHelper (Join-Path $dstWindows 'EscapeHatch-PrivateSyncKey.ps1') -Force

$runnerDst = Join-Path $Carrier 'Run-WindowsPeerPair.ps1'
$stepsPath = Join-Path $Carrier 'LAPTOP_PEER_STEPS.txt'

# Thin carrier-local entrypoint: resolves peer-bundle CLI + UpdateLedger.
# UTF-8 BOM so Windows PowerShell 5 parses the staged .ps1 correctly.
$utf8Bom = New-Object System.Text.UTF8Encoding $true
$runnerText = (@(
  '# Auto-staged by private-sync-stage-peer-bundle.ps1 - ciphertext tooling only.',
  '# Run on the SECOND Windows PC (same OneDrive). Pairing code stays in TEMP on the desktop until you type/paste it here.',
  '$ErrorActionPreference = ''Stop''',
  '$Carrier = $PSScriptRoot',
  '$CliDir = Join-Path $Carrier ''peer-bundle\artifacts\escape-hatch''',
  'if (-not (Test-Path (Join-Path $CliDir ''private-sync-cli.ts''))) { throw ''MISSING_PEER_BUNDLE - run private-sync-stage-peer-bundle.ps1 on the desktop first'' }',
  '$peer = Join-Path $Carrier ''private-sync-pair-windows-peer.ps1''',
  '& powershell -NoProfile -ExecutionPolicy Bypass -File $peer -Carrier $Carrier -CliDir $CliDir -UpdateLedger @args',
  'exit $LASTEXITCODE'
) -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText($runnerDst, $runnerText, $utf8Bom)

$stepsText = (@(
  'EscapeHatch laptop peer (second Windows host)',
  'Run ON the other Windows PC. Same OneDrive account. Requires Node.js 20+ with --experimental-strip-types.',
  '',
  '1. Wait for OneDrive to sync EscapeHatchPrivateSync (peer-bundle\, Run-WindowsPeerPair.ps1, pairing-offer.json, .ehsync).',
  '2. On the DESKTOP: open corridor Pair this phone (or read %TEMP%\pairing-code.local.txt) and keep the code ready.',
  '3. On the PEER PC: copy the code into %TEMP%\pairing-code.local.txt (one line, no spaces), then:',
  '   powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\OneDrive\EscapeHatchPrivateSync\Run-WindowsPeerPair.ps1"',
  '4. Expect peerId=laptop (not laptop-sim), keyBackend=windows-dpapi, digestMatch=true.',
  '5. Values are never printed. Phone 3/3 remains a separate Android proof.',
  '',
  'Do not put the pairing code in OneDrive. Do not commit carrier files to Git.'
) -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText($stepsPath, $stepsText, $utf8Bom)

# Copy peer script with UTF-8 BOM (avoids PS5 mojibake on punctuation).
$peerBytes = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'private-sync-pair-windows-peer.ps1'))
[System.IO.File]::WriteAllText((Join-Path $Carrier 'private-sync-pair-windows-peer.ps1'), $peerBytes, $utf8Bom)

$bytes = (Get-ChildItem -Path $bundle -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Output "staged=$bundle modules=$($modules.Count) bytes=$bytes runner=$runnerDst"

# Mirror private-sync-keystore.ts repoWindowsHelper() relative resolve.
$resolvedHelper = [IO.Path]::GetFullPath((Join-Path $dstEh '..\..\scripts\windows\EscapeHatch-PrivateSyncKey.ps1'))
if (-not (Test-Path $resolvedHelper)) {
  throw "PEER_BUNDLE_DPAPI_HELPER_UNRESOLVED $resolvedHelper"
}
# Smoke the helper without touching vault keys (32 zero bytes → Protect → Unprotect).
$zeros = [Convert]::ToBase64String([byte[]]::new(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$prot = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $resolvedHelper -Action Protect -Payload $zeros
if (-not $prot) { throw 'PEER_BUNDLE_DPAPI_PROTECT_FAILED' }
$round = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $resolvedHelper -Action Unprotect -Payload $prot.Trim()
if ($round.Trim() -ne $zeros) { throw 'PEER_BUNDLE_DPAPI_ROUNDTRIP_FAILED' }
Write-Output 'dpapi_helper=ok'

if ($SelfTest) {
  Write-Output "selftest=PASS carrier=$Carrier"
  Remove-Item -LiteralPath $Carrier -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}

Write-Output 'NEXT=On peer PC after OneDrive sync: Run-WindowsPeerPair.ps1 with TEMP pairing code'
exit 0
