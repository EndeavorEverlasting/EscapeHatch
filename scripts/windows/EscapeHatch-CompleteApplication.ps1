#Requires -Version 5.1
<#
  EscapeHatch complete-application runner (focus-independent).

  When prerequisites are ready and -ConfirmedComplete is set, this script:
    1) Confirms managed assist + bound opportunity + Google connector + sync task
    2) Rearms listeners and clicks Submit via Playwright submit-authorized
       (Broadcastwell proof = Framer forms HTTP 201; UI may keep Submit visible)
    3) Writes a durable managed-submission receipt into %LOCALAPPDATA%\EscapeHatch
    4) Runs EscapeHatch-SubmissionSync once so local queue + Google Sheet update
    5) Prints a machine-readable completion receipt (no secrets)

  Recovery only: -RecoverFromExistingProof ingests a private Framer 201 without clicking.
  Agent trigger: checks existing synced receipts and recovers Framer 201 proof without duplicate clicks.

  Never uses SetForegroundWindow or OS mouse. The user may keep working elsewhere.

  Example:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-CompleteApplication.ps1 `
      -AssistOrigin http://127.0.0.1:21031 `
      -OpportunityId tracker-broadcastwell-ai-automation-engineer-broadcastwell-com-careers-ai-automation-engineer-r35 `
      -EmployerName Broadcastwell `
      -ConfirmedComplete
