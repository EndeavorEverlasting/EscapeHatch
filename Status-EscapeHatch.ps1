<# Resolve the installed source; the canonical runtime manager owns process safety. #>
[CmdletBinding()]
param(
    [string]$AppDataRoot = '',
    [string]$ShortcutRoot = '',
    [switch]$TestMode
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'scripts\windows\EscapeHatch-Install.ps1'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    Write-Host 'ERROR: EscapeHatch installation owner is missing.' -ForegroundColor Red
    exit 1
}
& $installer -Action Status -AppDataRoot $AppDataRoot -ShortcutRoot $ShortcutRoot -TestMode:$TestMode
exit $LASTEXITCODE
