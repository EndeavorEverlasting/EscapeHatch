# EscapeHatch career-browser PID/window selection.
# Adapted from BlacksmithGuild S1/S2 baseline diff + AttachOnly existing-session semantics,
# extended so already-open managed Chrome with application progress can be bound without relaunch.
# Dot-source only. Does not launch or kill Chrome on import.

$ErrorActionPreference = 'Stop'

$script:EhCareerBrowserMinBindScore = 50

function Initialize-EhCareerBrowserWin32 {
    if (Get-Command Get-EhCareerBrowserWindowTitle -ErrorAction SilentlyContinue) { return }
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class EhCareerBrowserWin32 {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    public static string GetTitle(IntPtr hWnd) {
        var sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, 512);
        return sb.ToString();
    }
}
"@ -ErrorAction SilentlyContinue | Out-Null
}

function Get-EhCareerBrowserWindowTitle {
    param([IntPtr]$Hwnd)
    Initialize-EhCareerBrowserWin32
    if ($Hwnd -eq [IntPtr]::Zero) { return '' }
    return [EhCareerBrowserWin32]::GetTitle($Hwnd)
}

function Get-EhCareerBrowserWindowRectangle {
    param([IntPtr]$Hwnd)
    Initialize-EhCareerBrowserWin32
    if ($Hwnd -eq [IntPtr]::Zero) { return $null }
    $rect = [EhCareerBrowserWin32+RECT]::new()
    if (-not [EhCareerBrowserWin32]::GetWindowRect($Hwnd, [ref]$rect)) { return $null }
    return [ordered]@{
        left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom
        width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top
    }
}

function Test-EhCareerBrowserProcessNameRelevant {
    param([string]$ProcessName)
    return ([string]$ProcessName -match '^(chrome|msedge|chromium)$')
}

