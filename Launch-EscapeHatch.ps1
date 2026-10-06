<# EscapeHatch one-click Windows launcher.
   Delegates all lifecycle behavior to the canonical repository-owned manager.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$manager = Join-Path $PSScriptRoot 'scripts\windows\EscapeHatch-Runtime.ps1'
if (-not (Test-Path -LiteralPath $manager -PathType Leaf)) {
    Write-Host "ERROR: lifecycle manager missing at $manager" -ForegroundColor Red
    exit 1
}

& $manager -Action Start
exit $LASTEXITCODE
