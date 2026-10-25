[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$installer = Join-Path $repo 'scripts\windows\EscapeHatch-Install.ps1'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('eh-install-' + [Guid]::NewGuid().ToString('N'))
$sourceA = Join-Path $fixture 'source-a'
$sourceB = Join-Path $fixture 'source-b'
$appData = Join-Path $fixture 'user-data'
$shortcuts = Join-Path $fixture 'shortcuts'
$receipt = Join-Path $appData 'installation\install.v1.json'
$shortcut = Join-Path $shortcuts 'EscapeHatch.lnk'
$caseCount = 0
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "ASSERTION_FAILED: $Message" } }
function Case([string]$Name) { $script:caseCount++; Write-Host "CASE $script:caseCount`: $Name" }
function Run([string]$Action, [string]$Source = $sourceA, [int]$Expected = 0) {
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action $Action -SourceRoot $Source -AppDataRoot $appData -ShortcutRoot $shortcuts -TestMode -SkipDependencies 2>&1)
    Assert-True ($LASTEXITCODE -eq $Expected) "$Action exit was $LASTEXITCODE, expected $Expected. $($output -join ' ')"
    return ($output -join "`n")
}

function Fixture-Source([string]$Root) {
    New-Item -ItemType Directory -Path (Join-Path $Root 'scripts\windows') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Root 'artifacts\escape-hatch') -Force | Out-Null
    '{}' | Set-Content -LiteralPath (Join-Path $Root 'artifacts\escape-hatch\package.json')
    '# synthetic launcher' | Set-Content -LiteralPath (Join-Path $Root 'Launch-EscapeHatch.ps1')
    @'
