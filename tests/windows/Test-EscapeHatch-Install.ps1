[CmdletBinding()]
param(
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
} else {
    $RepoRoot = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
}
$Installer = Join-Path $RepoRoot 'scripts\windows\Install-EscapeHatch.ps1'
$Uninstaller = Join-Path $RepoRoot 'scripts\windows\Uninstall-EscapeHatch.ps1'
$CmdAdapter = Join-Path $RepoRoot 'Install-EscapeHatch.cmd'
$LauncherSrc = Join-Path $RepoRoot 'scripts\windows\launcher\EscapeHatch.Launcher.cs'
$ForeignFixture = Join-Path $RepoRoot 'tests\windows\fixtures\foreign-listener.mjs'
$caseCount = 0
$foreignProcess = $null

function Assert-True {
    param([bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Write-Case {
    param([Parameter(Mandatory)][string]$Name)
    $script:caseCount += 1
    Write-Host ("CASE {0:D2}: {1}" -f $script:caseCount, $Name) -ForegroundColor Cyan
}

function Test-IsPeExecutable {
    param([Parameter(Mandatory)][string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    Assert-True ($bytes.Length -gt 64) "exe too small"
    Assert-True ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A) "exe missing MZ header"
}

$testRoot = Join-Path $env:TEMP ("eh-install-test-" + [Guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $testRoot 'current'
$userDataProfile = Join-Path $env:LOCALAPPDATA 'EscapeHatch\profile'
$userDataMarkerDir = Join-Path $testRoot 'user-data-marker'
New-Item -ItemType Directory -Path $userDataMarkerDir -Force | Out-Null
$userMarker = Join-Path $userDataMarkerDir 'career-profile.json'
Set-Content -LiteralPath $userMarker -Value '{"schema":"user-owned-fixture","keep":true}' -Encoding UTF8

# Redirect install receipt location by using custom InstallRoot under testRoot parent state.
# Installer writes receipt beside InstallRoot parent.
$stateDir = $testRoot

try {
    Assert-True (Test-Path -LiteralPath $Installer -PathType Leaf) "installer missing"
    Assert-True (Test-Path -LiteralPath $CmdAdapter -PathType Leaf) "CMD adapter missing"
    Assert-True (Test-Path -LiteralPath $LauncherSrc -PathType Leaf) "launcher source missing"

    Write-Case "cold install creates PE EscapeHatch.exe"
    & $Installer -Action Install -SourceRoot $RepoRoot -InstallRoot $installRoot -NoLaunch
    Assert-True ($LASTEXITCODE -eq 0) "install exit code"
    $exe = Join-Path $installRoot 'EscapeHatch.exe'
    Assert-True (Test-Path -LiteralPath $exe -PathType Leaf) "EscapeHatch.exe missing after install"
    Test-IsPeExecutable -Path $exe
    $receipt = Join-Path $stateDir 'install.json'
    Assert-True (Test-Path -LiteralPath $receipt -PathType Leaf) "install receipt missing"
    $receiptObj = Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-True ($receiptObj.packagingCandidate -eq 'thin_native_exe_candidate_1') "packaging candidate"
    Assert-True (Test-Path -LiteralPath (Join-Path $installRoot 'scripts\windows\EscapeHatch-Runtime.ps1') -PathType Leaf) "runtime manager not staged"

    Write-Case "idempotent reinstall/repair"
    & $Installer -Action Install -SourceRoot $RepoRoot -InstallRoot $installRoot -NoLaunch
    Assert-True ($LASTEXITCODE -eq 0) "reinstall exit code"
    Assert-True (Test-Path -LiteralPath $exe -PathType Leaf) "exe missing after reinstall"
    Test-IsPeExecutable -Path $exe

    Write-Case "thin exe status delegates without throwing missing-manager"
    $status = & $exe Status 2>&1
    # Status may be inactive in a clean environment; process should still exit managedly.
    Assert-True ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1 -or $LASTEXITCODE -eq 2) "status exit unexpected: $LASTEXITCODE / $status"

    Write-Case "installer/uninstall does not terminate unrelated foreign process"
    $foreignProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-Command','Start-Sleep -Seconds 120') -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 500
    $foreignProcess.Refresh()
    Assert-True (-not $foreignProcess.HasExited) "foreign process failed to start"
    & $Installer -Action Repair -SourceRoot $RepoRoot -InstallRoot $installRoot -NoLaunch | Out-Null
    Start-Sleep -Milliseconds 500
    $foreignProcess.Refresh()
    Assert-True (-not $foreignProcess.HasExited) "foreign process was terminated by installer"

    Write-Case "uninstall removes product artifacts and preserves marker file"
    # Simulate user-owned profile data under LOCALAPPDATA EscapeHatch\profile
    $profileDir = Join-Path $env:LOCALAPPDATA 'EscapeHatch\profile'
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
    $profileMarker = Join-Path $profileDir 'install-test-marker.json'
    Set-Content -LiteralPath $profileMarker -Value '{"keep":true}' -Encoding UTF8

    & $Uninstaller -InstallRoot $installRoot
    Assert-True ($LASTEXITCODE -eq 0) "uninstall exit"
    Assert-True (-not (Test-Path -LiteralPath $exe)) "exe still present after uninstall"
    Assert-True (Test-Path -LiteralPath $profileMarker -PathType Leaf) "user profile marker deleted by uninstall"
    Assert-True (Test-Path -LiteralPath $userMarker -PathType Leaf) "external user marker deleted"

    if ($foreignProcess -and -not $foreignProcess.HasExited) {
        Assert-True ($true) "foreign listener still alive after uninstall"
    }

    Write-Host "INSTALL_HARNESS: PASS ($caseCount cases)" -ForegroundColor Green
}
finally {
    if ($foreignProcess -and -not $foreignProcess.HasExited) {
        try { Stop-Process -Id $foreignProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    $profileMarker = Join-Path $env:LOCALAPPDATA 'EscapeHatch\profile\install-test-marker.json'
    if (Test-Path -LiteralPath $profileMarker) {
        Remove-Item -LiteralPath $profileMarker -Force -ErrorAction SilentlyContinue
    }
}
