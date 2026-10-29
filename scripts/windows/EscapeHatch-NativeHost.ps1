[CmdletBinding()]
param(
    [ValidateSet('Inspect', 'Register', 'Unregister')][string]$Action = 'Inspect',
    [string]$SourceRoot = '',
    [string]$AppDataRoot = '',
    [string]$RegistryPath = '',
    [switch]$TestMode
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'EscapeHatch-Toolchain.ps1')
$HostName = 'com.escapehatch.profile'
$ProductionKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.escapehatch.profile'
$mutex = $null
$locked = $false

function Hash-Bytes([byte[]]$Bytes) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}
function Hash-File([string]$Path) { return Hash-Bytes ([IO.File]::ReadAllBytes($Path)) }
function Assert-NoLinks([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'NATIVE_HOST_LINK_FORBIDDEN' }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Write-Atomic([string]$Path, [byte[]]$Bytes, [switch]$ReplaceOwned) {
    $temp = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllBytes($temp, $Bytes)
        if ($ReplaceOwned -and [IO.File]::Exists($Path)) { [IO.File]::Replace($temp, $Path, [NullString]::Value) }
        else { [IO.File]::Move($temp, $Path) }
    } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
}
function Read-Registration {
    if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { return $null }
    try {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($receipt.schema -cne 'escapehatch/native-host-registration/v1' -or $receipt.registryPath -ine $RegistryPath -or
            $receipt.hostName -cne $HostName -or $receipt.activePackage -cnotmatch '^[a-f0-9]{64}$' -or
            @($receipt.packages).Count -lt 1 -or @($receipt.packages).Count -gt 100) { throw 'invalid' }
        $seen = @{}
        foreach ($package in @($receipt.packages)) {
            if ($package.id -cnotmatch '^[a-f0-9]{64}$' -or $seen.ContainsKey($package.id) -or
                $package.manifestSha256 -cnotmatch '^[a-f0-9]{64}$' -or $package.launcherSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'invalid' }
            $seen[$package.id] = $true
        }
        if (-not $seen.ContainsKey($receipt.activePackage)) { throw 'invalid' }
        return $receipt
    } catch { throw 'NATIVE_HOST_RECEIPT_INVALID: registration was preserved.' }
}
function Assert-OwnedFiles($Receipt) {
    if ($null -eq $Receipt) { return }
    foreach ($package in @($Receipt.packages)) {
        $directory = Join-Path $nativeRoot $package.id
        foreach ($entry in @(@{name='host.json'; digest=$package.manifestSha256}, @{name='host.cmd'; digest=$package.launcherSha256})) {
            $file = Join-Path $directory $entry.name
            Assert-NoLinks $file
            if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Hash-File $file) -cne $entry.digest) { throw 'NATIVE_HOST_FILES_CHANGED: registration was preserved.' }
        }
    }
}
function Assert-OwnedRegistry($Receipt) {
    if (-not (Test-Path -LiteralPath $RegistryPath)) { return }
    $key = Get-Item -LiteralPath $RegistryPath
    try {
        $names = @($key.GetValueNames())
        if ($null -eq $Receipt -or $key.SubKeyCount -ne 0 -or $names.Count -ne 1 -or $names[0] -cne '') { throw 'NATIVE_HOST_REGISTRY_FOREIGN: key was preserved.' }
        $current = [string]$key.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $owned = @($Receipt.packages | ForEach-Object { Join-Path (Join-Path $nativeRoot $_.id) 'host.json' })
        if ($key.GetValueKind('') -ne [Microsoft.Win32.RegistryValueKind]::String -or $owned -inotcontains $current) { throw 'NATIVE_HOST_REGISTRY_FOREIGN: value was preserved.' }
    } finally { $key.Close() }
}

