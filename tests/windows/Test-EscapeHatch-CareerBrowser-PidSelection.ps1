# Offline unit tests for EscapeHatch career-browser PID selection.
# Uses fixture snapshots; does not launch or kill Chrome.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $RepoRoot 'scripts\windows\EscapeHatch-CareerBrowser-PidSelection.ps1')

$fixturePath = Join-Path $RepoRoot 'fixtures\career-browser-pid-selection.v1.example.json'
$fixture = Get-Content -LiteralPath $fixturePath -Raw -Encoding UTF8 | ConvertFrom-Json

function New-SnapshotFromFixtureProcesses {
    param(
        [string]$Label,
        $Processes
    )
    return [ordered]@{
        label = $Label
        capturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        processCount = @($Processes).Count
        processes = @($Processes)
    }
}

$failures = New-Object System.Collections.Generic.List[string]
$passed = 0

foreach ($case in @($fixture.cases)) {
    $after = New-SnapshotFromFixtureProcesses -Label 'after' -Processes $case.afterProcesses
    $baseline = $null
    if ($case.PSObject.Properties['baselineProcesses'] -and $case.baselineProcesses) {
        $baseline = New-SnapshotFromFixtureProcesses -Label 'baseline' -Processes $case.baselineProcesses
    }

    $hostHint = $null
    if ($case.PSObject.Properties['targetHostHint'] -and $case.targetHostHint) {
        $hostHint = [string]$case.targetHostHint
    }
    $result = Select-EhCareerBrowserTarget `
        -Mode ([string]$case.mode) `
        -AfterSnapshot $after `
        -BaselineSnapshot $baseline `
        -ExpectedAssistOriginPort 21031 `
        -TargetHostHint $hostHint `
        -PreferNewPidWhenPresent:($case.mode -eq 'SELECT_AFTER_LAUNCH') `
        -PreferSignedInProfiles $true `
        -AllowSignedInOperatorProfiles:($case.mode -eq 'LOCATE_PROGRESS')

    $expected = $case.expected
    if ([bool]$result.ok -ne [bool]$expected.ok) {
        $failures.Add("$($case.id): ok expected=$($expected.ok) actual=$($result.ok)") | Out-Null
        continue
    }
    if ([string]$result.selectionReason -ne [string]$expected.selectionReason) {
        $failures.Add("$($case.id): reason expected=$($expected.selectionReason) actual=$($result.selectionReason)") | Out-Null
        continue
    }
    if ($expected.PSObject.Properties['selectedPid'] -and $expected.selectedPid) {
        if (-not $result.selected -or [int]$result.selected.pid -ne [int]$expected.selectedPid) {
            $actualPid = if ($result.selected) { $result.selected.pid } else { $null }
            $failures.Add("$($case.id): selectedPid expected=$($expected.selectedPid) actual=$actualPid") | Out-Null
            continue
        }
    }
    if ($expected.PSObject.Properties['mustNotSelectPid'] -and $expected.mustNotSelectPid) {
        if ($result.selected -and [int]$result.selected.pid -eq [int]$expected.mustNotSelectPid) {
            $failures.Add("$($case.id): selected forbidden pid $($expected.mustNotSelectPid)") | Out-Null
            continue
        }
    }
    if ($expected.PSObject.Properties['mustIncludeSignals'] -and $expected.mustIncludeSignals) {
        $signals = @($result.selected.signals)
        foreach ($need in @($expected.mustIncludeSignals)) {
            if ($signals -notcontains $need) {
                $failures.Add("$($case.id): missing signal $need") | Out-Null
            }
        }
        if ($failures.Count -gt $passed) { continue }
    }
    $passed++
}

# Marker parsing unit check
$markers = Get-EhCareerBrowserCommandLineMarkers -CommandLine 'chrome.exe --user-data-dir="C:\Users\x\AppData\Local\EscapeHatch\managed-career-browser-origins\21031" --remote-debugging-pipe'
if (-not $markers.isOwnedManagedProfile -or -not $markers.isBrowserRoot -or $markers.assistOriginPort -ne 21031) {
    $failures.Add('command-line marker parse failed for managed origin profile') | Out-Null
} else {
    $passed++
}

$forbidden = Get-EhCareerBrowserCommandLineMarkers -CommandLine 'chrome.exe --user-data-dir=C:\Users\x\AppData\Local\ms-playwright-mcp\mcp-chrome-bce8a02'
if (-not $forbidden.isForbiddenEphemeral) {
    $failures.Add('command-line marker parse failed to flag playwright mcp profile') | Out-Null
} else {
    $passed++
}

$incognito = Get-EhCareerBrowserCommandLineMarkers -CommandLine 'chrome.exe --incognito --user-data-dir=C:\Users\x\AppData\Local\EscapeHatch\managed-career-browser-origins\21031'
if (-not $incognito.isPrivateSession -or $incognito.isSignedInPersistentProfile) {
    $failures.Add('command-line marker parse failed to flag incognito private session') | Out-Null
} else {
    $passed++
}

$defaultChrome = Get-EhCareerBrowserCommandLineMarkers -CommandLine 'chrome.exe --user-data-dir="C:\Users\x\AppData\Local\Google\Chrome\User Data" --remote-debugging-port=9222'
if (-not $defaultChrome.looksLikeDefaultUserProfile -or -not $defaultChrome.isSignedInPersistentProfile) {
    $failures.Add("command-line marker parse failed to recognize signed-in default Chrome profile (ud=$($defaultChrome.userDataDir))") | Out-Null
} else {
    $passed++
}
$defaultChromeUnquoted = Get-EhCareerBrowserCommandLineMarkers -CommandLine 'chrome.exe --user-data-dir=C:\Users\x\AppData\Local\Google\Chrome\User Data --remote-debugging-port=9222'
if (-not $defaultChromeUnquoted.looksLikeDefaultUserProfile) {
    $failures.Add("unquoted User Data path parse failed (ud=$($defaultChromeUnquoted.userDataDir))") | Out-Null
} else {
    $passed++
}

# Baseline diff helper
$newIds = Get-EhNewProcessIdsSinceBaseline -BaselineProcessIds @(100, 200) -CurrentProcesses @(@{pid=100}, @{pid=300})
if (@($newIds).Count -ne 1 -or $newIds[0] -ne 300) {
    $failures.Add("Get-EhNewProcessIdsSinceBaseline expected [300], got [$($newIds -join ',')]") | Out-Null
} else {
    $passed++
}

Write-Host "passed=$passed failures=$($failures.Count)"
foreach ($f in $failures) { Write-Host "FAIL: $f" -ForegroundColor Red }

if ($failures.Count -gt 0) {
    exit 1
}

Write-Host 'PASS: career-browser PID selection offline fixtures'
exit 0