#>
[CmdletBinding()]
param(
    [string]$AssistOrigin = 'http://127.0.0.1:21031',
    [Parameter(Mandatory = $true)][string]$OpportunityId,
    [string]$EmployerName = 'Broadcastwell',
    [string]$ApplicationUrl = 'https://broadcastwell.com/careers/ai-automation-engineer',
    [string]$SourceRoot = '',
    [switch]$ConfirmedComplete,
    [switch]$ReconciledNotSubmitted,
    [string]$ReconciledAttemptIds = '',
    [switch]$RecoverFromExistingProof
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$origin = $AssistOrigin.TrimEnd('/')
$root = if ($SourceRoot) { [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/') } else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
}
$userData = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
$googleJson = Join-Path $env:LOCALAPPDATA 'TokenCorridor\connectors\google.json'
$receiptsFile = Join-Path $userData 'managed-submission-receipts.json'
$proofDir = Join-Path $userData 'proof'
$syncScript = Join-Path $root 'scripts\windows\EscapeHatch-SubmissionSync.ps1'
$headers = @{ Origin = $origin; 'x-escapehatch-operator-action' = 'confirmed' }

function Write-Step([string]$Message) { Write-Host ('ESCAPEHATCH_COMPLETE=' + $Message) }

function Invoke-Assist([string]$Path, [hashtable]$Body) {
    $json = ($Body | ConvertTo-Json -Compress -Depth 8)
    return Invoke-RestMethod -Uri ($origin + '/__escapehatch/managed-assist' + $Path) -Method POST -Body $json `
        -ContentType 'application/json' -Headers $headers -TimeoutSec 180
}

function Get-Status {
    return Invoke-RestMethod -Uri ($origin + '/__escapehatch/managed-assist/status') -TimeoutSec 20
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return (Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json)
}

function Save-Receipts([object[]]$Receipts) {
    $tmp = $receiptsFile + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    # Force a JSON array even when only one receipt exists (ConvertTo-Json collapses single objects).
    [IO.File]::WriteAllText($tmp, (@($Receipts) | ConvertTo-Json -Depth 10))
    node -e "const fs=require('fs'); const p=process.argv[1]; let d=JSON.parse(fs.readFileSync(p,'utf8')); if(!Array.isArray(d)) d=[d]; fs.writeFileSync(p, JSON.stringify(d));" $tmp
    Move-Item -LiteralPath $tmp -Destination $receiptsFile -Force
}

function Get-Framer201Proof {
    if (-not (Test-Path -LiteralPath $proofDir)) { return $null }
    $files = Get-ChildItem -LiteralPath $proofDir -Filter 'broadcastwell-framer-201-*.json' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    foreach ($file in $files) {
        $proof = Read-JsonFile $file.FullName
        if ($null -eq $proof) { continue }
        if ($proof.opportunityId -ne $OpportunityId) { continue }
        if ([string]$proof.applicationUrl -ne $ApplicationUrl) { continue }
        if ([int]$proof.httpStatus -ne 201) { continue }
        if ("$($proof.evidenceCode)" -ne 'FRAMER_FORMS_HTTP_201') { continue }
        return [pscustomobject]@{ Path = $file.FullName; Proof = $proof }
    }
    return $null
}

function New-ReceiptFromFramerProof($Proof, [string]$ProofPath) {
    $observed = ([datetime]::ParseExact([string]$Proof.captured_at, 'yyyyMMdd\THHmmss\Z', [Globalization.CultureInfo]::InvariantCulture)).ToUniversalTime().ToString('o')
    return [ordered]@{
        opportunityId = [string]$Proof.opportunityId
        sessionId = 'managed-broadcastwell'
        attemptId = ('broadcastwell-framer-' + [string]$Proof.captured_at)
        applicationOrigin = ([uri]$Proof.applicationUrl).GetLeftPart([UriPartial]::Authority)
        applicationPath = ([uri]$Proof.applicationUrl).AbsolutePath
        observedAt = $observed
        source = 'same_session_page_confirmation'
        evidenceCode = 'APPLICATION_RECEIVED_AFTER_USER_SUBMIT'
        matchedPhrase = 'FRAMER_FORMS_HTTP_201'
        privateProofPath = ('proof/' + [IO.Path]::GetFileName($ProofPath))
        privateEvidenceCode = 'FRAMER_FORMS_HTTP_201'
        framerFormId = [string]$Proof.framerFormId
        httpStatus = 201
    }
}

function Assert-Prerequisites {
    if (-not (Test-Path -LiteralPath $syncScript)) { throw 'SUBMISSION_SYNC_SCRIPT_MISSING' }
    if (-not (Test-Path -LiteralPath $googleJson)) { throw 'GOOGLE_CONNECTOR_MISSING: TokenCorridor connectors/google.json required' }
    $status = Get-Status
    if (-not $status.ok -or -not $status.browserOpen) { throw 'MANAGED_BROWSER_NOT_OPEN' }
    if ($status.currentPage.opportunityId -ne $OpportunityId) {
        throw ('OPPORTUNITY_NOT_BOUND: live=' + $status.currentPage.opportunityId)
    }
    $expectedUrl = [Uri]$ApplicationUrl
    $liveUrl = [Uri]([string]$status.currentPage.pageUrl)
    if ($expectedUrl.Scheme -ne 'https' -or
        -not [string]::Equals($expectedUrl.Host, $liveUrl.Host, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals($expectedUrl.AbsolutePath.TrimEnd('/'), $liveUrl.AbsolutePath.TrimEnd('/'), [StringComparison]::Ordinal)) {
        throw 'APPLICATION_URL_MISMATCH: exact job URL is not bound.'
    }
    $syncInspect = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Action Inspect -SourceRoot $root
    if (("$syncInspect") -notmatch 'OWNED|REGISTERED') {
        # Register silently if absent.
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Action Register -SourceRoot $root | Out-Host
    }
    return $status
}

Write-Step 'START'
# Existing network receipts/outbox entries are evidence to investigate, not an
# employer acceptance verdict; operator disputes veto stale replay (PR #174).
$priorOutbox = Read-JsonFile (Join-Path $userData 'submission-tracker-outbox.v1.json')
$priorReceipts = Read-JsonFile $receiptsFile
$framer = Get-Framer201Proof
$historicalAttempts = @()
if ($priorOutbox -and $priorOutbox.entries) {
    foreach ($item in @($priorOutbox.entries)) {
        if ($item.receipt.opportunityId -eq $OpportunityId -and $item.receipt.attemptId) {
            $historicalAttempts += [string]$item.receipt.attemptId
        }
    }
}
if ($priorReceipts) {
    foreach ($item in @($priorReceipts)) {
        if ($item.opportunityId -eq $OpportunityId -and $item.attemptId) {
            $historicalAttempts += [string]$item.attemptId
        }
    }
}
if ($null -ne $framer) {
    $historicalAttempts += ('broadcastwell-framer-' + [string]$framer.Proof.captured_at)
}
$historicalAttempts = @($historicalAttempts | Sort-Object -Unique)
# Recovery does not synthesize a new confirmation or write provider status.
if ($RecoverFromExistingProof) {
    Write-Step ('RECOVERY_ONLY_NO_SUBMIT historicalAttempts=' + $historicalAttempts.Count)
    exit 2
}
if ($historicalAttempts.Count -gt 0) {
    if (-not $ReconciledNotSubmitted) {
        Write-Step ('HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED_NO_SUBMIT count=' + $historicalAttempts.Count)
        exit 4
    }
    # Require every prior attempt to be accounted for, not merely the latest.
    $cleared = @($ReconciledAttemptIds.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Sort-Object -Unique)
    $missing = @($historicalAttempts | Where-Object { $cleared -notcontains $_ })
    $extra = @($cleared | Where-Object { $historicalAttempts -notcontains $_ })
    if ($missing.Count -gt 0 -or $extra.Count -gt 0) {
        throw 'RECONCILIATION_ATTEMPT_SET_MISMATCH'
    }
    Write-Step 'EXISTING_ATTEMPTS_EXPLICITLY_RECONCILED_NOT_ACCEPTED'
} elseif ($ReconciledNotSubmitted -or $ReconciledAttemptIds) {
    throw 'RECONCILIATION_WITHOUT_HISTORICAL_ATTEMPT'
}
$status = Assert-Prerequisites
Write-Step ('PREREQS_OK page=' + $status.currentPage.pageUrl)

if (-not $ConfirmedComplete) {
    Write-Step 'READY_PASS_-ConfirmedComplete_TO_RUN'
    exit 0
}

# One terminal attempt per invocation; uncertain outcome means stop and reconcile.
$beforeProofStamp = if ($null -ne $framer) { [string]$framer.Proof.captured_at } else { '' }
$submitStartedUtc = (Get-Date).ToUniversalTime().AddSeconds(-2)
$receipt = $null
Write-Step 'REARM_AND_SUBMIT_VIA_PLAYWRIGHT'
$arm = Invoke-Assist '/listeners' @{
    opportunityId = $OpportunityId
    trackSubmission = $true
    recordAnswers = $true
    employerName = $EmployerName
}
if ($arm.listeners.submission.state -ne 'ARMED') {
    throw ('LISTENER_NOT_ARMED: ' + $arm.listeners.submission.state)
}
$submit = Invoke-Assist '/submit-authorized' @{
    opportunityId = $OpportunityId
    confirmedSubmit = $true
}
# Never relaunch, toggle consent, refill, or retry after an ambiguous attempt.
    # Prefer a NEW Framer private proof, host CONFIRMED receipt, or listener CONFIRMED with Submit gone.
    Start-Sleep -Seconds 2
    $framer = Get-Framer201Proof
    $freshFramer = $false
    if ($null -ne $framer -and [string]$framer.Proof.captured_at -ne $beforeProofStamp) {
        try {
            $freshFramer = ([datetime]::ParseExact([string]$framer.Proof.captured_at,
                'yyyyMMdd\THHmmss\Z', [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() -ge $submitStartedUtc)
        } catch { $freshFramer = $false }
    }
    if ($submit.state -eq 'CONFIRMED' -and $submit.listeners.submission.receipt -and
        ([datetime]$submit.listeners.submission.receipt.observedAt).ToUniversalTime() -ge $submitStartedUtc) {
        $receipt = $submit.listeners.submission.receipt
        Write-Step 'SUBMIT_AUTHORIZED_CONFIRMED'
    } elseif ($freshFramer) {
        $receipt = New-ReceiptFromFramerProof $framer.Proof $framer.Path
        Write-Step 'FRAMER_201_CAPTURED_AFTER_SUBMIT'
    } elseif ($submit.listeners.submission.state -eq 'CONFIRMED' -and $submit.listeners.submission.receipt -and
              ([datetime]$submit.listeners.submission.receipt.observedAt).ToUniversalTime() -ge $submitStartedUtc) {
        # Accept only if Submit control is gone; Broadcastwell may keep Submit — require Framer proof instead.
        $observe = Invoke-Assist '/page-observe' @{}
        $buttons = @($observe.observation.buttons)
        if ($buttons -contains 'Submit application') {
            throw 'BROADCASTWELL_REQUIRES_FRAMER_201: Submit still present and no private Framer 201 proof found.'
        }
        $receipt = $submit.listeners.submission.receipt
        Write-Step 'LISTENER_CONFIRMED_SUBMIT_GONE'
    } else {
        throw ('SUBMIT_NOT_CONFIRMED_NO_RETRY: state=' + $submit.state + ' framer201=missing')
    }

# Durable local receipt archive (array)
$existing = @()
$raw = Read-JsonFile $receiptsFile
if ($raw -is [System.Array]) { $existing = @($raw) }
elseif ($null -ne $raw) { $existing = @($raw) }
if (-not ($existing | Where-Object { $_.attemptId -eq $receipt.attemptId })) {
    $existing += $receipt
    Save-Receipts $existing
    Write-Step ('RECEIPT_WRITTEN attemptId=' + $receipt.attemptId)
} else {
    Write-Step ('RECEIPT_EXISTS attemptId=' + $receipt.attemptId)
}

# Immediate sync pass (also covered by the 5-minute scheduled task)
Write-Step 'RUNNING_SUBMISSION_SYNC'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Action Run -SourceRoot $root
$syncExit = $LASTEXITCODE
Write-Step ('SUBMISSION_SYNC_EXIT=' + $syncExit)

$outbox = Read-JsonFile (Join-Path $userData 'submission-tracker-outbox.v1.json')
$entry = $null
if ($outbox -and $outbox.entries) {
    $entry = @($outbox.entries | Where-Object { $_.receipt.attemptId -eq $receipt.attemptId } | Select-Object -First 1)
}
$assist = Get-Status
$result = [ordered]@{
    schema = 'escapehatch/complete-application-result/v1'
    opportunityId = $OpportunityId
    applicationUrl = $ApplicationUrl
    receiptAttemptId = $receipt.attemptId
    outboxState = $(if ($entry) { $entry.state } else { 'MISSING' })
    trackerSync = $assist.trackerSync
    submissionListener = $assist.listeners.submission.state
    syncExitCode = $syncExit
    focusIndependent = $true
}
$result | ConvertTo-Json -Depth 8
if ($entry -and $entry.state -eq 'SYNCED') {
    Write-Step 'COMPLETE_SYNCED'
    exit 0
}
if ($entry -and $entry.state -in @('PENDING', 'AUTH_REQUIRED', 'RETRY_REQUIRED')) {
    Write-Step ('COMPLETE_QUEUED state=' + $entry.state)
    exit 2
}
Write-Step 'COMPLETE_WITH_GAPS'
exit 3
