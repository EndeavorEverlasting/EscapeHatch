<# Friendly EscapeHatch status adapter.
   Does not inspect or terminate processes itself.
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

& $manager -Action Status
exit $LASTEXITCODE
