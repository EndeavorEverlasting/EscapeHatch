# Pair a second Windows host into the sealed OneDrive carrier (ciphertext only).
# Run on the peer PC (or with a distinct ESCAPEHATCH_DATA_HOME). Never prints
# preference values. Pairing code is read from TEMP\pairing-code.local.txt only.
param(
  [string]$DataHome = $(if ($env:ESCAPEHATCH_DATA_HOME) { $env:ESCAPEHATCH_DATA_HOME } else { Join-Path $env:LOCALAPPDATA 'EscapeHatch-Peer' }),
  [string]$Carrier = $(Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'),
  [string]$PairingCodePath = $(Join-Path $env:TEMP 'pairing-code.local.txt'),
  [string]$CliDir = '',
  [switch]$UpdateLedger
)
$ErrorActionPreference = 'Stop'
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
$env:ESCAPEHATCH_DATA_HOME = $DataHome
# Never allow plaintext file-prototype keys on a Windows peer (lab override only).
if ($env:ESCAPEHATCH_SYNC_KEY_BACKEND -eq 'file') {
  Remove-Item Env:ESCAPEHATCH_SYNC_KEY_BACKEND -ErrorAction SilentlyContinue
  Write-Output 'key_backend_override=cleared_file_prototype'
}
$repo = Split-Path -Parent $PSScriptRoot
$carrierBundleCli = Join-Path $Carrier 'peer-bundle\artifacts\escape-hatch'
if (-not $CliDir) {
  $repoCli = Join-Path $repo 'artifacts\escape-hatch'
  if (Test-Path (Join-Path $repoCli 'private-sync-cli.ts')) {
    $CliDir = $repoCli
  } elseif (Test-Path (Join-Path $carrierBundleCli 'private-sync-cli.ts')) {
    $CliDir = $carrierBundleCli
  } else {
    throw "MISSING_CLI - stage with scripts/private-sync-stage-peer-bundle.ps1 or run from EscapeHatch worktree"
  }
}
if (-not (Test-Path (Join-Path $CliDir 'private-sync-cli.ts'))) {
  throw "MISSING_CLI $CliDir\private-sync-cli.ts"
}
Write-Output "cliDir=$CliDir"
$offer = Join-Path $Carrier 'pairing-offer.json'
if (-not (Test-Path $offer)) { throw "MISSING_OFFER $offer" }
if (-not (Test-Path $PairingCodePath)) { throw "MISSING_PAIRING_CODE_FILE $PairingCodePath (desktop TEMP only; never commit)" }
$code = (Get-Content -LiteralPath $PairingCodePath -Raw).Trim()
if ($code.Length -lt 8) { throw 'PAIRING_CODE_TOO_SHORT' }

New-Item -ItemType Directory -Force -Path $DataHome | Out-Null
function Invoke-SyncCli([string[]]$CliArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & node --experimental-strip-types private-sync-cli.ts @CliArgs 2>&1
  } finally {
    $ErrorActionPreference = $prev
  }
  $line = ($raw | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1)
  if (-not $line) {
    $joined = ($raw | ForEach-Object { "$_" }) -join ' | '
    throw "SYNC_CLI_NO_JSON $($CliArgs[0]): $joined"
  }
  return ($line | ConvertFrom-Json)
}

Push-Location $CliDir
try {
  $import = $null
  try {
    $import = Invoke-SyncCli @('import-pairing', $Carrier, $offer, $code)
  } catch {
    if ("$($_.Exception.Message)" -notmatch 'SYNC_KEY_EXISTS') { throw }
    Write-Output 'import=already_paired_or_key_present'
  }
  $pull = Invoke-SyncCli @('pull', $Carrier)
  $status = Invoke-SyncCli @('status', $Carrier)
} finally {
  Pop-Location
}

$machineGuid = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
$desktopGuidPath = Join-Path $Carrier 'desktop-machine-guid.local.txt'
$sameBox = $false
if (Test-Path $desktopGuidPath) {
  $deskGuid = (Get-Content -LiteralPath $desktopGuidPath -Raw).Trim()
  $sameBox = ($deskGuid -and $deskGuid -eq $machineGuid)
}

$peerId = if ($sameBox) { 'laptop-sim' } else { 'laptop' }
$proof = if ($sameBox) { 'ALTERNATE_DATA_HOME' } else { 'SECOND_WINDOWS_HOST' }

Write-Output "peerId=$peerId"
Write-Output "sameMachine=$sameBox"
Write-Output "status=$($status.status)"
Write-Output "digest=$($status.projectionDigest)"
Write-Output "count=$($status.reusableAnswerCount)"
Write-Output "keyBackend=$($status.keyBackend)"
Write-Output "importState=$($import.state)"
Write-Output "pullState=$($pull.state)"

if ($UpdateLedger -and (Test-Path (Join-Path $Carrier 'multidevice-proof-ledger.json'))) {
  $ledgerPath = Join-Path $Carrier 'multidevice-proof-ledger.json'
  $ledger = Get-Content $ledgerPath -Raw | ConvertFrom-Json
  $devices = @($ledger.devices)
  # Drop prior laptop / laptop-sim row; keep desktop + android-phone.
  $devices = @($devices | Where-Object { $_.id -notin @('laptop', 'laptop-sim') })
  $digestOk = ($status.projectionDigest -eq $ledger.projectionDigest) -and ($status.status -eq 'SYNCED')
  $devices += [pscustomobject]@{
    id = $peerId
    status = if ($digestOk) { 'SYNCED' } else { 'MISMATCH' }
    digestMatch = [bool]$digestOk
    proof = $proof
    keyBackend = $status.keyBackend
  }
  $ledger.devices = $devices
  $ledger.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  if (-not $sameBox) {
    $ledger.notes = (($ledger.notes -replace 'laptop-sim[^.]+\.', '') + " Windows peer $peerId via $proof.").Trim()
  }
  $json = $ledger | ConvertTo-Json -Depth 8
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($ledgerPath, $json + "`n", $utf8)
  Write-Output "ledger_updated=$ledgerPath peerId=$peerId digestMatch=$digestOk keyBackend=$($status.keyBackend)"
}

# Never print the pairing code.
exit 0
