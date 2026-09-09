[CmdletBinding()]
param(
    [string]$RepositoryUrl = 'https://github.com/EndeavorEverlasting/EscapeHatch.git',
    [string]$Branch = '',
    [string]$ExpectedCommit = '',
    [string]$DevRoot = '',
    [switch]$ResolveOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Normalize-LocalPath {
    param([Parameter(Mandatory)][string]$Path)
    return [IO.Path]::GetFullPath($Path).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
}

function Find-DesktopDevAncestor {
    param([Parameter(Mandatory)][string]$Path)
    $cursor = Get-Item -LiteralPath $Path
    if (-not $cursor.PSIsContainer) {
        $cursor = $cursor.Directory
    }

    while ($null -ne $cursor) {
        if ($cursor.Name -ieq 'Dev' -and $cursor.Parent -and $cursor.Parent.Name -ieq 'Desktop') {
            return (Normalize-LocalPath $cursor.FullName)
        }
        $cursor = $cursor.Parent
    }
    return $null
}

function Resolve-DurableDevRoot {
    if ($DevRoot) {
        $candidate = $DevRoot
    } else {
        $fromCurrent = Find-DesktopDevAncestor -Path (Get-Location).ProviderPath
        if ($fromCurrent) {
            return $fromCurrent
        }

        $preferred = Join-Path $HOME 'Desktop\Dev'
        if (Test-Path -LiteralPath $preferred -PathType Container) {
            return (Normalize-LocalPath $preferred)
        }

        $profileCandidate = if ($env:USERPROFILE) {
            Join-Path $env:USERPROFILE 'Desktop\Dev'
        } else {
            $null
        }
        if ($profileCandidate -and (Test-Path -LiteralPath $profileCandidate -PathType Container)) {
            return (Normalize-LocalPath $profileCandidate)
        }

        $knownDesktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
        if ($knownDesktop) {
            $knownCandidate = Join-Path $knownDesktop 'Dev'
            if (Test-Path -LiteralPath $knownCandidate -PathType Container) {
                return (Normalize-LocalPath $knownCandidate)
            }
        }

        $candidate = $preferred
    }

    if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
        New-Item -ItemType Directory -Path $candidate -Force | Out-Null
    }
    return (Normalize-LocalPath $candidate)
}

function Normalize-GitRemote {
    param([Parameter(Mandatory)][string]$Url)
    $value = $Url.Trim().TrimEnd('/')
    $value = $value -replace '^git@github\.com:', 'https://github.com/'
    $value = $value -replace '^ssh://git@github\.com/', 'https://github.com/'
    $value = $value -replace '\.git$', ''
    return $value.ToLowerInvariant()
}

