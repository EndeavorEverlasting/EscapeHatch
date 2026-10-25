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

function Run-Adapter([string]$Name, [int]$Expected = 0) {
    $adapter = Join-Path $sourceB $Name
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $adapter -AppDataRoot $appData -ShortcutRoot $shortcuts -TestMode 2>&1)
    Assert-True ($LASTEXITCODE -eq $Expected) "$Name exit was $LASTEXITCODE, expected $Expected. $($output -join ' ')"
    return ($output -join "`n")
}

function Fixture-Source([string]$Root) {
    New-Item -ItemType Directory -Path (Join-Path $Root 'scripts\windows') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Root 'artifacts\escape-hatch') -Force | Out-Null
    Copy-Item -LiteralPath $installer -Destination (Join-Path $Root 'scripts\windows\EscapeHatch-Install.ps1')
    foreach ($adapter in @('Close-EscapeHatch.ps1', 'Status-EscapeHatch.ps1')) {
        Copy-Item -LiteralPath (Join-Path $repo $adapter) -Destination (Join-Path $Root $adapter)
    }
    '{}' | Set-Content -LiteralPath (Join-Path $Root 'artifacts\escape-hatch\package.json')
    '# synthetic launcher' | Set-Content -LiteralPath (Join-Path $Root 'Launch-EscapeHatch.ps1')
    @'
param([string]$Action)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$state = Join-Path $root 'runtime-state.txt'
$current = if (Test-Path -LiteralPath $state) { (Get-Content -LiteralPath $state -Raw).Trim() } else { 'STOPPED' }
switch ($Action) {
 'Start' { 'OWNED_HEALTHY' | Set-Content -LiteralPath $state; Write-Host 'ESCAPEHATCH_STATE=OWNED_HEALTHY' }
 'Stop' { if ($current -eq 'FOREIGN_CONFLICT') { Write-Host 'ESCAPEHATCH_STATE=FOREIGN_CONFLICT'; exit 2 }; 'STOPPED' | Set-Content -LiteralPath $state; Write-Host 'ESCAPEHATCH_STATE=STOPPED' }
 'Status' { Write-Host "ESCAPEHATCH_STATE=$current"; if ($current -eq 'FOREIGN_CONFLICT') { exit 2 } }
 default { exit 1 }
}
exit 0
'@ | Set-Content -LiteralPath (Join-Path $Root 'scripts\windows\EscapeHatch-Runtime.ps1') -Encoding UTF8
}
try {
    Fixture-Source $sourceA
    Fixture-Source $sourceB
    Case 'Path normalization preserves drive and UNC roots without using drive-relative paths'
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$parseErrors)
    Assert-True ($parseErrors.Count -eq 0) 'installer parser failed'
    $fullPathFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Full-Path' }, $true)
    Assert-True ($null -ne $fullPathFunction) 'normalization owner missing'
    Invoke-Expression $fullPathFunction.Extent.Text
    $driveRoot = [IO.Path]::GetPathRoot($env:SystemRoot)
    Assert-True ((Full-Path $driveRoot) -ceq $driveRoot) 'drive root lost its trailing separator'
    $uncRoot = '\\synthetic\share\'
    Assert-True ((Full-Path $uncRoot) -ceq [IO.Path]::GetPathRoot($uncRoot)) 'UNC root was changed'
    Assert-True ((Full-Path (Join-Path $fixture 'child\')) -ceq (Join-Path $fixture 'child')) 'non-root trailing separator not normalized'

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

    Case 'Install repairs a deleted owned shortcut and records its replacement idempotently'
    Remove-Item -LiteralPath $shortcut -Force
    $repair = Run 'Install'
    Assert-True ($repair -match 'INSTALL_SHORTCUT=REPAIRED') 'missing owned shortcut not repaired'
    Assert-True (Test-Path -LiteralPath $shortcut -PathType Leaf) 'replacement shortcut missing'
    $repaired = Get-Content -LiteralPath $receipt -Raw
    Assert-True (($repaired | ConvertFrom-Json).shortcuts[0].sha256 -ceq (Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash.ToLowerInvariant()) 'replacement hash not recorded'
    Run 'Install' | Out-Host
    Assert-True ((Get-Content -LiteralPath $receipt -Raw) -ceq $repaired) 'repeat repair changed receipt'

    Case 'Bootstrap repairs a deleted owned shortcut without changing the selected source'
    Remove-Item -LiteralPath $shortcut -Force
    $repair = Run 'Bootstrap' $sourceB
    Assert-True ($repair -match 'INSTALL_SHORTCUT=REPAIRED') 'Bootstrap did not repair owned shortcut'
    Assert-True ((Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).sourceRoot -eq $sourceA) 'repair repointed selected source'

    Case 'Bootstrap from another worktree honors selected source'
    Run 'Bootstrap' $sourceB | Out-Host
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'OWNED_HEALTHY') 'selected source did not start'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $sourceB 'runtime-state.txt'))) 'Bootstrap silently repointed source'

    Case 'Sibling Status and Close adapters use the installed source without provisioning dependencies'
    $status = Run-Adapter 'Status-EscapeHatch.ps1'
    Assert-True ($status -match 'ESCAPEHATCH_STATE=OWNED_HEALTHY') 'Status ignored installed source'
    Run-Adapter 'Close-EscapeHatch.ps1' | Out-Host
    Assert-True ((Get-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt') -Raw).Trim() -eq 'STOPPED') 'Close did not stop selected source'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $sourceB 'runtime-state.txt'))) 'adapter operated on its own checkout'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $sourceA 'artifacts\escape-hatch\node_modules'))) 'adapter installed dependencies'
    Run 'Bootstrap' $sourceB | Out-Host

    Case 'Uninstall refuses changed shortcut before stopping runtime'
    [IO.File]::AppendAllText($shortcut, 'modified')
    $changedShortcutHash = (Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash
    Run 'Install' | Out-Host
    Run 'Bootstrap' $sourceB | Out-Host
    Assert-True ((Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash -ceq $changedShortcutHash) 'install/bootstrap overwrote modified shortcut'
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
    Remove-Item -LiteralPath $shortcut -Force
    Run 'Install' | Out-Host
    Assert-True (-not (Test-Path -LiteralPath $shortcut)) 'missing adopted shortcut was recreated'
    'synthetic-preexisting-shortcut' | Set-Content -LiteralPath $shortcut
    Run 'Uninstall' | Out-Host
    Assert-True ((Get-Content -LiteralPath $shortcut -Raw).Trim() -eq 'synthetic-preexisting-shortcut') 'adopted shortcut removed'

    Case 'Foreign runtime blocks removal and explicit source replacement'
    Run 'Install' | Out-Host
    'FOREIGN_CONFLICT' | Set-Content -LiteralPath (Join-Path $sourceA 'runtime-state.txt')
    Run 'Uninstall' $sourceA 1 | Out-Host
    Run 'Install' $sourceB 1 | Out-Host
    Run-Adapter 'Status-EscapeHatch.ps1' 2 | Out-Host
    Run-Adapter 'Close-EscapeHatch.ps1' 2 | Out-Host
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
