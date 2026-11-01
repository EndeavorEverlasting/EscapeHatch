#Requires -Version 5.1
<#
  EscapeHatch's receipt-only scheduled sync. This task never opens an employer
  browser, clicks Submit, uses stored answers, or infers acceptance from a click.
  Register/Unregister are called by the explicitly requested app installer.
#>
[CmdletBinding()]
param(
    [ValidateSet('Run', 'Register', 'Inspect', 'Unregister')]
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
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $ps -PathType Leaf)) { throw 'SUBMISSION_SYNC_POWERSHELL_MISSING' }
$argsExpected = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Action Run -SourceRoot "{1}"' -f $PSCommandPath, $root

function Get-OwnedTask {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) { return $null }
    $actions = @($existing.Actions)
    if ($actions.Count -ne 1 -or
        -not [string]::Equals([string]$actions[0].Execute, $ps, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([string]$actions[0].Arguments, $argsExpected, [StringComparison]::Ordinal)) {
        throw 'SUBMISSION_SYNC_FOREIGN_TASK: no unrelated scheduled task was changed.'
    }
    return $existing
}

if ($TestMode) {
    Write-Host ('ESCAPEHATCH_SUBMISSION_SYNC_TASK=TEST_MODE_NO_MUTATION:' + $Action)
    exit 0
}
if ($Action -eq 'Run') {
    $toolchain = Get-EscapeHatchToolchain -SourceRoot $root
    & $toolchain.NodePath --experimental-strip-types $worker
    exit $LASTEXITCODE
}
$existing = Get-OwnedTask
if ($Action -eq 'Inspect') {
    Write-Host ('ESCAPEHATCH_SUBMISSION_SYNC_TASK=' + $(if ($null -eq $existing) { 'ABSENT' } else { 'OWNED' }))
    exit 0
}
if ($Action -eq 'Unregister') {
    if ($null -ne $existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop }
    Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=UNREGISTERED'
    exit 0
}
if ($null -ne $existing) {
    Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=REGISTERED_EXISTING'
    exit 0
}
$null = Get-EscapeHatchToolchain -SourceRoot $root
# Interactive-token, least-privilege: no stored password, elevation, or browser access.
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$action = New-ScheduledTaskAction -Execute $ps -Argument $argsExpected
# Five-minute retry while signed in. An offline miss is recovered at next logon.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -ErrorAction Stop | Out-Null
$null = Get-OwnedTask
Write-Host 'ESCAPEHATCH_SUBMISSION_SYNC_TASK=REGISTERED'
