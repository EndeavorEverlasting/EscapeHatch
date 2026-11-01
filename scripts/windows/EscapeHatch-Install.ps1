[CmdletBinding()]
param(
    [ValidateSet('Inspect', 'Install', 'Bootstrap', 'Uninstall', 'Status', 'Stop', 'ReleaseVerify', 'ReleaseInstall')]
    [string]$Action = 'Inspect',
    [string]$SourceRoot = '',
    [string]$AppDataRoot = '',
    [string]$ShortcutRoot = '',
    [switch]$SkipDependencies,
    [switch]$TestMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'EscapeHatch-Toolchain.ps1')

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
    # PS5.1 child processes can lack the module-based Get-FileHash command surface.
    # Hash through the platform API so bootstrap has no module-autoload dependency.
    $stream = [IO.File]::OpenRead($File)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}
function Require-Source([string]$Root) {
    $manager = Join-Path $Root 'scripts\windows\EscapeHatch-Runtime.ps1'
    $manifest = Join-Path $Root 'artifacts\escape-hatch\package.json'
    if (-not (Test-Path -LiteralPath $manager -PathType Leaf) -or -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
        throw 'INSTALL_SOURCE_INVALID: selected EscapeHatch source is unavailable; existing installation was preserved.'
    }
}
function Assert-NoReleaseLinks([string]$Path) {
    $cursor = Full-Path $Path
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'INSTALL_RELEASE_LINK_FORBIDDEN: package was preserved.' }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Verify-Release([string]$Root) {
    Assert-NoReleaseLinks $Root
    $manifestPath = Join-Path $Root 'windows-release.json'
    Assert-NoReleaseLinks $manifestPath
    $release = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($release.schema -cne 'escapehatch/windows-preview-package/v1' -or $release.sourceCommit -cnotmatch '^[a-f0-9]{40}$' -or $release.channel -cne 'UNSIGNED_DEVELOPER_PREVIEW') {
        throw 'INSTALL_RELEASE_INVALID: unsupported preview manifest.'
    }
    $names = @($release.files.PSObject.Properties.Name)
    $windowsNames = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in $names) {
        if (-not $windowsNames.Add($name) -or $name -match '(^|/)([^/]*[. ]|)(/|$)') { throw 'INSTALL_RELEASE_PATH_INVALID: ambiguous Windows filename.' }
    }
    foreach ($name in $names) {
        $parts = $name.Split('/')
        for ($index = 1; $index -lt $parts.Length; $index++) {
            if ($windowsNames.Contains(($parts[0..($index - 1)] -join '/'))) { throw 'INSTALL_RELEASE_PATH_INVALID: file/directory collision.' }
        }
    }
    foreach ($required in @('VERSION', 'Get-EscapeHatch.cmd', 'scripts/windows/EscapeHatch-Install.ps1', 'scripts/windows/EscapeHatch-Runtime.ps1', 'artifacts/escape-hatch/package.json')) {
        if ($names -cnotcontains $required) { throw 'INSTALL_RELEASE_INCOMPLETE: required source is missing.' }
    }
    foreach ($entry in $release.files.PSObject.Properties) {
        $name = [string]$entry.Name
        if ($name -match '(^/|\\|:|(^|/)\.\.?(/|$))' -or [string]$entry.Value -cnotmatch '^[a-f0-9]{64}$') { throw 'INSTALL_RELEASE_PATH_INVALID: package was preserved.' }
        $file = Join-Path $Root $name
        $cursor = $file
        while ($cursor -and -not (Same-Path $cursor $Root)) {
            if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'INSTALL_RELEASE_LINK_FORBIDDEN: package was preserved.' }
            $cursor = Split-Path -Parent $cursor
        }
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (File-Hash $file) -cne [string]$entry.Value) { throw 'INSTALL_RELEASE_INTEGRITY_FAILED: package was preserved.' }
    }
    Require-Source $Root
    if ((Get-EscapeHatchProperty $release 'nodeBundled') -eq $true) {
        $null = Get-EscapeHatchToolchain -SourceRoot $Root -RequireNpm
    }
    return $release
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
    $toolchain = Get-EscapeHatchToolchain -SourceRoot $Root -RequireNpm
    $artifact = Join-Path $Root 'artifacts\escape-hatch'
    $vite = Join-Path $artifact 'node_modules\vite\bin\vite.js'
    $dependencyStamp = Join-Path $artifact 'node_modules\.escapehatch-package.sha256'
    $manifestHash = File-Hash (Join-Path $artifact 'package.json')
    $savedHash = if (Test-Path -LiteralPath $dependencyStamp -PathType Leaf) { (Get-Content -LiteralPath $dependencyStamp -Raw).Trim() } else { '' }
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf) -or $savedHash -cne $manifestHash) {
        # npm 10 exports --prefix as npm_config_prefix into lifecycle children.
        # Its install command treats equal local/global prefixes as "install .",
        # even for a local install. Isolate that inherited target, not registry,
        # cache or other npm configuration, and restore the caller environment.
        $inheritedNpmPrefix = $env:npm_config_prefix
        $inheritedPath = $env:PATH
        Push-Location -LiteralPath $artifact
        try {
            Remove-Item Env:npm_config_prefix -ErrorAction SilentlyContinue
            # npm dependency lifecycle scripts must find this same Node even
            # when the destination has no system Node or npm on PATH.
            $env:PATH = $toolchain.BinDirectory + [IO.Path]::PathSeparator + $inheritedPath
            if ($toolchain.NpmCliPath) {
                & $toolchain.NodePath $toolchain.NpmCliPath install --global=false --location=project --package-lock=false --no-audit --no-fund
            } else {
                & $toolchain.NpmCommandPath install --global=false --location=project --package-lock=false --no-audit --no-fund
            }
            if ($LASTEXITCODE) { throw 'INSTALL_DEPENDENCIES_FAILED: dependency installation failed; saved career state was preserved.' }
        } finally {
            $env:npm_config_prefix = $inheritedNpmPrefix
            $env:PATH = $inheritedPath
            Pop-Location
        }
        if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) { throw 'INSTALL_DEPENDENCIES_INCOMPLETE: the Vite runtime is still missing.' }
        [IO.File]::WriteAllText($dependencyStamp, $manifestHash)
    }
}
function Update-NativeHost([string]$Root, [string]$NativeAction) {
    # Native messaging registration is separate from browser extension enrollment.
    # Synthetic installer fixtures must never register a production Chrome host.
    if ($TestMode) { Write-Host 'NATIVE_HOST=TEST_SKIPPED'; return }
    $registration = Join-Path $PSScriptRoot 'EscapeHatch-NativeHost.ps1'
    $hostScript = Join-Path $Root 'artifacts\escape-hatch\native-messaging-host.ts'
    if ($NativeAction -eq 'Register' -and -not (Test-Path -LiteralPath $hostScript -PathType Leaf)) {
        Write-Host 'NATIVE_HOST=SOURCE_UNAVAILABLE'
        return
    }
    if (-not (Test-Path -LiteralPath $registration -PathType Leaf)) {
        if ($NativeAction -eq 'Register') { throw 'INSTALL_NATIVE_HOST_REGISTRAR_MISSING' }
        return
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $registration -Action $NativeAction -SourceRoot $Root -AppDataRoot $AppDataRoot
    if ($LASTEXITCODE -ne 0) { throw 'INSTALL_NATIVE_HOST_REFUSED: existing native registration was preserved; inspect the native-host registration owner.' }
}
function Update-SubmissionSyncTask([string]$Root, [string]$TaskAction) {
    # Installer ownership only: never replace a foreign task or alter OS settings
    # during synthetic tests. Running the worker never submits employer forms.
    if ($TestMode) { Write-Host 'SUBMISSION_SYNC_TASK=TEST_SKIPPED'; return }
    $helper = Join-Path $Root 'scripts\windows\EscapeHatch-SubmissionSync.ps1'
    if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
        if ($TaskAction -eq 'Register') { throw 'INSTALL_SUBMISSION_SYNC_WORKER_MISSING: existing installation preserved.' }
        return
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $helper -Action $TaskAction -SourceRoot $Root
    if ($LASTEXITCODE -ne 0) { throw 'INSTALL_SUBMISSION_SYNC_TASK_REFUSED: task ownership or scheduling needs repair.' }
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

function Assert-OwnedShortcutsUnchanged($Item) {
    # Validate the entire candidate set before any deletion. Repeat this after
    # blocking work: provisioning and runtime Stop do not preserve file identity.
    foreach ($entry in @($Item.shortcuts)) {
        if ($entry.ownership -eq 'CREATED' -and (Test-Path -LiteralPath $entry.path)) {
            if (-not (Test-Path -LiteralPath $entry.path -PathType Leaf) -or (File-Hash $entry.path) -cne $entry.sha256) {
                throw 'INSTALL_SHORTCUT_CHANGED: shortcut changed since install; no shortcut or receipt was removed.'
            }
        }
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
    if ($Action -eq 'ReleaseVerify') {
        $release = Verify-Release $SourceRoot
        Write-Host ('WINDOWS_RELEASE_SOURCE_COMMIT=' + $release.sourceCommit)
        Write-Host 'WINDOWS_RELEASE=PACKAGE_INTEGRITY_VERIFIED; SIGNATURE=UNSIGNED_DEVELOPER_PREVIEW'
        exit 0
    }
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
        try {
            $toolchain = Get-EscapeHatchToolchain -SourceRoot $SourceRoot
            Write-Host 'NODE_VERSION_READY=True'
            Write-Host ('NODE_TOOLCHAIN=' + $toolchain.Kind)
        } catch { Write-Host 'NODE_VERSION_READY=False' }
        exit 0
    }
    $digest = [Security.Cryptography.SHA256]::Create()
    try { $identity = ([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($AppDataRoot.ToLowerInvariant())))).Replace('-', '') }
    finally { $digest.Dispose() }
    $mutex = New-Object Threading.Mutex -ArgumentList $false, ('Local\EscapeHatch.Install.' + $identity)
    try { $locked = $mutex.WaitOne([TimeSpan]::FromSeconds(20)) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'INSTALL_LOCK_TIMEOUT: another installation action is active.' }
    $receipt = Read-Receipt
    if ($Action -eq 'ReleaseInstall') {
        $release = Verify-Release $SourceRoot
        Write-Host 'SIGNATURE=UNSIGNED_DEVELOPER_PREVIEW; CONSUMER_INSTALL=UNPROVEN'
        # A download may never switch an existing installation behind its owner's back.
        if ($null -ne $receipt) {
            $SourceRoot = [string]$receipt.sourceRoot
        } else {
            $destination = Join-Path $AppDataRoot ('releases\' + $release.sourceCommit)
            Assert-NoReleaseLinks $destination
            if (Test-Path -LiteralPath $destination) {
                $existingRelease = Verify-Release $destination
                if ($existingRelease.sourceCommit -cne $release.sourceCommit -or (File-Hash (Join-Path $destination 'windows-release.json')) -cne (File-Hash (Join-Path $SourceRoot 'windows-release.json'))) {
                    throw 'INSTALL_RELEASE_DESTINATION_CONFLICT: existing release was preserved.'
                }
            }
            else {
                New-Item -ItemType Directory -Path $destination -Force | Out-Null
                foreach ($name in @($release.files.PSObject.Properties.Name) + @('windows-release.json')) {
                    $target = Join-Path $destination $name
                    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
                    [IO.File]::Copy((Join-Path $SourceRoot $name), $target, $false)
                }
                $null = Verify-Release $destination
            }
            $SourceRoot = $destination
        }
        $Action = 'Bootstrap'
    }
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
        Assert-OwnedShortcutsUnchanged $receipt
        Update-SubmissionSyncTask ([string]$receipt.sourceRoot) 'Inspect'
        Stop-SelectedRuntime ([string]$receipt.sourceRoot)
        Assert-OwnedShortcutsUnchanged $receipt
        Update-NativeHost ([string]$receipt.sourceRoot) 'Unregister'
        Update-SubmissionSyncTask ([string]$receipt.sourceRoot) 'Unregister'
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
    $selectedRelease = $null
    $selectedManifestPath = Join-Path $selected 'windows-release.json'
    if (Test-Path -LiteralPath $selectedManifestPath -PathType Leaf) { $selectedRelease = Verify-Release $selected }
    # Refuse foreign registration before changing selected-source resources.
    if (Test-Path -LiteralPath (Join-Path $selected 'artifacts\escape-hatch\native-messaging-host.ts') -PathType Leaf) {
        Update-NativeHost $selected 'Inspect'
    }
    Update-SubmissionSyncTask $selected 'Inspect'
    if ($Action -eq 'Bootstrap') {
        # Prove that startup is admissible before provisioning dependencies or
        # changing shortcuts. A foreign listener must remain a visible refusal,
        # not be masked by a package-manager failure during first Bootstrap.
        $startupStatus = (Invoke-Runtime $selected 'Status') -join "`n"
        if ($startupStatus -notmatch '(?m)^ESCAPEHATCH_STATE=(STOPPED|OWNED_HEALTHY|OWNED_ADOPTABLE|OWNED_UNHEALTHY|STALE_RECEIPT)\s*$') {
            throw 'INSTALL_RUNTIME_STATUS_UNPROVEN: canonical status did not prove a safe startup state; no dependencies or shortcuts were changed.'
        }
    }
    $previousSyncRoot = $null
    if ($null -ne $receipt -and -not (Same-Path ([string]$receipt.sourceRoot) $selected)) {
        $previousSyncRoot = [string]$receipt.sourceRoot
        # Only an explicit Install can change the selected source. Verify/stop the
        # previous source via its canonical ownership-aware lifecycle manager.
        Assert-OwnedShortcutsUnchanged $receipt
        # Provision the candidate before stopping or changing the prior selection.
        Ensure-Dependencies $selected
        Stop-SelectedRuntime ([string]$receipt.sourceRoot)
        Assert-OwnedShortcutsUnchanged $receipt
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
        if ($null -ne $selectedRelease) {
            $receipt.sourceCommit = [string]$selectedRelease.sourceCommit
            $receipt.sourceManifestSha256 = File-Hash $selectedManifestPath
            $receipt.releaseChannel = 'UNSIGNED_DEVELOPER_PREVIEW'
        }
        Save-Receipt $receipt
    } else {
        Repair-OwnedShortcuts $receipt $selected
    }
    Update-NativeHost $selected 'Register'
    Update-SubmissionSyncTask $selected 'Register'
    if ($previousSyncRoot) { Update-SubmissionSyncTask $previousSyncRoot 'Unregister' }
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
