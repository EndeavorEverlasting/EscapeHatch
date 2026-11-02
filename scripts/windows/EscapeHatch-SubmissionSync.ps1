#Requires -Version 5.1
<#
  EscapeHatch's receipt-only scheduled sync. This task never opens an employer
  browser, clicks Submit, uses stored answers, or infers acceptance from a click.
  Register/Unregister are called by the explicitly requested app installer.

  SILENT_BACKGROUND (Automation PR #40): Task Scheduler Execute is pythonw.exe.
  powershell.exe is never the scheduled host — that console-subsystem entry is
  what flashes during meetings. Child Node uses the silent-launch bridge.
#>
[CmdletBinding()]
param(
    [ValidateSet('Run', 'Register', 'Inspect', 'Unregister', 'RepairSilence')]
    [string]$Action = 'Inspect',
    [string]$SourceRoot = '',
    [switch]$TestMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = if ($SourceRoot) { [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/') } else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
}
$worker = Join-Path $root 'artifacts\escape-hatch\submission-sync-worker.ts'
if (-not (Test-Path -LiteralPath $worker -PathType Leaf)) {
    throw 'SUBMISSION_SYNC_WORKER_MISSING: previous receipts and tracker are preserved.'
}
. (Join-Path $PSScriptRoot 'EscapeHatch-Toolchain.ps1')

$identity = $root.ToLowerInvariant()
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))
    $shortHash = ([BitConverter]::ToString($bytes)).Replace('-', '').Substring(0, 12).ToLowerInvariant()
} finally { $sha.Dispose() }
$taskName = 'EscapeHatch-SubmissionSync-' + $shortHash

function Resolve-Pythonw {
    $python = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $python) {
        $cand = Join-Path (Split-Path -Parent $python.Source) 'pythonw.exe'
        if (Test-Path -LiteralPath $cand -PathType Leaf) { return [IO.Path]::GetFullPath($cand) }
    }
    $byName = Get-Command pythonw -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $byName) { return [IO.Path]::GetFullPath($byName.Source) }
    throw 'SUBMISSION_SYNC_PYTHONW_MISSING: pythonw.exe is required for silent scheduled host'
}

$hostPy = Join-Path $PSScriptRoot 'submission_sync_silent_host.py'
$silentLaunch = Join-Path $PSScriptRoot 'submission-sync-silent-launch.cjs'
$psLegacy = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$legacyArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Action Run -SourceRoot "{1}"' -f $PSCommandPath, $root

function Get-SilentActionSpec {
    param([string]$NodePath)
    $pythonw = Resolve-Pythonw
    if (-not (Test-Path -LiteralPath $hostPy -PathType Leaf)) {
        throw 'SUBMISSION_SYNC_SILENT_HOST_MISSING'
    }
    $arg = '"{0}" --source-root "{1}" --node "{2}"' -f $hostPy, $root, $NodePath
    return [pscustomobject]@{
        Execute = $pythonw
        Arguments = $arg
    }
}

function Test-OwnedAction {
    param($ActionObj, [string]$NodePath)
    if ($null -eq $ActionObj) { return $false }
    $exe = [string]$ActionObj.Execute
    $arg = [string]$ActionObj.Arguments
    $spec = Get-SilentActionSpec -NodePath $NodePath
    if ([string]::Equals($exe, $spec.Execute, [StringComparison]::OrdinalIgnoreCase) -and
        [string]::Equals($arg, $spec.Arguments, [StringComparison]::Ordinal)) {
        return $true
    }
    # Legacy powershell host: owned when SourceRoot matches, even if -File points at
    # another EscapeHatch checkout (broadcastwell / sprint worktree). Enables RepairSilence.
    if ([string]::Equals($exe, $psLegacy, [StringComparison]::OrdinalIgnoreCase)) {
        $rootToken = '-SourceRoot "' + $root + '"'
        if ($arg -like '*-Action Run*' -and $arg.Contains($rootToken) -and
            $arg -match '(?i)EscapeHatch-SubmissionSync\.ps1') {
            return $true
        }
        if ([string]::Equals($arg, $legacyArgs, [StringComparison]::Ordinal)) {
            return $true
        }
    }
    # pythonw host from another checkout with the same SourceRoot.
    if ($exe -match '(?i)[/\\]pythonw\.exe$' -and
        $arg.Contains('--source-root "' + $root + '"') -and
        $arg -match '(?i)submission_sync_silent_host\.py') {
        return $true
    }
    return $false
}

