# Open a SHORT NordVPN-off window so the phone can reach LAN :18765, then ALWAYS
# reconnect Nord. Never prints pairing codes or preference values.
# Prefer OneDrive APK when possible — this script is only for the LAN path.
param(
  [ValidateSet('Open', 'RestoreOnly', 'Status')]
  [string]$Mode = 'Open',
  [int]$MaxMinutes = 12,
  [switch]$RestoreAfterForeignApk
)
$ErrorActionPreference = 'Continue'
$nordExe = 'C:\Program Files\NordVPN\NordVPN.exe'
$statePath = Join-Path $env:TEMP 'eh-nord-lan-window.state.json'
$logPath = Join-Path $env:TEMP 'eh-phone-lan-access.log'
$proofCarrier = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync\escapehatch-phone-sync-proof.json'
$flagPath = Join-Path $env:TEMP 'eh-lan-phone-seen.flag'

function Test-NordConnected {
  $adapter = Get-NetAdapter -Name 'NordLynx' -ErrorAction SilentlyContinue
  if ($adapter -and $adapter.Status -eq 'Up') { return $true }
  $tap = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    $_.Status -eq 'Up' -and ($_.Name -match 'Nord|TAP-Nord' -or $_.InterfaceDescription -match 'Nord')
  }
  return [bool]$tap
}

function Invoke-NordDisconnect {
  if (-not (Test-Path $nordExe)) { throw "NORDVPN_EXE_MISSING path=$nordExe" }
  & $nordExe --disconnect 2>&1 | Out-Null
  Start-Sleep -Seconds 3
  for ($i = 0; $i -lt 20; $i++) {
    if (-not (Test-NordConnected)) { return $true }
    Start-Sleep -Seconds 1
  }
  return -not (Test-NordConnected)
}

function Invoke-NordConnect {
  if (-not (Test-Path $nordExe)) { throw "NORDVPN_EXE_MISSING path=$nordExe" }
  & $nordExe --connect 2>&1 | Out-Null
  Start-Sleep -Seconds 4
  for ($i = 0; $i -lt 45; $i++) {
    if (Test-NordConnected) { return $true }
    Start-Sleep -Seconds 2
  }
  return (Test-NordConnected)
}

function Write-State([hashtable]$State) {
  ($State | ConvertTo-Json -Compress) | Set-Content -Path $statePath -Encoding utf8 -NoNewline
}

