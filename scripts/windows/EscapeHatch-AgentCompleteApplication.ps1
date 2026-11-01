#Requires -Version 5.1
<#
  Agent-trigger entrypoint for operator-cleared application completion.

  EscapeHatch agents and operators invoke THIS script after the user confirms the
  managed form is ready. It always performs the focus-independent Submit click
  path (never silently ingests a prior proof as a substitute for clicking).

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
#>
[CmdletBinding()]
param(
    [string]$AssistOrigin = 'http://127.0.0.1:21031',
    [Parameter(Mandatory = $true)][string]$OpportunityId,
    [string]$EmployerName = 'Broadcastwell',
    [string]$ApplicationUrl = 'https://broadcastwell.com/careers/ai-automation-engineer',
    [string]$SourceRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = if ($SourceRoot) { [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\', '/') } else {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
}
$complete = Join-Path $PSScriptRoot 'EscapeHatch-CompleteApplication.ps1'
if (-not (Test-Path -LiteralPath $complete)) { throw 'COMPLETE_APPLICATION_SCRIPT_MISSING' }

Write-Host 'ESCAPEHATCH_AGENT_TRIGGER=complete-application'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $complete `
    -AssistOrigin $AssistOrigin `
    -OpportunityId $OpportunityId `
    -EmployerName $EmployerName `
    -ApplicationUrl $ApplicationUrl `
    -SourceRoot $root `
    -ConfirmedComplete `
    -AllowDuplicateSubmit
exit $LASTEXITCODE
