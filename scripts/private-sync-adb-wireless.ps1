# Best-effort wireless ADB attach for phone proof (no preference values, no vault codes).
# Operator may drop instructions in %TEMP%\eh-adb-wireless.local.txt:
#   pair 192.168.1.50:37123 123456
#   connect 192.168.1.50:5555
# Or set ESCAPEHATCH_ADB_CONNECT=host:port / ESCAPEHATCH_ADB_PAIR=host:port:code
param(
  [string]$Adb = $(Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')
)
$ErrorActionPreference = 'Continue'
if (-not (Test-Path $Adb)) { Write-Output 'adb=missing'; exit 1 }

# ARP OUI prefixes that are displays/cast gear, not EscapeHatch phone proof targets.
$NonPhoneOuiPrefixes = @(
  'A8-4A-63'  # TPV Display Technology (smart TV / monitor)
)

function Get-PhysicalAdbRows {
  & $Adb devices | Select-Object -Skip 1 | Where-Object {
    $_ -and $_ -notmatch '^emulator-' -and $_ -notmatch '^\s*$'
  }
}

function Test-NonPhoneLanHost([string]$HostIp) {
  if (-not $HostIp) { return $false }
  try {
    $n = Get-NetNeighbor -IPAddress $HostIp -ErrorAction SilentlyContinue | Select-Object -First 1
    $mac = [string]$n.LinkLayerAddress
    if (-not $mac) { return $false }
    foreach ($oui in $NonPhoneOuiPrefixes) {
      if ($mac.StartsWith($oui, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Output "adb_skip_non_phone host=$HostIp mac=$mac oui=$oui"
        return $true
      }
    }
  } catch {}
  return $false
}

function Try-Connect([string]$Endpoint) {
  if (-not $Endpoint) { return $false }
  $hostIp = ($Endpoint -split ':')[0]
  if (Test-NonPhoneLanHost $hostIp) {
    & $Adb disconnect $Endpoint 2>&1 | Out-Null
    return $false
  }
  Write-Output "adb_connect_try=$Endpoint"
  & $Adb connect $Endpoint 2>&1 | ForEach-Object { Write-Output $_ }
  $rows = Get-PhysicalAdbRows
  if ($rows | Where-Object { $_ -match '\tdevice$' }) { return $true }
  if ($rows | Where-Object { $_ -match '\tunauthorized' }) {
    Write-Output 'adb_device=unauthorized_tap_allow_on_phone'
  }
  return $false
}

# Env one-shot pair: host:port:code
if ($env:ESCAPEHATCH_ADB_PAIR -match '^([^:]+:\d+):(\d+)$') {
  $pairTarget = $Matches[1]
  $pairCode = $Matches[2]
  Write-Output "adb_pair_try=$pairTarget"
  & $Adb pair $pairTarget $pairCode 2>&1 | ForEach-Object { Write-Output $_ }
  Remove-Item Env:ESCAPEHATCH_ADB_PAIR -ErrorAction SilentlyContinue
}

if ($env:ESCAPEHATCH_ADB_CONNECT) {
  if (Try-Connect $env:ESCAPEHATCH_ADB_CONNECT) { exit 0 }
}

$local = Join-Path $env:TEMP 'eh-adb-wireless.local.txt'
if (Test-Path $local) {
  Get-Content $local | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^pair\s+(\S+)\s+(\d+)\s*$') {
      Write-Output "adb_pair_try=$($Matches[1])"
      & $Adb pair $Matches[1] $Matches[2] 2>&1 | ForEach-Object { Write-Output $_ }
    } elseif ($line -match '^connect\s+(\S+)\s*$') {
      [void](Try-Connect $Matches[1])
    }
  }
}

# mDNS discovery (Android 11+ wireless debugging)
$mdns = & $Adb mdns services 2>&1
$mdns | ForEach-Object { Write-Output "mdns=$_" }
foreach ($line in $mdns) {
  if ($line -match '(\d+\.\d+\.\d+\.\d+:\d+).*(adb-tls-connect|adb_tls_connect)') {
    if (Try-Connect $Matches[1]) { exit 0 }
  }
}

# Fast ARP-neighbor probe for classic wireless ADB (:5555). Short TCP timeouts —
# never run a full-subnet Test-NetConnection sweep (that hung phone waiters).
function Test-TcpOpenFast([string]$HostIp, [int]$Port, [int]$TimeoutMs = 250) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($HostIp, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      try { $client.Close() } catch {}
      return $false
    }
    $client.EndConnect($iar)
    return $true
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch {}
  }
}

$selfIps = @{}
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.IPAddress) { $selfIps[$_.IPAddress] = $true }
}
$neighbors = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.State -in @('Reachable', 'Stale', 'Delay', 'Probe') -and
    $_.IPAddress -match '^192\.168\.\d+\.\d+$' -and
    -not $selfIps.ContainsKey($_.IPAddress)
  } |
  Select-Object -ExpandProperty IPAddress -Unique

foreach ($hostIp in $neighbors) {
  if (Test-NonPhoneLanHost $hostIp) { continue }
  if (-not (Test-TcpOpenFast $hostIp 5555 250)) { continue }
  Write-Output "arp_adb_open=${hostIp}:5555"
  if (Try-Connect "${hostIp}:5555") { exit 0 }
}

$rows = Get-PhysicalAdbRows
if ($rows | Where-Object { $_ -match '\tdevice$' }) {
  Write-Output 'adb_device=present'
  exit 0
}
if ($rows | Where-Object { $_ -match '\tunauthorized' }) {
  Write-Output 'adb_device=unauthorized_tap_allow_on_phone'
  exit 3
}
Write-Output 'adb_wireless=none'
exit 2
