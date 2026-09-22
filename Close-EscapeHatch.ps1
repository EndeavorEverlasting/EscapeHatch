<# One-click EscapeHatch close adapter.
   All ownership and shutdown decisions remain in the canonical lifecycle manager.
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

& $manager -Action Stop
exit $LASTEXITCODE
