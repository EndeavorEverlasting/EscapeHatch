<#
.SYNOPSIS
  Canonical EscapeHatch install/update orchestrator.

.DESCRIPTION
  Packaging decision: Candidate 1 - thin native EscapeHatch.exe that delegates
  Start/Stop/Status/Restart to EscapeHatch-Runtime.ps1.
  Candidate 3 (CMD-only) remains a development adapter and is NOT the finished product.
  This script does not implement a second process manager and never kills listeners by name.
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Update', 'Repair')]
    [string]$Action = 'Install',
    [string]$SourceRoot,
    [string]$InstallRoot,
    [switch]$NoLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = if ($SourceRoot) {
    [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/')
} else {
    [IO.Path]::GetFullPath((Join-Path $ScriptRoot '..\..')).TrimEnd('\', '/')
}

function Get-ProductVersion {
    $versionPath = Join-Path $RepoRoot 'VERSION'
    if (Test-Path -LiteralPath $versionPath -PathType Leaf) {
        return (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8).Trim()
    }
    return '0.0.0-dev'
}

function Get-DefaultInstallRoot {
    $local = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath('LocalApplicationData') }
    if (-not $local) { throw 'Unable to resolve LOCALAPPDATA.' }
    return Join-Path $local 'EscapeHatch\install\current'
}

function Get-InstallPaths {
    param([Parameter(Mandatory)][string]$Root)
    $installRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $stateDir = Split-Path -Parent $installRoot
    if (-not $stateDir) { $stateDir = Join-Path $env:LOCALAPPDATA 'EscapeHatch\install' }
    [PSCustomObject]@{
        InstallRoot = $installRoot
        ReceiptPath = Join-Path $stateDir 'install.json'
        ExePath = Join-Path $installRoot 'EscapeHatch.exe'
        ManagerPath = Join-Path $installRoot 'scripts\windows\EscapeHatch-Runtime.ps1'
        LauncherSource = Join-Path $RepoRoot 'scripts\windows\launcher\EscapeHatch.Launcher.cs'
    }
}

function Find-Csc {
    $cmd = Get-Command csc.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        Join-Path ${env:WINDIR} 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
        Join-Path ${env:WINDIR} 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }
    return $null
}

function Build-EscapeHatchExe {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$OutputPath
    )
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        throw "Launcher source missing: $SourcePath"
    }
    $csc = Find-Csc
    if (-not $csc) {
        throw 'csc.exe not found. Install .NET Framework developer pack or ensure csc.exe is on PATH.'
    }
    $outDir = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    $args = @(
        '/nologo',
        '/target:exe',
        '/optimize+',
        "/out:$OutputPath",
        $SourcePath
    )
    $null = & $csc @args
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
        throw "Failed to compile EscapeHatch.exe with $csc"
    }
}

