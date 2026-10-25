<# EscapeHatch one-click Windows launcher.
   Bootstrap resolves the installed source and dependencies before canonical Start.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'scripts\windows\EscapeHatch-Install.ps1'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    Write-Host "ERROR: EscapeHatch bootstrap is missing." -ForegroundColor Red
    exit 1
}
& $installer -Action Bootstrap
exit $LASTEXITCODE