function Get-EhCareerBrowserCommandLineMarkers {
    param([string]$CommandLine)

    $cmd = [string]$CommandLine
    $userDataDir = $null
    # Quoted paths, or unquoted paths that may contain spaces (stop at next --flag).
    if ($cmd -match '(?i)--user-data-dir="([^"]+)"') {
        $userDataDir = $Matches[1]
    } elseif ($cmd -match '(?i)--user-data-dir=(.+?)(?=\s+--|$)') {
        $userDataDir = $Matches[1].Trim().Trim('"')
    }

    $remoteDebuggingPort = $null
    if ($cmd -match '(?i)--remote-debugging-port=(\d+)') {
        $remoteDebuggingPort = [int]$Matches[1]
    }

    $isChild = $cmd -match '(?i)--type='
    $hasRemoteDebugging = ($null -ne $remoteDebuggingPort) -or ($cmd -match '(?i)--remote-debugging-pipe')

    $ownedMarkers = @(
        'EscapeHatch\managed-career-browser-origins',
        'EscapeHatch\managed-career-browser',
        'EscapeHatch/managed-career-browser-origins',
        'EscapeHatch/managed-career-browser'
    )
    $forbiddenMarkers = @(
        'ms-playwright-mcp',
        'ms-playwright\',
        'playwright\mcp-chrome',
        'Temp\playwright',
        'Temp/playwright'
    )

    $isOwned = $false
    foreach ($m in $ownedMarkers) {
        if ($userDataDir -and $userDataDir.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $isOwned = $true; break }
        if ($cmd.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $isOwned = $true; break }
    }

    $isForbidden = $false
    foreach ($m in $forbiddenMarkers) {
        if ($userDataDir -and $userDataDir.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $isForbidden = $true; break }
        if ($cmd.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $isForbidden = $true; break }
    }

    $assistOriginPort = $null
    if ($userDataDir -match '(?i)managed-career-browser-origins[\\/](\d+)') {
        $assistOriginPort = [int]$Matches[1]
    }

    # Private/ephemeral operator sessions: least saved identity. Prefer signed-in profiles when both exist.
    $isPrivateSession = ($cmd -match '(?i)(--incognito|--guest|-inprivate)') `
        -or ($userDataDir -and $userDataDir -match '(?i)(Guest Profile|System Profile)')
    $looksLikeDefaultUserProfile = $false
    if ($userDataDir -and -not $isPrivateSession) {
        if ($userDataDir -match '(?i)\\Google\\Chrome\\User Data$' `
                -or $userDataDir -match '(?i)\\Microsoft\\Edge\\User Data$' `
                -or $userDataDir -match '(?i)\\Chromium\\User Data$') {
            $looksLikeDefaultUserProfile = $true
        }
    }
    $isSignedInPersistentProfile = (-not $isPrivateSession) -and (
        $looksLikeDefaultUserProfile -or ($isOwned -and -not $isForbidden)
    )

    return [pscustomobject][ordered]@{
        userDataDir = $userDataDir
        remoteDebuggingPort = $remoteDebuggingPort
        hasRemoteDebugging = [bool]$hasRemoteDebugging
        isBrowserRoot = -not $isChild
        isChromeChild = [bool]$isChild
        isOwnedManagedProfile = [bool]$isOwned
        isForbiddenEphemeral = [bool]$isForbidden
        assistOriginPort = $assistOriginPort
        isPrivateSession = [bool]$isPrivateSession
        isSignedInPersistentProfile = [bool]$isSignedInPersistentProfile
        looksLikeDefaultUserProfile = [bool]$looksLikeDefaultUserProfile
    }
}

function Get-EhCareerBrowserProcessRecord {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [string]$CommandLine = $null
    )

    $rec = [ordered]@{
        pid = [int]$Process.Id
        processName = [string]$Process.ProcessName
        parentPid = $null
        startTimeUtc = $null
        mainWindowHandle = 0
        mainWindowTitle = ''
        executablePath = $null
        commandLine = $null
        windowRectangle = $null
        visible = $false
        userDataDir = $null
        remoteDebuggingPort = $null
        hasRemoteDebugging = $false
        isBrowserRoot = $false
        isChromeChild = $false
        isOwnedManagedProfile = $false
        isForbiddenEphemeral = $false
        assistOriginPort = $null
        isPrivateSession = $false
        isSignedInPersistentProfile = $false
        looksLikeDefaultUserProfile = $false
    }

    try { $rec.startTimeUtc = $Process.StartTime.ToUniversalTime().ToString('o') } catch { }
    try {
        $hwnd = $Process.MainWindowHandle
        $rec.mainWindowHandle = [int64]$hwnd
        if ($hwnd -ne [IntPtr]::Zero) {
            Initialize-EhCareerBrowserWin32
            $rec.mainWindowTitle = Get-EhCareerBrowserWindowTitle -Hwnd $hwnd
            $rec.windowRectangle = Get-EhCareerBrowserWindowRectangle -Hwnd $hwnd
            $rec.visible = [bool][EhCareerBrowserWin32]::IsWindowVisible($hwnd)
        }
    } catch { }

    if (-not $CommandLine) {
        try {
            $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=$($Process.Id)" -ErrorAction Stop
            $CommandLine = [string]$wmi.CommandLine
            $rec.parentPid = [int]$wmi.ParentProcessId
            $rec.executablePath = [string]$wmi.ExecutablePath
        } catch { }
    }
    $rec.commandLine = $CommandLine

    $markers = Get-EhCareerBrowserCommandLineMarkers -CommandLine ([string]$CommandLine)
    $rec.userDataDir = $markers.userDataDir
    $rec.remoteDebuggingPort = $markers.remoteDebuggingPort
    $rec.hasRemoteDebugging = $markers.hasRemoteDebugging
    $rec.isBrowserRoot = $markers.isBrowserRoot
    $rec.isChromeChild = $markers.isChromeChild
    $rec.isOwnedManagedProfile = $markers.isOwnedManagedProfile
    $rec.isForbiddenEphemeral = $markers.isForbiddenEphemeral
    $rec.assistOriginPort = $markers.assistOriginPort
    $rec.isPrivateSession = $markers.isPrivateSession
    $rec.isSignedInPersistentProfile = $markers.isSignedInPersistentProfile
    $rec.looksLikeDefaultUserProfile = $markers.looksLikeDefaultUserProfile

    # Title cues reinforce CLI private-session detection (Chrome/Edge UI).
    $title = [string]$rec.mainWindowTitle
    if ($title -match '(?i)(\(Incognito\)|InPrivate)') {
        $rec.isPrivateSession = $true
        $rec.isSignedInPersistentProfile = $false
    }

    return [pscustomobject]$rec
}

function Get-EhCareerBrowserProcessSnapshot {
    param(
        [string]$Label = 'S0',
        [switch]$IncludeNonOwnedChrome
    )

    $capturedUtc = (Get-Date).ToUniversalTime().ToString('o')
    $records = New-Object System.Collections.Generic.List[object]

    # One WMI query for chrome-family command lines instead of per-PID CIM round-trips.
    $cmdByPid = @{}
    try {
        $filter = "Name='chrome.exe' OR Name='msedge.exe' OR Name='chromium.exe'"
        foreach ($wmi in @(Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue)) {
            $cmdByPid[[int]$wmi.ProcessId] = [pscustomobject]@{
                CommandLine = [string]$wmi.CommandLine
                ParentPid = [int]$wmi.ParentProcessId
                ExecutablePath = [string]$wmi.ExecutablePath
            }
        }
    } catch { }

    foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
        if (-not (Test-EhCareerBrowserProcessNameRelevant -ProcessName $proc.ProcessName)) { continue }
        try {
            $meta = $cmdByPid[[int]$proc.Id]
            $commandLine = if ($meta) { [string]$meta.CommandLine } else { $null }
            $rec = Get-EhCareerBrowserProcessRecord -Process $proc -CommandLine $commandLine
            if ($meta) {
                $rec.parentPid = [int]$meta.ParentPid
                if (-not $rec.executablePath) { $rec.executablePath = [string]$meta.ExecutablePath }
            }
            if (-not $IncludeNonOwnedChrome) {
                if (-not $rec.isOwnedManagedProfile -and -not $rec.isForbiddenEphemeral) {
                    continue
                }
            }
            $records.Add($rec) | Out-Null
        } catch { }
    }

    return [ordered]@{
        label = [string]$Label
        capturedAtUtc = $capturedUtc
        processCount = $records.Count
        processes = @($records.ToArray())
    }
}

function Save-EhCareerBrowserProcessSnapshot {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )
    $dir = Split-Path -Parent $OutputPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    ($Snapshot | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    return $OutputPath
}

function Compare-EhCareerBrowserProcessSnapshots {
    param(
        [Parameter(Mandatory = $true)]$BaselineSnapshot,
        [Parameter(Mandatory = $true)]$AfterSnapshot
    )

    $basePids = @{}
    foreach ($p in @($BaselineSnapshot.processes)) { $basePids[[int]$p.pid] = $p }

    $afterPids = @{}
    foreach ($p in @($AfterSnapshot.processes)) { $afterPids[[int]$p.pid] = $p }

    $newPids = New-Object System.Collections.Generic.List[object]
    $changedWindows = New-Object System.Collections.Generic.List[object]

    foreach ($procId in @($afterPids.Keys)) {
        if (-not $basePids.ContainsKey($procId)) {
            $newPids.Add($afterPids[$procId]) | Out-Null
            continue
        }
        $before = $basePids[$procId]
        $after = $afterPids[$procId]
        if ([int64]$before.mainWindowHandle -ne [int64]$after.mainWindowHandle `
                -or [string]$before.mainWindowTitle -ne [string]$after.mainWindowTitle) {
            $changedWindows.Add([ordered]@{
                pid = $procId
                before = $before
                after = $after
            }) | Out-Null
        }
    }

    return [ordered]@{
        baselineLabel = $BaselineSnapshot.label
        afterLabel = $AfterSnapshot.label
        newPids = @($newPids.ToArray())
        changedWindows = @($changedWindows.ToArray())
    }
}