function Copy-InstallPayload {
    param(
        [Parameter(Mandatory)]$Paths,
        [Parameter(Mandatory)][string]$Version
    )
    $stage = Join-Path $env:TEMP ("EscapeHatch-install-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    try {
        $copyDirs = @(
            'scripts\windows',
            'browser\application-assist',
            'contracts'
        )
        $skipName = @{
            'Install-EscapeHatch.ps1' = $true
            'Uninstall-EscapeHatch.ps1' = $true
        }
        foreach ($rel in $copyDirs) {
            $src = Join-Path $RepoRoot $rel
            if (-not (Test-Path -LiteralPath $src)) { continue }
            $dest = Join-Path $stage $rel
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            Get-ChildItem -LiteralPath $src -Force | ForEach-Object {
                if ($skipName.ContainsKey($_.Name)) { return }
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $_.Name) -Recurse -Force
            }
        }
        foreach ($rel in @('Launch-EscapeHatch.cmd', 'Launch-EscapeHatch.ps1', 'Close-EscapeHatch.cmd', 'Close-EscapeHatch.ps1', 'Status-EscapeHatch.cmd', 'Status-EscapeHatch.ps1', 'VERSION')) {
            $src = Join-Path $RepoRoot $rel
            if (Test-Path -LiteralPath $src -PathType Leaf) {
                Copy-Item -LiteralPath $src -Destination (Join-Path $stage $rel) -Force
            }
        }
        # Do not stage Install/Uninstall scripts as the running product payload.
        $exeStage = Join-Path $stage 'EscapeHatch.exe'
        Build-EscapeHatchExe -SourcePath $Paths.LauncherSource -OutputPath $exeStage

        if (Test-Path -LiteralPath $Paths.InstallRoot) {
            # Preserve a recoverable previous tree for upgrade rollback.
            $backup = Join-Path (Split-Path -Parent $Paths.InstallRoot) ("previous-" + (Get-Date -Format 'yyyyMMddHHmmss'))
            if (Test-Path -LiteralPath $Paths.InstallRoot) {
                Move-Item -LiteralPath $Paths.InstallRoot -Destination $backup -Force
            }
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $Paths.InstallRoot) -Force | Out-Null
        Move-Item -LiteralPath $stage -Destination $Paths.InstallRoot -Force
        $stage = $null
    }
    finally {
        if ($stage -and (Test-Path -LiteralPath $stage)) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Write-InstallReceipt {
    param(
        [Parameter(Mandatory)]$Paths,
        [Parameter(Mandatory)][string]$Version
    )
    $receipt = [ordered]@{
        schema = 'escapehatch/windows-install-receipt/v1'
        productVersion = $Version
        installRoot = $Paths.InstallRoot
        executablePath = $Paths.ExePath
        lifecycleManagerPath = $Paths.ManagerPath
        sourceRoot = $RepoRoot
        packagingCandidate = 'thin_native_exe_candidate_1'
        installedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        action = $Action
    }
    $dir = Split-Path -Parent $Paths.ReceiptPath
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $temp = Join-Path $dir ("install.{0}.tmp" -f ([Guid]::NewGuid().ToString('N')))
    $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
    try {
        [IO.File]::WriteAllText($temp, (($receipt | ConvertTo-Json -Depth 5) + [Environment]::NewLine), $encoding)
        if ([IO.File]::Exists($Paths.ReceiptPath)) {
            Remove-Item -LiteralPath $Paths.ReceiptPath -Force
        }
        [IO.File]::Move($temp, $Paths.ReceiptPath)
    }
    finally {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        }
    }
}

function Register-StartMenuShortcut {
    param([Parameter(Mandatory)]$Paths)
    $programs = [Environment]::GetFolderPath('Programs')
    if (-not $programs) { return }
    $shortcutPath = Join-Path $programs 'EscapeHatch.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $Paths.ExePath
    $shortcut.WorkingDirectory = $Paths.InstallRoot
    $shortcut.Description = 'EscapeHatch'
    $shortcut.Save()
}

function Assert-InstallSource {
    $manager = Join-Path $RepoRoot 'scripts\windows\EscapeHatch-Runtime.ps1'
    $launcher = Join-Path $RepoRoot 'scripts\windows\launcher\EscapeHatch.Launcher.cs'
    if (-not (Test-Path -LiteralPath $manager -PathType Leaf)) {
        throw "Install source invalid: lifecycle manager missing at $manager"
    }
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
        throw "Install source invalid: launcher source missing at $launcher"
    }
}

Assert-InstallSource
$version = Get-ProductVersion
$root = if ($InstallRoot) { $InstallRoot } else { Get-DefaultInstallRoot }
$paths = Get-InstallPaths -Root $root

Write-Host "EscapeHatch installer ($Action)"
Write-Host "  source : $RepoRoot"
Write-Host "  target : $($paths.InstallRoot)"
Write-Host "  version: $version"

if ((Test-Path -LiteralPath $paths.ExePath -PathType Leaf) -and (Test-Path -LiteralPath $paths.ReceiptPath -PathType Leaf)) {
    try {
        $existing = Get-Content -LiteralPath $paths.ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing.productVersion -eq $version -and $Action -eq 'Install') {
            Write-Host "Existing install matches version $version - verifying/repairing."
            $Action = 'Repair'
        }
    } catch {
        Write-Host "Existing receipt unreadable - performing repair install."
    }
}

Copy-InstallPayload -Paths $paths -Version $version
if (-not (Test-Path -LiteralPath $paths.ExePath -PathType Leaf)) {
    throw "Install failed: EscapeHatch.exe missing at $($paths.ExePath)"
}
if (-not (Test-Path -LiteralPath $paths.ManagerPath -PathType Leaf)) {
    throw "Install failed: lifecycle manager missing under install root."
}
Write-InstallReceipt -Paths $paths -Version $version
Register-StartMenuShortcut -Paths $paths

Write-Host "Installed EscapeHatch.exe at $($paths.ExePath)"
Write-Host "Receipt: $($paths.ReceiptPath)"

if (-not $NoLaunch) {
    Write-Host "Delegating launch to canonical Runtime Manager..."
    & $paths.ExePath Start
    exit $LASTEXITCODE
}

exit 0
