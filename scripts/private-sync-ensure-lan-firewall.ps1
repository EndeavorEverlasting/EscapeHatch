# Ensure Private-profile inbound TCP 18765 + UDP 18767 for EscapeHatch phone LAN install/beacon.
# Safe: allow only those ports; never opens pairing codes. May require elevation.
param(
  [switch]$Elevated
)
$ErrorActionPreference = 'Stop'

function Ensure-Rule([string]$Name, [string]$Protocol, [int]$Port) {
  # Profile Any: Windows often marks home Wi-Fi as Public; Private-only blocks phones.
  $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    if (-not $existing.Enabled) {
      Enable-NetFirewallRule -DisplayName $Name
    }
    try {
      Set-NetFirewallRule -DisplayName $Name -Profile Any
    } catch {
      Write-Output "firewall_profile_warn=$($_.Exception.Message)"
    }
    $rule = Get-NetFirewallRule -DisplayName $Name
    Write-Output "firewall=exists name=$Name enabled=$($rule.Enabled) profile=$($rule.Profile)"
    return
  }
  New-NetFirewallRule -DisplayName $Name -Direction Inbound -Protocol $Protocol -LocalPort $Port -Action Allow -Profile Any | Out-Null
  Write-Output "firewall=created name=$Name proto=$Protocol port=$Port profile=Any"
}

try {
  Ensure-Rule 'EscapeHatch phone proof LAN 18765' 'TCP' 18765
  Ensure-Rule 'EscapeHatch phone proof beacon UDP 18767' 'UDP' 18767
  exit 0
} catch {
  if ($Elevated) {
    Write-Output "firewall_err=$($_.Exception.Message)"
    exit 1
  }
  # Re-launch elevated once (UAC). Operator must approve.
  $self = $MyInvocation.MyCommand.Path
  Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $self, '-Elevated'
  ) | Out-Null
  Write-Output 'firewall=uac_prompted'
  exit 0
}