function Get-EhNewProcessIdsSinceBaseline {
    param(
        [int[]]$BaselineProcessIds,
        [object[]]$CurrentProcesses
    )
    $baseline = @{}
    foreach ($id in @($BaselineProcessIds)) { $baseline[[int]$id] = $true }
    $newIds = New-Object System.Collections.Generic.List[int]
    foreach ($proc in @($CurrentProcesses)) {
        if ($null -eq $proc) { continue }
        $processId = $null
        if ($proc -is [System.Collections.IDictionary]) {
            if ($proc.Contains('pid')) { $processId = [int]$proc['pid'] }
            elseif ($proc.Contains('Id')) { $processId = [int]$proc['Id'] }
        } else {
            $names = @($proc.PSObject.Properties.Name)
            if ($names -contains 'pid') { $processId = [int]$proc.pid }
            elseif ($names -contains 'Id') { $processId = [int]$proc.Id }
        }
        if ($null -eq $processId) { continue }
        if (-not $baseline.ContainsKey([int]$processId)) { $newIds.Add([int]$processId) | Out-Null }
    }
    return @($newIds.ToArray())
}

function Get-EhCareerBrowserCandidateScore {
    param(
        [Parameter(Mandatory = $true)]$ProcessRecord,
        [bool]$IsNewAfterBaseline = $false,
        [bool]$WindowChangedAfterBaseline = $false,
        [Nullable[int]]$ExpectedAssistOriginPort = $null,
        [string]$TargetHostHint = $null,
        [bool]$PreferSignedInProfiles = $true,
        [bool]$AllowSignedInOperatorProfiles = $false,
        [bool]$RequireHostHintMatch = $false
    )

    $signals = New-Object System.Collections.Generic.List[string]
    $missing = New-Object System.Collections.Generic.List[string]
    $score = 0

    if ($ProcessRecord.isForbiddenEphemeral) {
        return [pscustomobject][ordered]@{
            pid = [int]$ProcessRecord.pid
            score = -100
            signals = @('forbidden_ephemeral_profile')
            missing = @('owned_managed_profile')
            eligible = $false
            hostMatched = $false
        }
    }

    if ($ProcessRecord.isOwnedManagedProfile) {
        $score += 40; $signals.Add('managed_career_user_data_dir') | Out-Null
    } else {
        $score -= 10; $missing.Add('managed_career_user_data_dir') | Out-Null
    }

    if ($ProcessRecord.isBrowserRoot) {
        $score += 25; $signals.Add('browser_root_process') | Out-Null
    } else {
        $score -= 40; $signals.Add('chrome_child_process') | Out-Null
        $missing.Add('browser_root_process') | Out-Null
    }

    if ($ProcessRecord.hasRemoteDebugging) {
        $score += 20; $signals.Add('remote_debugging_present') | Out-Null
    } else {
        $missing.Add('remote_debugging_present') | Out-Null
    }

    if ([int64]$ProcessRecord.mainWindowHandle -ne 0 -and $ProcessRecord.visible) {
        $score += 15; $signals.Add('visible_top_level_window') | Out-Null
    } else {
        $missing.Add('visible_top_level_window') | Out-Null
    }

    if ($null -ne $ExpectedAssistOriginPort -and $null -ne $ProcessRecord.assistOriginPort `
            -and [int]$ProcessRecord.assistOriginPort -eq [int]$ExpectedAssistOriginPort) {
        $score += 15; $signals.Add('assist_origin_port_folder_match') | Out-Null
    }

    $hostMatched = $false
    if ($TargetHostHint) {
        $title = [string]$ProcessRecord.mainWindowTitle
        if ($title -and $title.IndexOf($TargetHostHint, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $score += 25; $signals.Add('target_host_or_title_hint') | Out-Null
            $hostMatched = $true
        } else {
            $missing.Add('target_host_or_title_hint') | Out-Null
        }
    }

    if ($PreferSignedInProfiles) {
        if ($ProcessRecord.isPrivateSession) {
            $score -= 35; $signals.Add('private_or_incognito_session') | Out-Null
            $missing.Add('signed_in_persistent_profile') | Out-Null
        } elseif ($ProcessRecord.isSignedInPersistentProfile) {
            $score += 25; $signals.Add('signed_in_persistent_profile') | Out-Null
            if ($ProcessRecord.looksLikeDefaultUserProfile) {
                $score += 10; $signals.Add('default_user_chrome_profile') | Out-Null
            }
        } else {
            $missing.Add('signed_in_persistent_profile') | Out-Null
        }
    }

    if ($IsNewAfterBaseline) {
        $score += 30; $signals.Add('new_pid_after_baseline') | Out-Null
    }
    if ($WindowChangedAfterBaseline) {
        $score += 10; $signals.Add('changed_window_after_baseline') | Out-Null
    }

    $profileOk = $ProcessRecord.isOwnedManagedProfile -or (
        $AllowSignedInOperatorProfiles -and $ProcessRecord.isSignedInPersistentProfile -and -not $ProcessRecord.isPrivateSession
    )
    $eligible = ($score -ge $script:EhCareerBrowserMinBindScore) `
        -and (-not $ProcessRecord.isForbiddenEphemeral) `
        -and $profileOk `
        -and ((-not $RequireHostHintMatch) -or $hostMatched)

    return [pscustomobject][ordered]@{
        pid = [int]$ProcessRecord.pid
        score = [int]$score
        signals = @($signals.ToArray())
        missing = @($missing.ToArray())
        eligible = [bool]$eligible
        hostMatched = [bool]$hostMatched
        process = $ProcessRecord
    }
}

function Select-EhCareerBrowserTarget {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('ATTACH_EXISTING', 'ATTACH_ONLY', 'SELECT_AFTER_LAUNCH', 'LOCATE_PROGRESS')]
        [string]$Mode,

        [Parameter(Mandatory = $true)]$AfterSnapshot,
        $BaselineSnapshot = $null,
        [Nullable[int]]$ExpectedAssistOriginPort = $null,
        [string]$TargetHostHint = $null,
        [switch]$PreferNewPidWhenPresent,
        [bool]$PreferSignedInProfiles = $true,
        [switch]$AllowSignedInOperatorProfiles
    )

    $diff = $null
    $newPidSet = @{}
    $changedPidSet = @{}
    if ($null -ne $BaselineSnapshot) {
        $diff = Compare-EhCareerBrowserProcessSnapshots -BaselineSnapshot $BaselineSnapshot -AfterSnapshot $AfterSnapshot
        foreach ($p in @($diff.newPids)) { $newPidSet[[int]$p.pid] = $true }
        foreach ($c in @($diff.changedWindows)) { $changedPidSet[[int]$c.pid] = $true }
    }

    $preferDelta = $PreferNewPidWhenPresent -or ($Mode -eq 'SELECT_AFTER_LAUNCH')
    $allowOperator = $AllowSignedInOperatorProfiles -or ($Mode -eq 'LOCATE_PROGRESS')
    $candidates = New-Object System.Collections.Generic.List[object]

    foreach ($proc in @($AfterSnapshot.processes)) {
        $scored = Get-EhCareerBrowserCandidateScore `
            -ProcessRecord $proc `
            -IsNewAfterBaseline ($newPidSet.ContainsKey([int]$proc.pid)) `
            -WindowChangedAfterBaseline ($changedPidSet.ContainsKey([int]$proc.pid)) `
            -ExpectedAssistOriginPort $ExpectedAssistOriginPort `
            -TargetHostHint $TargetHostHint `
            -PreferSignedInProfiles $PreferSignedInProfiles `
            -AllowSignedInOperatorProfiles $allowOperator `
            -RequireHostHintMatch $false
        $candidates.Add($scored) | Out-Null
    }

    $ordered = @($candidates | Sort-Object `
            @{ Expression = { if ($_.eligible) { 1 } else { 0 } }; Descending = $true }, `
            @{ Expression = { $_.score }; Descending = $true }, `
            @{ Expression = {
                    if ($_.process -and $_.process.PSObject.Properties['startTimeUtc'] -and $_.process.startTimeUtc) {
                        [datetime]$_.process.startTimeUtc
                    } else { [datetime]::MinValue }
                }; Descending = $true })

    $selected = $null
    $selectionReason = 'no_eligible_candidate'

    if ($preferDelta -and $newPidSet.Count -gt 0) {
        $deltaEligible = @($ordered | Where-Object { $_.eligible -and $newPidSet.ContainsKey([int]$_.pid) })
        if ($deltaEligible.Count -gt 0) {
            $selected = $deltaEligible[0]
            $selectionReason = 's2_minus_s1_new_pid'
        }
    }

    if (-not $selected) {
        $existingEligible = @($ordered | Where-Object { $_.eligible })
        if ($Mode -eq 'LOCATE_PROGRESS') {
            # Prefer host-matched titles; else fall back to owned/signed-in career session.
            $hostEligible = @($existingEligible | Where-Object { $_.hostMatched })
            if ($hostEligible.Count -gt 0) {
                $existingEligible = $hostEligible
            } else {
                $ownedEligible = @($existingEligible | Where-Object { $_.process.isOwnedManagedProfile -and $_.process.isBrowserRoot })
                if ($ownedEligible.Count -gt 0) { $existingEligible = $ownedEligible }
            }
        }
        if ($existingEligible.Count -gt 0) {
            $selected = $existingEligible[0]
            if ($Mode -eq 'LOCATE_PROGRESS') {
                if ($selected.hostMatched -and $selected.process.isPrivateSession) {
                    $selectionReason = 'progress_window_private_session'
                } elseif ($selected.hostMatched -and $selected.process.looksLikeDefaultUserProfile) {
                    $selectionReason = 'progress_window_signed_in_operator_chrome'
                } elseif ($selected.hostMatched) {
                    $selectionReason = 'progress_window_owned_managed_session'
                } elseif ($selected.process.isOwnedManagedProfile) {
                    $selectionReason = 'progress_window_owned_managed_fallback_no_title_host'
                } else {
                    $selectionReason = 'progress_window_signed_in_operator_chrome'
                }
            } elseif ($Mode -in @('ATTACH_EXISTING', 'ATTACH_ONLY')) {
                $selectionReason = 'attach_existing_owned_progress_session'
            } elseif ($newPidSet.Count -eq 0) {
                $selectionReason = 'owned_existing_fallback_when_no_new_pid'
            } else {
                $selectionReason = 'owned_existing_after_delta_miss'
            }
        }
    }

    if (-not $selected -and $Mode -in @('ATTACH_ONLY', 'LOCATE_PROGRESS')) {
        $failReason = if ($Mode -eq 'LOCATE_PROGRESS') { 'locate_progress_no_matching_window' } else { 'attach_only_no_owned_candidate' }
        return [pscustomobject][ordered]@{
            ok = $false
            mode = $Mode
            selectionReason = $failReason
            selected = $null
            candidates = @($ordered)
            diff = $diff
            mayLaunch = $false
            mayTerminate = $false
            answer = if ($Mode -eq 'LOCATE_PROGRESS') {
                "No visible Chrome/Edge window matched host hint '$TargetHostHint'."
            } else { $null }
        }
    }

    $answer = $null
    if ($selected -and $Mode -eq 'LOCATE_PROGRESS') {
        $p = $selected.process
        $privacy = if ($p.isPrivateSession) { 'private/incognito (least saved identity)' } `
            elseif ($p.looksLikeDefaultUserProfile) { 'signed-in operator Chrome profile' } `
            elseif ($p.isOwnedManagedProfile) { 'EscapeHatch managed career profile' } `
            else { 'browser profile' }
        $titleText = if ([string]::IsNullOrWhiteSpace([string]$p.mainWindowTitle)) { '(title unavailable)' } else { [string]$p.mainWindowTitle }
        if ($selected.hostMatched) {
            $answer = "In-progress application for '$TargetHostHint' is most likely PID $($selected.pid) — `"$titleText`" ($privacy)."
        } else {
            $answer = "No window title contained '$TargetHostHint'. Best career-session candidate is PID $($selected.pid) — `"$titleText`" ($privacy)."
        }
    }

    return [pscustomobject][ordered]@{
        ok = [bool]($null -ne $selected)
        mode = $Mode
        selectionReason = $selectionReason
        selected = $selected
        candidates = @($ordered)
        diff = $diff
        mayLaunch = ($Mode -eq 'SELECT_AFTER_LAUNCH')
        mayTerminate = $false
        answer = $answer
    }
}

