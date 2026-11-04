# Ensure Private-profile inbound TCP 18765 + UDP 18767 for EscapeHatch phone LAN install/beacon.
# Safe: allow only those ports; never opens pairing codes. May require elevation.
param(
  [switch]$Elevated
)
$ErrorActionPreference = 'Stop'

function Ensure-Rule([string]$Name, [string]$Protocol, [int]$Port) {
  $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    if (-not $existing.Enabled) {
      Enable-NetFirewallRule -DisplayName $Name
    }
    Write-Output "firewall=exists name=$Name enabled=$([bool](Get-NetFirewallRule -DisplayName $Name).Enabled)"
    return
  }
  New-NetFirewallRule -DisplayName $Name -Direction Inbound -Protocol $Protocol -LocalPort $Port -Action Allow -Profile Private | Out-Null
  Write-Output "firewall=created name=$Name proto=$Protocol port=$Port"
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
