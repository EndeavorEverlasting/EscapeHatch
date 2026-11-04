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

function Get-PhysicalAdbRows {
  & $Adb devices | Select-Object -Skip 1 | Where-Object {
    $_ -and $_ -notmatch '^emulator-' -and $_ -notmatch '^\s*$'
  }
}

function Try-Connect([string]$Endpoint) {
  if (-not $Endpoint) { return $false }
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