function New-EhCareerBrowserReceipt {
    param(
        [Parameter(Mandatory = $true)]$SelectionResult,
        [Parameter(Mandatory = $true)][string]$RepoFingerprint,
        [string]$BaselineLabel = $null,
        [string]$AfterLabel = $null
    )

    if (-not $SelectionResult.ok -or -not $SelectionResult.selected) {
        throw 'Cannot write career-browser receipt without a successful selection.'
    }

    $proc = $SelectionResult.selected.process
    return [ordered]@{
        schema = 'escapehatch-career-browser/v1'
        repoFingerprint = $RepoFingerprint
        selectionMode = [string]$SelectionResult.mode
        selectionReason = [string]$SelectionResult.selectionReason
        pid = [int]$SelectionResult.selected.pid
        processStartTimeUtc = [string]$proc.startTimeUtc
        userDataDir = [string]$proc.userDataDir
        remoteDebuggingPort = $proc.remoteDebuggingPort
        mainWindowHandle = [int64]$proc.mainWindowHandle
        mainWindowTitle = [string]$proc.mainWindowTitle
        score = [int]$SelectionResult.selected.score
        signals = @($SelectionResult.selected.signals)
        baselineLabel = $BaselineLabel
        afterLabel = $AfterLabel
        boundAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        provenance = 'BlacksmithGuild-baseline-diff+EscapeHatch-attach-existing'
    }
}