param([string]$Action)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$state = Join-Path $root 'runtime-state.txt'
$current = if (Test-Path -LiteralPath $state) { (Get-Content -LiteralPath $state -Raw).Trim() } else { 'STOPPED' }
switch ($Action) {
 'Start' { 'OWNED_HEALTHY' | Set-Content -LiteralPath $state; Write-Host 'ESCAPEHATCH_STATE=OWNED_HEALTHY' }
 'Stop' { 'STOPPED' | Set-Content -LiteralPath $state; Write-Host 'ESCAPEHATCH_STATE=STOPPED' }
 'Status' { Write-Host "ESCAPEHATCH_STATE=$current" }
 default { exit 1 }
}
exit 0
'@ | Set-Content -LiteralPath (Join-Path $Root 'scripts\windows\EscapeHatch-Runtime.ps1') -Encoding UTF8
}
try {
    Fixture-Source $sourceA
    Fixture-Source $sourceB
    Case 'Inspect performs no user-root writes'
    $inspect = Run 'Inspect'
    $inspect | Out-Host
    if (Get-Command node.exe -ErrorAction SilentlyContinue) {
        $nodeVersion = & node.exe --version
        $version = [Version]($nodeVersion.TrimStart('v'))
        $expectedNode = $version -ge [Version]'22.16.0'
        Assert-True ($inspect.Contains('NODE_VERSION_READY=' + $expectedNode)) 'real PS5.1 Node version probe disagrees with installed version'
    }
    Assert-True (-not (Test-Path -LiteralPath $appData)) 'Inspect created app data'
    Assert-True (-not (Test-Path -LiteralPath $shortcuts)) 'Inspect created shortcut folder'

    Case 'Install is idempotent and records CREATED shortcut'
    Run 'Install' | Out-Host
    $first = Get-Content -LiteralPath $receipt -Raw
    Run 'Install' | Out-Host
    Assert-True ((Get-Content -LiteralPath $receipt -Raw) -ceq $first) 'repeat install changed receipt'
    Assert-True (($first | ConvertFrom-Json).shortcuts[0].ownership -eq 'CREATED') 'shortcut ownership wrong'

    Case 'Bootstrap from another worktree honors selected source'
    Run 'Bootstrap' $sourceB | Out-Host
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'OWNED_HEALTHY') 'selected source did not start'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $sourceB 'runtime-state.txt'))) 'Bootstrap silently repointed source'

    Case 'Uninstall refuses changed shortcut before stopping runtime'
    [IO.File]::AppendAllText($shortcut, 'modified')
    $output = Run 'Uninstall' $sourceA 1
    Assert-True ($output -match 'INSTALL_SHORTCUT_CHANGED') 'modified shortcut did not report safety gate'
    Assert-True (Test-Path -LiteralPath $receipt) 'changed shortcut lost installation receipt'
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'OWNED_HEALTHY') 'refusal stopped runtime'
    # Remove only these unique fixture-owned files to prepare another install.
    Remove-Item -LiteralPath $shortcut -Force
    Remove-Item -LiteralPath $receipt -Force
    Run 'Install' | Out-Host

    Case 'Explicit Install switches sources only after owned runtime stop'
    Run 'Install' $sourceB | Out-Host
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'STOPPED') 'old runtime was not stopped'
    Assert-True ((Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).sourceRoot -eq $sourceB) 'explicit source replacement absent'

    Case 'Uninstall preserves user state, source, dependencies, auth and supports repetition'
    $private = Join-Path $appData 'profile.json'
    $auth = Join-Path $appData 'google-auth.json'
    $dependency = Join-Path $sourceB 'artifacts\escape-hatch\existing-dependency.txt'
    'synthetic-private-state' | Set-Content -LiteralPath $private
    'synthetic-auth' | Set-Content -LiteralPath $auth
    'synthetic-dependency' | Set-Content -LiteralPath $dependency
    Run 'Uninstall' | Out-Host
    Run 'Uninstall' | Out-Host
    Assert-True (-not (Test-Path -LiteralPath $receipt)) 'uninstall retained receipt'
    Assert-True (-not (Test-Path -LiteralPath $shortcut)) 'owned shortcut not removed'
    foreach ($item in @($private, $auth, $dependency, (Join-Path $sourceB 'Launch-EscapeHatch.ps1'))) { Assert-True (Test-Path -LiteralPath $item -PathType Leaf) 'uninstall removed preserved user/source resource' }

    Case 'Preexisting shortcut is adopted and survives uninstall'
    'synthetic-preexisting-shortcut' | Set-Content -LiteralPath $shortcut
    Run 'Install' | Out-Host
    Assert-True ((Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).shortcuts[0].ownership -eq 'ADOPTED') 'preexisting shortcut not adopted'
    Run 'Uninstall' | Out-Host
    Assert-True ((Get-Content -LiteralPath $shortcut -Raw).Trim() -eq 'synthetic-preexisting-shortcut') 'adopted shortcut removed'

    Case 'Foreign runtime blocks removal and explicit source replacement'
    Run 'Install' | Out-Host
    'FOREIGN_CONFLICT' | Set-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt')
    Run 'Uninstall' $sourceA 1 | Out-Host
    Run 'Install' $sourceB 1 | Out-Host
    Assert-True (Test-Path -LiteralPath $receipt) 'foreign conflict lost receipt'
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'FOREIGN_CONFLICT') 'foreign runtime mutated'

    Case 'Receipt cannot authorize deleting an unrelated file'
    $forged = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    $forged.shortcuts[0].path = $private
    $forged | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receipt
    Run 'Uninstall' $sourceA 1 | Out-Host
    Assert-True ((Get-Content -LiteralPath $private -Raw).Trim() -eq 'synthetic-private-state') 'forged receipt deleted user data'

    Case 'Malformed receipt blocks mutation'
    '{"schema":"broken"}' | Set-Content -LiteralPath $receipt
    Run 'Uninstall' $sourceA 1 | Out-Host
    Assert-True (Test-Path -LiteralPath $shortcut) 'malformed receipt removed shortcut'
    Write-Host "ESCAPEHATCH_INSTALL_TESTS=PASS; cases=$caseCount; live_runtime=UNTOUCHED"
} finally {
    # This test created the unique fixture root. Re-resolve and bound cleanup.
    $resolved = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^eh-install-[a-f0-9]{32}$') { throw 'TEST_CLEANUP_ROOT_INVALID' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}

# Expected negative child commands leave LASTEXITCODE=1. CI dot-sources this
# script, so explicitly return success only after assertions and cleanup finish.
exit 0
