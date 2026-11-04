# Ensure Private-profile inbound TCP 18765 for EscapeHatch phone LAN install.
# Safe: allow only that port; never opens pairing codes. May require elevation.
param(
  [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
$ruleName = 'EscapeHatch phone proof LAN 18765'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  if (-not $existing.Enabled) {
    Enable-NetFirewallRule -DisplayName $ruleName
  }
  Write-Output "firewall=exists enabled=$([bool](Get-NetFirewallRule -DisplayName $ruleName).Enabled)"
  exit 0
}

try {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 18765 -Action Allow -Profile Private | Out-Null
  Write-Output 'firewall=created'
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
