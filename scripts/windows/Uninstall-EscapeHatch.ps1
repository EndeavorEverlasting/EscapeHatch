<#
.SYNOPSIS
  Removes EscapeHatch install artifacts without deleting user-owned profile/application data.
#>
[CmdletBinding()]
param(
    [string]$InstallRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath('LocalApplicationData') }
$stateDir = Join-Path $local 'EscapeHatch\install'
$receiptPath = Join-Path $stateDir 'install.json'
$defaultRoot = Join-Path $stateDir 'current'

$target = $InstallRoot
if (-not $target -and (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
    try {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $target = [string]$receipt.installRoot
    } catch {
        $target = $null
    }
}
if (-not $target) { $target = $defaultRoot }

# Prefer a graceful stop through the installed thin exe / lifecycle manager when present.
$exe = Join-Path $target 'EscapeHatch.exe'
if (Test-Path -LiteralPath $exe -PathType Leaf) {
    try {
        & $exe Stop | Out-Null
    } catch {
        Write-Host "WARNING: stop via EscapeHatch.exe failed; continuing uninstall without kill-by-name."
    }
}

if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed install root: $target"
}

Get-ChildItem -LiteralPath $stateDir -Filter 'previous-*' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
    Remove-Item -LiteralPath $receiptPath -Force
    Write-Host "Removed install receipt: $receiptPath"
}

$programs = [Environment]::GetFolderPath('Programs')
if ($programs) {
    $shortcut = Join-Path $programs 'EscapeHatch.lnk'
    if (Test-Path -LiteralPath $shortcut -PathType Leaf) {
        Remove-Item -LiteralPath $shortcut -Force
        Write-Host "Removed Start Menu shortcut."
    }
}

# Explicitly preserve user-owned data roots (career/profile/application/runtime receipts).
$preserved = @(
    (Join-Path $local 'EscapeHatch\runtime'),
    (Join-Path $local 'EscapeHatch\logs'),
    (Join-Path $local 'EscapeHatch\profile'),
    (Join-Path $local 'EscapeHatch\application')
)
foreach ($path in $preserved) {
    if (Test-Path -LiteralPath $path) {
        Write-Host "Preserved user data path: $path"
    }
}

Write-Host "Uninstall complete."
exit 0