try {
    if (-not $SourceRoot) { $SourceRoot = Join-Path $PSScriptRoot '..\..' }
    $SourceRoot = [IO.Path]::GetFullPath($SourceRoot)
    if (-not $AppDataRoot) { $AppDataRoot = Join-Path $env:LOCALAPPDATA 'EscapeHatch' }
    $AppDataRoot = [IO.Path]::GetFullPath($AppDataRoot)
    if ($TestMode) {
        if ($RegistryPath -notmatch '^HKCU:\\Software\\EscapeHatch\\NativeHostTests\\[a-f0-9]{32}$' -or
            $AppDataRoot -ieq [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'EscapeHatch'))) { throw 'NATIVE_HOST_TEST_ROOT_REQUIRED' }
    } elseif ($RegistryPath -and $RegistryPath -ine $ProductionKey) { throw 'NATIVE_HOST_REGISTRY_PATH_FORBIDDEN' }
    else { $RegistryPath = $ProductionKey }
    $nativeRoot = Join-Path $AppDataRoot 'native-messaging'
    $receiptPath = Join-Path $nativeRoot 'registration.v1.json'
    Assert-NoLinks $nativeRoot
    Assert-NoLinks $receiptPath
    $lockId = Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($RegistryPath.ToLowerInvariant()))
    $mutex = New-Object Threading.Mutex -ArgumentList $false, ('Local\EscapeHatch.NativeHost.' + $lockId)
    try { $locked = $mutex.WaitOne([TimeSpan]::FromSeconds(15)) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'NATIVE_HOST_LOCK_TIMEOUT' }
    $receipt = Read-Registration
    Assert-OwnedFiles $receipt
    Assert-OwnedRegistry $receipt
    if ($Action -eq 'Inspect') {
        Write-Host ('NATIVE_HOST=' + $(if ($null -ne $receipt -and (Test-Path -LiteralPath $RegistryPath)) { 'REGISTERED' } else { 'NOT_REGISTERED' }))
        exit 0
    }
    if ($Action -eq 'Unregister') {
        if ($null -eq $receipt) { Write-Host 'NATIVE_HOST=NOT_REGISTERED'; exit 0 }
        # Recheck all owned resources before removing any; unrelated values win.
        Assert-OwnedFiles $receipt
        Assert-OwnedRegistry $receipt
        if (Test-Path -LiteralPath $RegistryPath) { Remove-Item -LiteralPath $RegistryPath -Force }
        foreach ($package in @($receipt.packages)) {
            $directory = Join-Path $nativeRoot $package.id
            [IO.File]::Delete((Join-Path $directory 'host.json'))
            [IO.File]::Delete((Join-Path $directory 'host.cmd'))
            # Leave any additional foreign files and their directory intact.
            if (@(Get-ChildItem -LiteralPath $directory -Force).Count -eq 0) { [IO.Directory]::Delete($directory) }
        }
        [IO.File]::Delete($receiptPath)
        Write-Host 'NATIVE_HOST=UNREGISTERED; PRIVATE_WORKSPACE=PRESERVED'
        exit 0
    }
    $hostScript = Join-Path $SourceRoot 'artifacts\escape-hatch\native-messaging-host.ts'
    if (-not (Test-Path -LiteralPath $hostScript -PathType Leaf)) { throw 'NATIVE_HOST_SOURCE_MISSING' }
    $extension = Get-Content -LiteralPath (Join-Path $SourceRoot 'browser\application-assist\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $extension.PSObject.Properties['key']) { throw 'NATIVE_HOST_EXTENSION_KEY_REQUIRED' }
    $publicKey = [Convert]::FromBase64String([string]$extension.key)
    if ($publicKey.Length -lt 32) { throw 'NATIVE_HOST_EXTENSION_KEY_INVALID' }
    $keyHash = Hash-Bytes $publicKey
    $extensionId = -join ($keyHash.Substring(0, 32).ToCharArray() | ForEach-Object { [char](97 + [Convert]::ToInt32([string]$_, 16)) })
    $nodePath = (Get-EscapeHatchToolchain -SourceRoot $SourceRoot).NodePath
    foreach ($path in @($nodePath, $hostScript, $AppDataRoot)) { if ($path -match '[\r\n"]') { throw 'NATIVE_HOST_LAUNCH_PATH_INVALID' } }
    $launcher = '@echo off' + "`r`n" + 'setlocal DisableDelayedExpansion' + "`r`n" + 'chcp 65001 >nul' + "`r`n" +
        'set "ESCAPEHATCH_DATA_HOME=' + $AppDataRoot.Replace('%','%%') + '"' + "`r`n" +
        '"' + $nodePath.Replace('%','%%') + '" --experimental-strip-types "' + $hostScript.Replace('%','%%') + '" %*' + "`r`n"
    $encoding = New-Object Text.UTF8Encoding -ArgumentList $false
    $launcherBytes = $encoding.GetBytes($launcher)
    $packageId = Hash-Bytes $launcherBytes
    $packageDir = Join-Path $nativeRoot $packageId
    $manifestPath = Join-Path $packageDir 'host.json'
    $manifest = [ordered]@{ name=$HostName; description='EscapeHatch private profile bridge'; path=(Join-Path $packageDir 'host.cmd'); type='stdio'; allowed_origins=@('chrome-extension://' + $extensionId + '/') }
    $manifestBytes = $encoding.GetBytes(($manifest | ConvertTo-Json -Depth 4) + "`n")
    $package = [pscustomobject]@{ id=$packageId; manifestSha256=(Hash-Bytes $manifestBytes); launcherSha256=(Hash-Bytes $launcherBytes) }
    Assert-NoLinks $packageDir
    if (Test-Path -LiteralPath $packageDir) {
        if ($null -eq $receipt -or @($receipt.packages.id) -cnotcontains $packageId) { throw 'NATIVE_HOST_DESTINATION_FOREIGN' }
        $owned = @($receipt.packages | Where-Object id -CEQ $packageId)[0]
        if ($owned.manifestSha256 -cne $package.manifestSha256) { throw 'NATIVE_HOST_EXTENSION_ID_CHANGED: previous registration was preserved.' }
    } else {
        New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
        Write-Atomic (Join-Path $packageDir 'host.cmd') $launcherBytes
        Write-Atomic $manifestPath $manifestBytes
    }
    $packages = @()
    if ($null -ne $receipt) { $packages = @($receipt.packages | Where-Object id -CNE $packageId) }
    $packages += $package
    $updated = [ordered]@{ schema='escapehatch/native-host-registration/v1'; hostName=$HostName; registryPath=$RegistryPath; activePackage=$packageId; packages=@($packages) }
    Assert-OwnedFiles $receipt
    Assert-OwnedRegistry $receipt
    Write-Atomic $receiptPath ($encoding.GetBytes(($updated | ConvertTo-Json -Depth 6) + "`n")) -ReplaceOwned:($null -ne $receipt)
    New-Item -Path $RegistryPath -Force | Out-Null
    Set-Item -LiteralPath $RegistryPath -Value $manifestPath
    Write-Host 'NATIVE_HOST=REGISTERED'
    Write-Host ('EXTENSION_ID=' + $extensionId)
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($locked) { try { $mutex.ReleaseMutex() } catch {} }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