function Read-State {
  if (-not (Test-Path $statePath)) { return $null }
  try {
    return Get-Content $statePath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Restore-NordIfNeeded([string]$Reason) {
  $state = Read-State
  $wantRestore = $false
  if ($state -and $state.disconnectedForLan -eq $true) { $wantRestore = $true }
  if (-not (Test-NordConnected) -and $Mode -eq 'RestoreOnly') { $wantRestore = $true }
  if (-not $wantRestore) {
    Write-Output "nord_restore=skipped reason=$Reason connected=$(Test-NordConnected)"
    return 0
  }
  Write-Output "nord_restore=start reason=$Reason"
  $ok = Invoke-NordConnect
  if ($ok) {
    Write-State @{
      disconnectedForLan = $false
      restoredAt = (Get-Date).ToUniversalTime().ToString('o')
      restoreReason = $Reason
      connected = $true
    }
    Write-Output 'nord_restore=ok connected=true'
    try {
      Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
      Add-Type -AssemblyName System.Drawing -ErrorAction Stop
      $ni = New-Object System.Windows.Forms.NotifyIcon
      $ni.Icon = [System.Drawing.SystemIcons]::Shield
      $ni.Visible = $true
      $ni.ShowBalloonTip(
        12000,
        'EscapeHatch — NordVPN restored',
        "LAN window closed ($Reason). Your VPN tunnel is back up.",
        [System.Windows.Forms.ToolTipIcon]::Info
      )
      Start-Sleep -Seconds 2
      $ni.Dispose()
    } catch { }
    return 0
  }
  Write-Output 'nord_restore=FAILED — open NordVPN app and Connect now'
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $ni = New-Object System.Windows.Forms.NotifyIcon
    $ni.Icon = [System.Drawing.SystemIcons]::Error
    $ni.Visible = $true
    $ni.ShowBalloonTip(
      20000,
      'EscapeHatch — reconnect NordVPN',
      'Automatic restore failed. Tap Connect in NordVPN so traffic is tunnelled again.',
      [System.Windows.Forms.ToolTipIcon]::Error
    )
    Start-Sleep -Seconds 3
    $ni.Dispose()
  } catch { }
  return 2
}

function Test-ForeignApkHit {
  if (-not (Test-Path $logPath)) { return $false }
  $self = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '192.168.*' -and $_.InterfaceAlias -match 'Wi-?Fi|WLAN' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
  $lines = Get-Content $logPath -Tail 80 -ErrorAction SilentlyContinue
  foreach ($line in $lines) {
    if ($line -notmatch '"path"\s*:\s*"/apk"') { continue }
    if ($line -notmatch '"remote"\s*:\s*"([^"]+)"') { continue }
    $remote = $Matches[1] -replace '^::ffff:', ''
    if ($remote -in @('127.0.0.1', '::1', 'localhost', $self)) { continue }
    return $true
  }
  return $false
}

function Test-ProofSeen {
  if (Test-Path $proofCarrier) { return $true }
  $desktop = Join-Path $env:USERPROFILE 'Desktop\escapehatch-phone-sync-proof.json'
  if (Test-Path $desktop) { return $true }
  return $false
}

if ($Mode -eq 'Status') {
  $st = Read-State
  Write-Output "nord_connected=$(Test-NordConnected)"
  Write-Output "state_path=$statePath"
  if ($st) { Write-Output ("state=" + ($st | ConvertTo-Json -Compress)) }
  exit 0
}

if ($Mode -eq 'RestoreOnly') {
  exit (Restore-NordIfNeeded 'RestoreOnly')
}

# --- Open short LAN window ---
$wasConnected = Test-NordConnected
Write-Output "nord_lan_window=open maxMinutes=$MaxMinutes wasConnected=$wasConnected"
if (-not $wasConnected) {
  Write-Output 'nord_lan_window=already_disconnected — waiting for phone then will Connect if restore needed'
  Write-State @{
    disconnectedForLan = $true
    openedAt = (Get-Date).ToUniversalTime().ToString('o')
    wasConnected = $false
    maxMinutes = $MaxMinutes
  }
} else {
  $disc = Invoke-NordDisconnect
  if (-not $disc) {
    Write-Output 'nord_disconnect=FAILED_OR_AUTOCONNECT_PROMPT — confirm Nord UI if shown, then rerun'
    # Still record intent so RestoreOnly can reconnect after operator finishes disconnect
    Write-State @{
      disconnectedForLan = $true
      openedAt = (Get-Date).ToUniversalTime().ToString('o')
      wasConnected = $true
      disconnectOk = $false
      maxMinutes = $MaxMinutes
    }
    if (Test-NordConnected) {
      Write-Output 'BLOCKER=Nord still connected; LAN phone path remains blocked until disconnect succeeds'
      exit 3
    }
  }
  Write-State @{
    disconnectedForLan = $true
    openedAt = (Get-Date).ToUniversalTime().ToString('o')
    wasConnected = $true
    disconnectOk = $true
    maxMinutes = $MaxMinutes
  }
  Write-Output 'nord_disconnect=ok connected=false'
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $ni = New-Object System.Windows.Forms.NotifyIcon
    $ni.Icon = [System.Drawing.SystemIcons]::Warning
    $ni.Visible = $true
    $ni.ShowBalloonTip(
      15000,
      'EscapeHatch — NordVPN paused',
      "LAN open ≤$MaxMinutes min for phone :18765. VPN reconnects automatically when transfer finishes or time expires.",
      [System.Windows.Forms.ToolTipIcon]::Warning
    )
    Start-Sleep -Seconds 2
    $ni.Dispose()
  } catch { }
}

$deadline = (Get-Date).AddMinutes([Math]::Max(1, $MaxMinutes))
$restoreReason = 'max_minutes'
try {
  while ((Get-Date) -lt $deadline) {
    if (Test-ProofSeen) {
      $restoreReason = 'phone_proof_seen'
      Write-Output 'trigger=phone_proof_seen'
      break
    }
    if (Test-Path $flagPath) {
      # Foreign LAN client already hit install server — keep window only briefly more if waiting for APK
      if ($RestoreAfterForeignApk -and (Test-ForeignApkHit)) {
        $restoreReason = 'foreign_apk'
        Write-Output 'trigger=foreign_apk'
        break
      }
    }
    if ($RestoreAfterForeignApk -and (Test-ForeignApkHit)) {
      $restoreReason = 'foreign_apk'
      Write-Output 'trigger=foreign_apk'
      break
    }
    # Operator can force early restore: create TEMP\eh-nord-restore-now.flag
    if (Test-Path (Join-Path $env:TEMP 'eh-nord-restore-now.flag')) {
      $restoreReason = 'operator_flag'
      Remove-Item (Join-Path $env:TEMP 'eh-nord-restore-now.flag') -Force -ErrorAction SilentlyContinue
      Write-Output 'trigger=operator_flag'
      break
    }
    Start-Sleep -Seconds 5
  }
} finally {
  # HARD GUARANTEE: reconnect Nord after the LAN window regardless of how we exit.
  $code = Restore-NordIfNeeded $restoreReason
  if ($code -ne 0) { exit $code }
}
Write-Output "nord_lan_window=closed reason=$restoreReason"
exit 0
