#Requires -Version 5.1
<#
  Focus-independent authorized Submit for a bound managed EscapeHatch page.

  This script never calls SetForegroundWindow, never moves the OS mouse, and
  never requires the employer Chrome window to own keyboard focus. The user may
  keep working in other apps. Progress is owned by:
    1) Playwright action inside the already-attached managed context
    2) ARMED submission listener / receipt files under %LOCALAPPDATA%\EscapeHatch
    3) EscapeHatch-SubmissionSync scheduled replay to Sheets/local queue

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-TrustedSubmit.ps1 `
      -AssistOrigin http://127.0.0.1:21031 `
      -OpportunityId tracker-broadcastwell-... `
      -ConfirmedSubmit
#>
[CmdletBinding()]
param(
    [string]$AssistOrigin = 'http://127.0.0.1:21031',
    [Parameter(Mandatory = $true)][string]$OpportunityId,
    [string]$EmployerName = '',
    [switch]$ConfirmedSubmit,
    [switch]$RearmOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$origin = $AssistOrigin.TrimEnd('/')
$headers = @{
    Origin = $origin
    'x-escapehatch-operator-action' = 'confirmed'
}

function Invoke-Assist([string]$Path, [hashtable]$Body) {
    $json = ($Body | ConvertTo-Json -Compress -Depth 6)
    return Invoke-RestMethod -Uri ($origin + '/__escapehatch/managed-assist' + $Path) -Method POST -Body $json -ContentType 'application/json' -Headers $headers -TimeoutSec 120
}

function Get-Status {
    return Invoke-RestMethod -Uri ($origin + '/__escapehatch/managed-assist/status') -TimeoutSec 15
}

function Assert-SubmitGone($Observation) {
    $buttons = @($Observation.buttons)
    if ($buttons -contains 'Submit application' -or $buttons -contains 'Submit Application') {
        throw 'SUBMIT_STILL_PRESENT: employer form still shows Submit; static page text is not a receipt.'
    }
}

$status = Get-Status
if (-not $status.browserOpen) { throw 'MANAGED_BROWSER_NOT_OPEN' }
if ($status.currentPage.opportunityId -ne $OpportunityId) {
    throw ('OPPORTUNITY_MISMATCH: live=' + $status.currentPage.opportunityId)
}

# Rearm on the already-bound Playwright page. No OS focus required.
$arm = Invoke-Assist '/listeners' @{
    opportunityId = $OpportunityId
    trackSubmission = $true
    recordAnswers = $true
    employerName = $EmployerName
}
if ($arm.listeners.submission.state -ne 'ARMED') {
    throw ('LISTENER_NOT_ARMED: ' + $arm.listeners.submission.state + ' / ' + $arm.listeners.submission.reason)
}
Write-Host ('ESCAPEHATCH_TRUSTED_SUBMIT=ARMED opportunity=' + $OpportunityId)
if ($RearmOnly) { exit 0 }
if (-not $ConfirmedSubmit) {
    Write-Host 'ESCAPEHATCH_TRUSTED_SUBMIT=READY_PASS_-ConfirmedSubmit_TO_CLICK_VIA_PLAYWRIGHT'
    exit 0
}

# Playwright click inside the managed context — does not need the window focused.
$result = Invoke-Assist '/submit-authorized' @{
    opportunityId = $OpportunityId
    confirmedSubmit = $true
}

# Broadcastwell/Framer may keep Submit visible; Framer HTTP 201 / CONFIRMED is the receipt.
$isBroadcastwell = $false
try {
  $liveUrl = [string](Get-Status).currentPage.pageUrl
  $isBroadcastwell = $liveUrl -match 'broadcastwell\.com/careers/ai-automation-engineer'
} catch { }

if ($result.state -ne 'CONFIRMED' -and -not $isBroadcastwell) {
    $observe = Invoke-Assist '/page-observe' @{}
    try {
        Assert-SubmitGone $observe.observation
    } catch {
        Write-Host 'ESCAPEHATCH_TRUSTED_SUBMIT=REJECTED_STATIC_OR_INCOMPLETE'
        Write-Host ('submission_state=' + $result.state)
        Write-Host ('matched=' + $result.observation.matched)
        throw
    }
} elseif ($result.state -ne 'CONFIRMED' -and $isBroadcastwell) {
    Write-Host 'ESCAPEHATCH_TRUSTED_SUBMIT=BROADCASTWELL_REQUIRES_FRAMER_201_OR_CONFIRMED'
    throw ('BROADCASTWELL_SUBMIT_NOT_CONFIRMED: state=' + $result.state)
}

Write-Host ('ESCAPEHATCH_TRUSTED_SUBMIT=' + $result.state)
Write-Host ('afterUrl=' + $result.afterUrl)
if ($result.listeners.submission.receipt) {
    Write-Host ('receiptAttemptId=' + $result.listeners.submission.receipt.attemptId)
}
$result | ConvertTo-Json -Depth 8 -Compress
exit 0
