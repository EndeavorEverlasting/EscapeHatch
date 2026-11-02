#Requires -Version 5.1
<#
  Agent-trigger entrypoint for operator-cleared application completion.

  Default invocation performs preflight only. The agent may pass -ConfirmedComplete
  only for an explicitly authorized terminal action. Historical receipts block
  implicit completion until every prior attempt is reconciled, not replayed.

  Downstream:
    - managed-assist /listeners (ARMED)
    - managed-assist /submit-authorized (Playwright click + employer proof)
    - managed-submission-receipts.json
    - EscapeHatch-SubmissionSync (local queue + Google Sheet)

  Example:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\EscapeHatch-AgentCompleteApplication.ps1 `
      -AssistOrigin http://127.0.0.1:21031 `
      -OpportunityId tracker-broadcastwell-ai-automation-engineer-broadcastwell-com-careers-ai-automation-engineer-r35 `
      -EmployerName Broadcastwell

  This example is diagnostic only. An authorized terminal call must explicitly
  supply -ConfirmedComplete and, when historical evidence exists, the verified
  -ReconciledNotSubmitted and -ReconciledAttemptIds parameters.
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
    [string]$ReconciledAttemptIds = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = if ($SourceRoot) { [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/') } else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
}
$complete = Join-Path $PSScriptRoot 'EscapeHatch-CompleteApplication.ps1'
if (-not (Test-Path -LiteralPath $complete)) { throw 'COMPLETE_APPLICATION_SCRIPT_MISSING' }

# Agent handoff is NOT authorization to perform a terminal employer action.
$childArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $complete,
    '-AssistOrigin', $AssistOrigin, '-OpportunityId', $OpportunityId,
    '-EmployerName', $EmployerName, '-ApplicationUrl', $ApplicationUrl,
    '-SourceRoot', $root)
if ($ConfirmedComplete) { $childArgs += '-ConfirmedComplete' }
if ($ReconciledNotSubmitted) { $childArgs += '-ReconciledNotSubmitted' }
if ($ReconciledAttemptIds) { $childArgs += @('-ReconciledAttemptIds', $ReconciledAttemptIds) }
Write-Host ('ESCAPEHATCH_AGENT_TRIGGER=' + $(if ($ConfirmedComplete) { 'authorized-completion' } else { 'preflight-only' }))
& powershell.exe @childArgs
exit $LASTEXITCODE