function Get-EhComparableStartTimeUtc {
    param($Value)
    if ($null -eq $Value -or $Value -eq '') { return $null }
    try {
        if ($Value -is [datetime]) {
            return ([datetime]$Value).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        $text = [string]$Value
        # Prefer round-trip parse for ISO strings; avoid culture-local reinterpretation.
        if ($text -match '^\d{4}-\d{2}-\d{2}T') {
            $dt = [datetime]::Parse($text, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
            return $dt.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        if ($Value -is [string]) {
            # PowerShell ConvertFrom-Json may have already lost Kind; do not culture-parse ambiguous strings.
            return $null
        }
        return ([datetime]$Value).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    } catch {
        return $null
    }
}

function Test-EhCareerBrowserReceiptReproof {
    param(
        [Parameter(Mandatory = $true)]$Receipt,
        [Parameter(Mandatory = $true)]$LiveProcessRecord
    )

    $reasons = New-Object System.Collections.Generic.List[string]
    if ([int]$Receipt.pid -ne [int]$LiveProcessRecord.pid) { $reasons.Add('pid_mismatch') | Out-Null }
    $receiptStart = Get-EhComparableStartTimeUtc -Value ([string]$Receipt.processStartTimeUtc)
    $liveStart = Get-EhComparableStartTimeUtc -Value ([string]$LiveProcessRecord.startTimeUtc)
    if ($receiptStart -and $liveStart -and $receiptStart -ne $liveStart) {
        $reasons.Add('start_time_mismatch') | Out-Null
    }
    if ([string]$Receipt.userDataDir -and [string]$LiveProcessRecord.userDataDir `
            -and ([string]$Receipt.userDataDir -ne [string]$LiveProcessRecord.userDataDir)) {
        $reasons.Add('user_data_dir_mismatch') | Out-Null
    }
    if ($LiveProcessRecord.isForbiddenEphemeral) { $reasons.Add('forbidden_ephemeral') | Out-Null }
    if (-not $LiveProcessRecord.isOwnedManagedProfile) { $reasons.Add('not_owned_managed_profile') | Out-Null }

    return [pscustomobject][ordered]@{
        ok = ($reasons.Count -eq 0)
        reasons = @($reasons.ToArray())
    }
}
