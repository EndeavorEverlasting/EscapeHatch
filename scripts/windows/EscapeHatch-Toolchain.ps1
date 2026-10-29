# Canonical Windows toolchain selection. Dot-sourcing defines functions only.
# A declared bundle is authoritative: corrupt/missing bytes never fall back to PATH.
function Get-EscapeHatchProperty($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}
function Assert-EscapeHatchToolchainPath([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'TOOLCHAIN_LINK_FORBIDDEN: toolchain and source paths must not contain links or junctions.'
        }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Get-EscapeHatchToolchainHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}
function Get-EscapeHatchNodeVersion([string]$NodePath) {
    $output = @(& $NodePath --version 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or [string]$output[0] -cnotmatch '^v\d+\.\d+\.\d+$') {
        throw 'TOOLCHAIN_NODE_VERSION_INVALID: Node did not report a supported version.'
    }
    $version = ([string]$output[0]).Substring(1)
    if ([Version]$version -lt [Version]'22.16.0') { throw 'TOOLCHAIN_NODE_VERSION_REQUIRED: Node.js 22.16 or newer is required.' }
    return $version
}
function Get-EscapeHatchToolchain {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$SourceRoot, [switch]$RequireNpm)
    $root = [IO.Path]::GetFullPath($SourceRoot)
    Assert-EscapeHatchToolchainPath $root
    $manifestPath = Join-Path $root 'windows-release.json'
    Assert-EscapeHatchToolchainPath $manifestPath
    $release = $null
    if (Test-Path -LiteralPath $manifestPath) {
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or (Get-Item -LiteralPath $manifestPath).Length -gt 16MB) {
            throw 'TOOLCHAIN_RELEASE_INVALID: release manifest needs recovery.'
        }
        try { $release = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }
        catch { throw 'TOOLCHAIN_RELEASE_INVALID: release manifest needs recovery.' }
        $bundled = Get-EscapeHatchProperty $release 'nodeBundled'
        if ($release.schema -cne 'escapehatch/windows-preview-package/v1' -or $bundled -isnot [bool]) {
            throw 'TOOLCHAIN_RELEASE_INVALID: release manifest needs recovery.'
        }
    }
    if ($null -ne $release -and $release.nodeBundled) {
        $runtime = Get-EscapeHatchProperty $release 'nodeRuntime'
        $version = Get-EscapeHatchProperty $runtime 'version'
        if ((Get-EscapeHatchProperty $runtime 'schema') -cne 'escapehatch/bundled-node-runtime/v1' -or
            (Get-EscapeHatchProperty $runtime 'platform') -cne 'win32' -or (Get-EscapeHatchProperty $runtime 'architecture') -cne 'x64' -or
            $version -isnot [string] -or $version -cnotmatch '^\d+\.\d+\.\d+$' -or [Version]$version -lt [Version]'22.16.0' -or
            (Get-EscapeHatchProperty $runtime 'archiveSha256') -cnotmatch '^[a-f0-9]{64}$') {
            throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: declared runtime was preserved; system fallback is forbidden.'
        }
        $archiveUrl = Get-EscapeHatchProperty $runtime 'archiveUrl'
        $expectedArchive = 'node-v' + $version + '-win-x64.zip'
        if ($archiveUrl -cne ('https://nodejs.org/dist/v' + $version + '/' + $expectedArchive) -and
            $archiveUrl -cne ('https://nodejs.org/download/release/v' + $version + '/' + $expectedArchive)) {
            throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: an exact official Node archive identity is required.'
        }
        $files = Get-EscapeHatchProperty $runtime 'files'
        $releaseFiles = Get-EscapeHatchProperty $release 'files'
        if ($null -eq $files -or $null -eq $releaseFiles) { throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: runtime inventory is required.' }
        $inventory = @($files.PSObject.Properties)
        if ($inventory.Count -lt 4 -or $inventory.Count -gt 20000) { throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: runtime inventory is invalid.' }
        $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $inventory) {
            $name = [string]$entry.Name
            if ($name -cnotmatch '^vendor/node/.+' -or $name -match '(\\|:|//|(^|/)\.\.?(/|$)|(^|/)[^/]*[. ](/|$))' -or
                -not $names.Add($name) -or [string]$entry.Value -cnotmatch '^[a-f0-9]{64}$') {
                throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: runtime inventory contains an unsafe or ambiguous path.'
            }
            $sourceHash = Get-EscapeHatchProperty $releaseFiles $name
            if ($sourceHash -cne [string]$entry.Value) { throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: source and runtime digests disagree.' }
        }
        foreach ($entry in @($releaseFiles.PSObject.Properties)) {
            if ([string]$entry.Name -clike 'vendor/node/*' -and -not $names.Contains([string]$entry.Name)) {
                throw 'TOOLCHAIN_BUNDLE_METADATA_INVALID: source contains an unbound runtime file.'
            }
        }
        foreach ($required in @('vendor/node/node.exe','vendor/node/node_modules/npm/bin/npm-cli.js','vendor/node/LICENSE','vendor/node/node_modules/npm/LICENSE')) {
            if (-not $names.Contains($required)) { throw 'TOOLCHAIN_BUNDLE_INCOMPLETE: Node, npm and their license notices are required.' }
        }
        # Traverse without following directory links. Exact file inventory also
        # prevents an unlisted npm module from shadowing a verified dependency.
        $pending = New-Object 'Collections.Generic.Stack[object]'
        $pending.Push([PSCustomObject]@{ Path=(Join-Path $root 'vendor\node'); Relative='vendor/node' })
        Assert-EscapeHatchToolchainPath (Join-Path $root 'vendor\node')
        $visited = 0
        while ($pending.Count -gt 0) {
            $directory = $pending.Pop()
            if (-not (Test-Path -LiteralPath $directory.Path -PathType Container)) { throw 'TOOLCHAIN_BUNDLE_INCOMPLETE: runtime directory is unavailable.' }
            foreach ($child in @(Get-ChildItem -LiteralPath $directory.Path -Force -ErrorAction Stop)) {
                $visited++
                if ($visited -gt 30000) { throw 'TOOLCHAIN_BUNDLE_INTEGRITY_FAILED: runtime inventory exceeds its bound.' }
                if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TOOLCHAIN_LINK_FORBIDDEN: bundled paths cannot contain links.' }
                $relative = $directory.Relative + '/' + $child.Name
                if ($child.PSIsContainer) { $pending.Push([PSCustomObject]@{ Path=$child.FullName; Relative=$relative }) }
                elseif (-not $names.Contains($relative)) { throw 'TOOLCHAIN_BUNDLE_INTEGRITY_FAILED: unlisted runtime file was preserved.' }
            }
        }
        foreach ($entry in $inventory) {
            $file = Join-Path $root ([string]$entry.Name)
            if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-EscapeHatchToolchainHash $file) -cne [string]$entry.Value) {
                throw 'TOOLCHAIN_BUNDLE_INTEGRITY_FAILED: runtime bytes were preserved; system fallback is forbidden.'
            }
        }
        $nodePath = Join-Path $root 'vendor\node\node.exe'
        $actual = Get-EscapeHatchNodeVersion $nodePath
        if ($actual -cne $version) { throw 'TOOLCHAIN_BUNDLE_VERSION_MISMATCH: bundled Node version differs from its release identity.' }
        $architecture = @(& $nodePath -p process.arch 2>$null)
        if ($LASTEXITCODE -ne 0 -or $architecture.Count -ne 1 -or [string]$architecture[0] -cne 'x64') {
            throw 'TOOLCHAIN_BUNDLE_ARCHITECTURE_MISMATCH: bundled runtime is not Windows x64.'
        }
        return [PSCustomObject]@{ Kind='BUNDLED'; NodePath=$nodePath; NpmCliPath=(Join-Path $root 'vendor\node\node_modules\npm\bin\npm-cli.js'); NpmCommandPath=$null; BinDirectory=(Split-Path -Parent $nodePath); Version=$actual }
    }
    if ($null -ne (Get-EscapeHatchProperty $release 'nodeRuntime')) { throw 'TOOLCHAIN_RELEASE_INVALID: runtime metadata requires an explicit bundled declaration.' }
    # Raw source and explicitly unbundled developer previews retain existing PATH behavior.
    $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $node) { throw 'INSTALL_TOOLCHAIN_REQUIRED: install Node.js 22.16 or newer (including npm), then run setup again.' }
    $nodePath = [IO.Path]::GetFullPath($node.Source)
    Assert-EscapeHatchToolchainPath $nodePath
    $actual = Get-EscapeHatchNodeVersion $nodePath
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($RequireNpm -and $null -eq $npm) { throw 'INSTALL_TOOLCHAIN_REQUIRED: npm is required for this source checkout.' }
    if ($null -ne $npm) { Assert-EscapeHatchToolchainPath $npm.Source }
    return [PSCustomObject]@{ Kind='SYSTEM'; NodePath=$nodePath; NpmCliPath=$null; NpmCommandPath=$(if ($null -ne $npm) { $npm.Source } else { $null }); BinDirectory=(Split-Path -Parent $nodePath); Version=$actual }
}
