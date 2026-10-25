[CmdletBinding()]
param(
    [ValidateSet('Inspect', 'Install', 'Bootstrap', 'Uninstall', 'Status', 'Stop')]
    [string]$Action = 'Inspect',
    [string]$SourceRoot = '',
    [string]$AppDataRoot = '',
    [string]$ShortcutRoot = '',
    [switch]$SkipDependencies,
    [switch]$TestMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Full-Path([string]$Value) {
    $full = [IO.Path]::GetFullPath($Value)
    $root = [IO.Path]::GetPathRoot($full)
    $trimmed = $full.TrimEnd('\', '/')
    if ($trimmed.Length -le $root.TrimEnd('\', '/').Length) { return $root }
    return $trimmed
}
function Same-Path([string]$Left, [string]$Right) {
    return [string]::Equals((Full-Path $Left), (Full-Path $Right), [StringComparison]::OrdinalIgnoreCase)
}
function File-Hash([string]$File) {
    return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Require-Source([string]$Root) {
    $manager = Join-Path $Root 'scripts\windows\EscapeHatch-Runtime.ps1'
    $manifest = Join-Path $Root 'artifacts\escape-hatch\package.json'
    if (-not (Test-Path -LiteralPath $manager -PathType Leaf) -or -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
        throw 'INSTALL_SOURCE_INVALID: selected EscapeHatch source is unavailable; existing installation was preserved.'
    }
}
function Read-Receipt {
    if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { return $null }
    try {
        $item = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($item.schema -cne 'escapehatch-installation/v1' -or -not $item.sourceRoot -or -not $item.PSObject.Properties['shortcuts']) { throw 'invalid' }
        foreach ($entry in @($item.shortcuts)) {
            if (-not (Same-Path ([string]$entry.path) $shortcutPath) -or $entry.ownership -notin @('CREATED', 'ADOPTED') -or [string]$entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'invalid' }
        }
        return $item
    } catch {
        throw 'INSTALL_RECEIPT_INVALID: repair the installation receipt before proceeding; no owned resources were removed.'
    }
}
function Save-Receipt($Item) {
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    $temp = Join-Path $installRoot ('install.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $encoding = New-Object Text.UTF8Encoding -ArgumentList $false
        [IO.File]::WriteAllText($temp, ($Item | ConvertTo-Json -Depth 6), $encoding)
        if (Test-Path -LiteralPath $receiptPath) { [IO.File]::Replace($temp, $receiptPath, [NullString]::Value) }
        else { [IO.File]::Move($temp, $receiptPath) }
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
}
function Invoke-Runtime([string]$Root, [string]$RuntimeAction) {
    $manager = Join-Path $Root 'scripts\windows\EscapeHatch-Runtime.ps1'
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action $RuntimeAction 2>&1)
    $code = $LASTEXITCODE
    if ($code -ne 0) { throw "INSTALL_RUNTIME_$($RuntimeAction.ToUpperInvariant())_FAILED: canonical manager refused an unavailable or unproven runtime; resources were preserved. Run Status-EscapeHatch.cmd for diagnostics." }
    return $output
}
function Stop-SelectedRuntime([string]$Root) {
    Require-Source $Root
    $status = (Invoke-Runtime $Root 'Status') -join "`n"
    if ($status -match '(?m)^ESCAPEHATCH_STATE=STOPPED\s*$') { return }
    if ($status -notmatch '(?m)^ESCAPEHATCH_STATE=(OWNED_HEALTHY|OWNED_ADOPTABLE|OWNED_UNHEALTHY|STALE_RECEIPT)\s*$') {
        throw 'INSTALL_RUNTIME_UNPROVEN: no process was stopped; installation was preserved.'
    }
    Invoke-Runtime $Root 'Stop' | Out-Host
    $after = (Invoke-Runtime $Root 'Status') -join "`n"
    if ($after -notmatch '(?m)^ESCAPEHATCH_STATE=STOPPED\s*$') { throw 'INSTALL_RUNTIME_STOP_UNPROVEN: installation was preserved.' }
}
function Ensure-Dependencies([string]$Root) {
    if ($SkipDependencies) { return }
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $node -or -not $npm) { throw 'INSTALL_TOOLCHAIN_REQUIRED: install Node.js 22.16 or newer (including npm), then run Install-EscapeHatch.cmd again.' }
    if (-not (Test-NodeVersion $node.Source)) { throw 'INSTALL_NODE_VERSION_REQUIRED: Node.js 22.16 or newer is required.' }
    $artifact = Join-Path $Root 'artifacts\escape-hatch'
    $vite = Join-Path $artifact 'node_modules\vite\bin\vite.js'
    $dependencyStamp = Join-Path $artifact 'node_modules\.escapehatch-package.sha256'
    $manifestHash = File-Hash (Join-Path $artifact 'package.json')
    $savedHash = if (Test-Path -LiteralPath $dependencyStamp -PathType Leaf) { (Get-Content -LiteralPath $dependencyStamp -Raw).Trim() } else { '' }
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf) -or $savedHash -cne $manifestHash) {
        & $npm.Source --prefix $artifact install --package-lock=false --no-audit --no-fund
        if ($LASTEXITCODE) { throw 'INSTALL_DEPENDENCIES_FAILED: dependency installation failed; saved career state was preserved.' }
        if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) { throw 'INSTALL_DEPENDENCIES_INCOMPLETE: the Vite runtime is still missing.' }
        [IO.File]::WriteAllText($dependencyStamp, $manifestHash)
    }
}
function Test-NodeVersion([string]$Executable) {
    # Quote-free JavaScript survives Windows PowerShell 5.1 native argv binding.
    & $Executable -e 'const v=process.versions.node.match(/\d+/g);if(+v[0]<22||(+v[0]===22&&+v[1]<16))process.exit(1)'
    return ($LASTEXITCODE -eq 0)
}
function Make-Shortcut([string]$Root) {
    $parent = Split-Path -Parent $shortcutPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $temporary = Join-Path $parent ('EscapeHatch.' + [Guid]::NewGuid().ToString('N') + '.lnk')
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($temporary)
        $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $link.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'Launch-EscapeHatch.ps1') + '"'
        $link.WorkingDirectory = $Root
        $link.Description = 'Open your private EscapeHatch application workspace'
        $link.Save()
        # Publish without overwrite: an externally created path wins the race.
        [IO.File]::Move($temporary, $shortcutPath)
    } finally {
        if ($null -ne $shell) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
        if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Repair-OwnedShortcuts($Item, [string]$Root) {
    $changed = $false
    foreach ($entry in @($Item.shortcuts)) {
        if ($entry.ownership -ne 'CREATED') { continue }
        if (Test-Path -LiteralPath $entry.path) {
            if (-not (Test-Path -LiteralPath $entry.path -PathType Leaf)) { throw 'INSTALL_SHORTCUT_INVALID: existing shortcut path is not a file.' }
            if ((File-Hash $entry.path) -cne $entry.sha256) { Write-Host 'INSTALL_SHORTCUT=MODIFIED_PRESERVED' }
            continue
        }
        Make-Shortcut $Root
        $entry.sha256 = File-Hash $entry.path
        $changed = $true
    }
    if ($changed) { Save-Receipt $Item; Write-Host 'INSTALL_SHORTCUT=REPAIRED' }
}

$exitCode = 0
$mutex = $null
$locked = $false
try {
    if (-not $SourceRoot) { $SourceRoot = Join-Path $PSScriptRoot '..\..' }
    $SourceRoot = Full-Path $SourceRoot
    if (-not $AppDataRoot) {
        if (-not $env:LOCALAPPDATA) { throw 'INSTALL_APPDATA_REQUIRED: LOCALAPPDATA is unavailable.' }
        $AppDataRoot = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
    }
    $AppDataRoot = Full-Path $AppDataRoot
    if (-not $ShortcutRoot) { $ShortcutRoot = Join-Path ([Environment]::GetFolderPath('Programs')) 'EscapeHatch' }
    $ShortcutRoot = Full-Path $ShortcutRoot
    if ($SkipDependencies -and -not $TestMode) { throw 'INSTALL_TEST_OPTION_FORBIDDEN: SkipDependencies requires explicit TestMode.' }
    if ($TestMode -and ((Same-Path $AppDataRoot (Join-Path $env:LOCALAPPDATA 'EscapeHatch')) -or (Same-Path $ShortcutRoot (Join-Path ([Environment]::GetFolderPath('Programs')) 'EscapeHatch')))) {
        throw 'INSTALL_TEST_ROOT_REQUIRED: TestMode requires isolated app-data and shortcut roots.'
    }
    $installRoot = Join-Path $AppDataRoot 'installation'
    $receiptPath = Join-Path $installRoot 'install.v1.json'
    $shortcutPath = Join-Path $ShortcutRoot 'EscapeHatch.lnk'
    # Inspect is read-only: no directories, files, shortcuts or runtime actions.
    if ($Action -eq 'Inspect') {
        $receipt = Read-Receipt
        Write-Host ('ESCAPEHATCH_INSTALLATION=' + $(if ($null -eq $receipt) { 'NOT_INSTALLED' } else { 'INSTALLED' }))
        Write-Host ('SELECTED_SOURCE_AVAILABLE=' + [bool]($receipt -and (Test-Path -LiteralPath ([string]$receipt.sourceRoot) -PathType Container)))
        $nodeProbe = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        Write-Host ('NODE_VERSION_READY=' + [bool]($nodeProbe -and (Test-NodeVersion $nodeProbe.Source)))
        exit 0
    }
    $digest = [Security.Cryptography.SHA256]::Create()
    try { $identity = ([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($AppDataRoot.ToLowerInvariant())))).Replace('-', '') }
    finally { $digest.Dispose() }
    $mutex = New-Object Threading.Mutex -ArgumentList $false, ('Local\EscapeHatch.Install.' + $identity)
    try { $locked = $mutex.WaitOne([TimeSpan]::FromSeconds(20)) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'INSTALL_LOCK_TIMEOUT: another installation action is active.' }
    $receipt = Read-Receipt
    if ($Action -in @('Status', 'Stop')) {
        # Sibling adapters follow the same installation selection as Bootstrap.
        # These operations never install dependencies or repair shortcuts.
        $selected = if ($null -ne $receipt) { [string]$receipt.sourceRoot } else { $SourceRoot }
        Require-Source $selected
        $manager = Join-Path $selected 'scripts\windows\EscapeHatch-Runtime.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action $Action
        exit $LASTEXITCODE
    }
    if ($Action -eq 'Uninstall') {
        if ($null -eq $receipt) { Write-Host 'ESCAPEHATCH_INSTALLATION=NOT_INSTALLED'; exit 0 }
        # Validate every deletion candidate before touching either runtime or shortcut.
        foreach ($entry in @($receipt.shortcuts)) {
            if ($entry.ownership -eq 'CREATED' -and (Test-Path -LiteralPath $entry.path)) {
                if (-not (Test-Path -LiteralPath $entry.path -PathType Leaf) -or (File-Hash $entry.path) -cne $entry.sha256) {
                    throw 'INSTALL_SHORTCUT_CHANGED: shortcut changed since install; no shortcut or receipt was removed.'
                }
            }
        }
        Stop-SelectedRuntime ([string]$receipt.sourceRoot)
        foreach ($entry in @($receipt.shortcuts)) {
            if ($entry.ownership -eq 'CREATED' -and (Test-Path -LiteralPath $entry.path -PathType Leaf)) { Remove-Item -LiteralPath $entry.path -Force }
        }
        Remove-Item -LiteralPath $receiptPath -Force
        Write-Host 'ESCAPEHATCH_INSTALLATION=REMOVED'
        Write-Host 'USER_DATA=PRESERVED; AUTH=PRESERVED; SOURCE=PRESERVED; DEPENDENCIES=PRESERVED'
        exit 0
    }
    $selected = if ($null -ne $receipt -and $Action -eq 'Bootstrap') { [string]$receipt.sourceRoot } else { $SourceRoot }
    Require-Source $selected
    if ($null -ne $receipt -and -not (Same-Path ([string]$receipt.sourceRoot) $selected)) {
        # Only an explicit Install can change the selected source. Verify/stop the
        # previous source via its canonical ownership-aware lifecycle manager.
        foreach ($entry in @($receipt.shortcuts)) {
            if ($entry.ownership -eq 'CREATED' -and (Test-Path -LiteralPath $entry.path)) {
                if (-not (Test-Path -LiteralPath $entry.path -PathType Leaf) -or (File-Hash $entry.path) -cne $entry.sha256) { throw 'INSTALL_SHORTCUT_CHANGED: explicit source replacement preserved modified shortcut.' }
            }
        }
        # Provision the candidate before stopping or changing the prior selection.
        Ensure-Dependencies $selected
        Stop-SelectedRuntime ([string]$receipt.sourceRoot)
        foreach ($entry in @($receipt.shortcuts)) {
            if ($entry.ownership -eq 'CREATED' -and (Test-Path -LiteralPath $entry.path -PathType Leaf)) { Remove-Item -LiteralPath $entry.path -Force }
        }
        $receipt = $null
    } else {
        Ensure-Dependencies $selected
    }
    if ($null -eq $receipt) {
        $owned = 'ADOPTED'
        if (-not (Test-Path -LiteralPath $shortcutPath)) { Make-Shortcut $selected; $owned = 'CREATED' }
        if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'INSTALL_SHORTCUT_INVALID: existing shortcut path is not a file.' }
        $receipt = [ordered]@{ schema = 'escapehatch-installation/v1'; sourceRoot = $selected; installedAtUtc = [DateTime]::UtcNow.ToString('o'); shortcuts = @([ordered]@{ path = $shortcutPath; sha256 = File-Hash $shortcutPath; ownership = $owned }) }
        Save-Receipt $receipt
    } else {
        Repair-OwnedShortcuts $receipt $selected
    }
    Write-Host 'ESCAPEHATCH_INSTALLATION=INSTALLED'
    if ($Action -eq 'Bootstrap') {
        # Stream Start directly. Capturing a long-lived descendant's inherited
        # handles through @(& powershell ...) can hold the launcher open on PS5.1.
        $manager = Join-Path $selected 'scripts\windows\EscapeHatch-Runtime.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action Start
        if ($LASTEXITCODE -ne 0) { throw 'INSTALL_RUNTIME_START_FAILED: inspect the canonical runtime status before retrying.' }
    }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    $exitCode = 1
} finally {
    if ($locked) { try { $mutex.ReleaseMutex() } catch {} }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
exit $exitCode