function Invoke-Git {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Capture
    )
    if ($Capture) {
        $output = & git @Arguments
        if ($LASTEXITCODE) {
            throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
        return ($output -join "`n").Trim()
    }

    & git @Arguments
    if ($LASTEXITCODE) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

$resolvedDevRoot = Resolve-DurableDevRoot
if ($ResolveOnly) {
    Write-Output $resolvedDevRoot
    exit 0
}

$leaf = Split-Path -Leaf $RepositoryUrl.TrimEnd('/')
if ($leaf.EndsWith('.git', [StringComparison]::OrdinalIgnoreCase)) {
    $leaf = $leaf.Substring(0, $leaf.Length - 4)
}
if (-not $leaf) {
    throw "Unable to derive repository name from $RepositoryUrl"
}

$canonical = Join-Path $resolvedDevRoot $leaf
if (-not (Test-Path -LiteralPath $canonical)) {
    Invoke-Git -Arguments @('clone', '--origin', 'origin', $RepositoryUrl, $canonical)
} else {
    try {
        $top = Invoke-Git -Arguments @('-C', $canonical, 'rev-parse', '--show-toplevel') -Capture
    } catch {
        throw "Durable repository slot exists but is not a Git checkout: $canonical"
    }
    if ((Normalize-LocalPath $top) -ne (Normalize-LocalPath $canonical)) {
        throw "Durable repository slot resolves to an unexpected Git root: $top"
    }
}

$origin = Invoke-Git -Arguments @('-C', $canonical, 'remote', 'get-url', 'origin') -Capture
if ((Normalize-GitRemote $origin) -ne (Normalize-GitRemote $RepositoryUrl)) {
    throw "Origin mismatch at $canonical. Expected $RepositoryUrl, got $origin"
}

Invoke-Git -Arguments @('-C', $canonical, 'fetch', 'origin', 'main')

if (-not $Branch) {
    Write-Host "DEV_ROOT=$resolvedDevRoot"
    Write-Host "CANONICAL_REPO=$canonical"
    Write-Output $canonical
    exit 0
}

$remoteRef = "refs/remotes/origin/$Branch"
Invoke-Git -Arguments @('-C', $canonical, 'fetch', 'origin', "refs/heads/${Branch}:${remoteRef}")
$remoteCommit = Invoke-Git -Arguments @('-C', $canonical, 'rev-parse', $remoteRef) -Capture

if ($ExpectedCommit -and $remoteCommit -ne $ExpectedCommit) {
    throw "Branch head mismatch: expected $ExpectedCommit, got $remoteCommit"
}
$targetCommit = if ($ExpectedCommit) { $ExpectedCommit } else { $remoteCommit }

$currentBranch = Invoke-Git -Arguments @('-C', $canonical, 'branch', '--show-current') -Capture
$currentHead = Invoke-Git -Arguments @('-C', $canonical, 'rev-parse', 'HEAD') -Capture
$dirty = Invoke-Git -Arguments @('-C', $canonical, 'status', '--porcelain') -Capture

if ($currentBranch -eq $Branch -and $currentHead -eq $targetCommit -and -not $dirty) {
    Write-Host "DEV_ROOT=$resolvedDevRoot"
    Write-Host "CANONICAL_REPO=$canonical"
    Write-Host "WORKTREE=$canonical"
    Write-Output $canonical
    exit 0
}

$slug = $Branch -replace '[^A-Za-z0-9._-]', '-'
$short = $targetCommit.Substring(0, [Math]::Min(8, $targetCommit.Length))
$baseName = "$leaf-$slug-$short"
$target = Join-Path $resolvedDevRoot $baseName
$counter = 0

while (Test-Path -LiteralPath $target) {
    $usable = $false
    try {
        $existingTop = Invoke-Git -Arguments @('-C', $target, 'rev-parse', '--show-toplevel') -Capture
        $existingHead = Invoke-Git -Arguments @('-C', $target, 'rev-parse', 'HEAD') -Capture
        $existingDirty = Invoke-Git -Arguments @('-C', $target, 'status', '--porcelain') -Capture
        $existingOrigin = Invoke-Git -Arguments @('-C', $target, 'remote', 'get-url', 'origin') -Capture
        $usable = (
            (Normalize-LocalPath $existingTop) -eq (Normalize-LocalPath $target) -and
            $existingHead -eq $targetCommit -and
            -not $existingDirty -and
            (Normalize-GitRemote $existingOrigin) -eq (Normalize-GitRemote $RepositoryUrl)
        )
    } catch {
        $usable = $false
    }

    if ($usable) {
        break
    }

    $counter++
    $target = Join-Path $resolvedDevRoot "$baseName-$counter"
}

if (-not (Test-Path -LiteralPath $target)) {
    Invoke-Git -Arguments @('-C', $canonical, 'worktree', 'add', '--detach', $target, $targetCommit)
}

Write-Host "DEV_ROOT=$resolvedDevRoot"
Write-Host "CANONICAL_REPO=$canonical"
Write-Host "WORKTREE=$target"
Write-Host "BRANCH=$Branch"
Write-Host "COMMIT=$targetCommit"
Write-Output $target
