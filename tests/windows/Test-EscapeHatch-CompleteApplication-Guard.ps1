#Requires -Version 5.1
# Non-network Windows regression: historic accepted-looking receipts must not
# trigger a terminal browser action, tracker write, or successful exit.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runner = Join-Path $root 'scripts\windows\EscapeHatch-CompleteApplication.ps1'
$wrapper = Join-Path $root 'scripts\windows\EscapeHatch-AgentCompleteApplication.ps1'

foreach ($file in @($runner, $wrapper)) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors)
    if (@($parseErrors).Count -gt 0) {
        throw ("PowerShell parser rejected {0}: {1}" -f $file, @($parseErrors)[0].Message)
    }
}

$text = [IO.File]::ReadAllText($runner)
$entry = [IO.File]::ReadAllText($wrapper)
if (($text.Split(@("Invoke-Assist '/submit-authorized'"), [StringSplitOptions]::None)).Count -ne 2) {
    throw 'The completion runner must contain exactly one terminal Submit invocation'
}
foreach ($forbidden in @('AllowDuplicateSubmit', 'FRAMER_STALE_RELOAD_REFILL_RETRY',
    'toggle-labeled-checkbox', 'ALREADY_SYNCED_NO_SUBMIT', 'RECOVER_EXISTING_FRAMER_201')) {
    if ($text.Contains($forbidden)) { throw ('Unsafe completion path returned: ' + $forbidden) }
}
if (-not $entry.Contains('if ($ConfirmedComplete)') -or
    -not $entry.Contains("preflight-only") -or
    -not $text.Contains('HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED_NO_SUBMIT')) {
    throw 'Missing explicit terminal authorization or operator-dispute gate'
}

$oldLocal = $env:LOCALAPPDATA
$temp = Join-Path ([IO.Path]::GetTempPath()) ('eh-completion-synthetic-' + [guid]::NewGuid().ToString('N'))
$privateRoot = Join-Path $temp 'EscapeHatch'
New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
try {
    $env:LOCALAPPDATA = $temp
    $id = 'synthetic-opportunity-not-real'
    $outbox = Join-Path $privateRoot 'submission-tracker-outbox.v1.json'
    [IO.File]::WriteAllText($outbox, (@{
        schema = 'escapehatch/submission-tracker-outbox/v1'
        entries = @(@{
            state = 'SYNCED'
            receipt = @{ opportunityId = $id; attemptId = 'synthetic-prior-201' }
        })
    } | ConvertTo-Json -Depth 8))
    # Two historical Framer attempts must both be considered. These are
    # synthetic files only; no real employer call or applicant data is involved.
    $proofDir = Join-Path $privateRoot 'proof'
    New-Item -ItemType Directory -Path $proofDir -Force | Out-Null
    foreach ($stamp in @('20260101T000000Z', '20260102T000000Z')) {
        [IO.File]::WriteAllText((Join-Path $proofDir ('broadcastwell-framer-201-' + $stamp + '.json')),
            (@{ opportunityId = $id; applicationUrl = 'https://synthetic.invalid/role';
                httpStatus = 201; evidenceCode = 'FRAMER_FORMS_HTTP_201';
                captured_at = $stamp } | ConvertTo-Json -Depth 6))
    }
    $before = [IO.File]::ReadAllText($outbox)
    $shell = Join-Path $PSHOME 'powershell.exe'
    $baseArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $runner,
        '-OpportunityId', $id, '-EmployerName', 'Synthetic',
        '-ApplicationUrl', 'https://synthetic.invalid/role')

    # Windows PowerShell 5.1 wraps child stderr as NativeCommandError; keep
    # the child's nonzero exit as the assertion instead of promoting stderr.
    $ErrorActionPreference = 'Continue'
    $output = (& $shell @baseArgs -ConfirmedComplete 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 4 -or $output -notmatch 'HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED_NO_SUBMIT') {
        throw ("Prior SYNCED evidence was not blocked before browser use: exit={0} output={1}" -f $LASTEXITCODE, $output)
    }
    $recovery = (& $shell @baseArgs -RecoverFromExistingProof 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 2 -or $recovery -notmatch 'RECOVERY_ONLY_NO_SUBMIT') {
        throw 'Recovery-only must be diagnostic, never an acceptance mutation'
    }
    $mismatch = (& $shell @baseArgs -ConfirmedComplete -ReconciledNotSubmitted -ReconciledAttemptIds wrong-attempt 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0 -or $mismatch -notmatch 'RECONCILIATION_ATTEMPT_SET_MISMATCH') {
        throw 'Mismatched historical attempt set must fail closed'
    }
    # An agent that reconciles only the latest Framer 201 cannot proceed.
    $incomplete = (& $shell @baseArgs -ConfirmedComplete -ReconciledNotSubmitted -ReconciledAttemptIds 'synthetic-prior-201,broadcastwell-framer-20260102T000000Z' 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0 -or $incomplete -notmatch 'RECONCILIATION_ATTEMPT_SET_MISMATCH') {
        throw 'Earlier Framer evidence was omitted from reconciliation'
    }
    $ErrorActionPreference = 'Stop'
    if ([IO.File]::ReadAllText($outbox) -ne $before) {
        throw 'Preflight mutated historical outbox'
    }
    if (Test-Path -LiteralPath (Join-Path $privateRoot 'managed-submission-receipts.json')) {
        throw 'A synthetic preflight unexpectedly wrote a new receipt'
    }
    Write-Host 'ESCAPEHATCH_COMPLETION_GUARD=PASS (PowerShell parse + historical-receipt / recovery / mismatch negatives)'
} finally {
    $env:LOCALAPPDATA = $oldLocal
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