function Get-OwnedTask {
    param([string]$NodePath)
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) { return $null }
    $actions = @($existing.Actions)
    if ($actions.Count -ne 1 -or -not (Test-OwnedAction -ActionObj $actions[0] -NodePath $NodePath)) {
        throw 'SUBMISSION_SYNC_FOREIGN_TASK: no unrelated scheduled task was changed.'
    }
    return $existing
}

function Test-IsPythonwHost {
    param($Task)
    $exe = [string]@($Task.Actions)[0].Execute
    return ($exe -match '(?i)[/\\]pythonw\.exe$')
}

if ($TestMode) {
    Write-Host ('ESCAPEHATCH_SUBMISSION_SYNC_TASK=TEST_MODE_NO_MUTATION:' + $Action)
    exit 0
}

$toolchain = Get-EscapeHatchToolchain -SourceRoot $root
$nodePath = [string]$toolchain.NodePath

if ($Action -eq 'Run') {
    # Manual/legacy entry: still hide the Node child. Scheduled ticks use pythonw host.
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    if (Test-Path -LiteralPath $silentLaunch -PathType Leaf) {
        $start.FileName = $nodePath
        $start.Arguments = ('"' + $silentLaunch + '" --root "' + $root + '" --node "' + $nodePath + '" --worker "' + $worker + '"')
    } else {
        $start.FileName = $nodePath
        $start.Arguments = '--experimental-strip-types "' + $worker + '"'
    }
    $child = [System.Diagnostics.Process]::Start($start)
    if ($null -eq $child) { throw 'SUBMISSION_SYNC_PROCESS_START_FAILED' }
    try {
        $child.WaitForExit()
        exit $child.ExitCode
    } finally {
        $child.Dispose()
    }
}

$existing = Get-OwnedTask -NodePath $nodePath
if ($Action -eq 'Inspect') {
    $state = if ($null -eq $existing) { 'ABSENT' } elseif (Test-IsPythonwHost -Task $existing) { 'OWNED_PYTHONW' } else { 'OWNED_LEGACY_POWERSHELL' }
    Write-Host ('ESCAPEHATCH_SUBMISSION_SYNC_TASK=' + $state)
    exit 0
}
if ($Action -eq 'Unregister') {
    if ($null -ne $existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop }
    Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=UNREGISTERED'
    exit 0
}

$spec = Get-SilentActionSpec -NodePath $nodePath
$taskAction = New-ScheduledTaskAction -Execute $spec.Execute -Argument $spec.Arguments
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

if ($Action -eq 'RepairSilence' -or ($null -ne $existing -and $Action -eq 'Register')) {
    if ($null -eq $existing) {
        throw 'SUBMISSION_SYNC_REPAIR_REQUIRES_OWNED_TASK'
    }
    # Preserve triggers and task name; rewrite Execute to pythonw + Hidden settings.
    Set-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $existing.Triggers -Settings $settings -Principal $principal -ErrorAction Stop | Out-Null
    $after = Get-OwnedTask -NodePath $nodePath
    if (-not $after.Settings.Hidden) { throw 'SUBMISSION_SYNC_SILENT_SETTINGS_READBACK_FAILED' }
    if (-not (Test-IsPythonwHost -Task $after)) { throw 'SUBMISSION_SYNC_PYTHONW_READBACK_FAILED' }
    Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=SILENCE_REPAIRED_PYTHONW'
    exit 0
}

if ($null -ne $existing) {
    Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=REGISTERED_EXISTING_SILENT'
    exit 0
}

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -ErrorAction Stop | Out-Null
$registered = Get-OwnedTask -NodePath $nodePath
if (-not $registered.Settings.Hidden) { throw 'SUBMISSION_SYNC_SILENT_SETTINGS_READBACK_FAILED' }
if (-not (Test-IsPythonwHost -Task $registered)) { throw 'SUBMISSION_SYNC_PYTHONW_READBACK_FAILED' }
Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=REGISTERED_SILENT_PYTHONW'
