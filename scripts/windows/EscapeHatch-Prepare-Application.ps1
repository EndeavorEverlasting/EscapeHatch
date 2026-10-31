#Requires -Version 5.1
<#
.SYNOPSIS
  Deterministically open a saved opportunity, fill the shared EscapeHatch preference
  profile, arm the submission listener, and prove required-field readiness.

.DESCRIPTION
  Ensures the managed runtime is healthy, then runs scripts/prepare_managed_application.mjs.
  Default stops before Submit. Use -Submit -ConfirmedSubmit only after readiness is clean.

.EXAMPLE
  .\scripts\windows\EscapeHatch-Prepare-Application.ps1 -Company Broadcastwell

.EXAMPLE
  .\scripts\windows\EscapeHatch-Prepare-Application.ps1 -Company Broadcastwell -MotivationFile "$env:LOCALAPPDATA\EscapeHatch\broadcastwell-why-this-role.txt" -Submit -ConfirmedSubmit
#>
[CmdletBinding()]
param(
    [string]$Company,
    [string]$OpportunityId,
    [string]$Url,
    [string]$PublicResumeUrl = 'https://www.perezparallax.dev/static/resume/current.html',
    [string]$PortfolioUrl = 'https://www.perezparallax.dev',
    [string]$MotivationFile,
    [string]$ConsentLabel = 'Consent',
    [int]$Port = 21031,
    [switch]$Submit,
    [switch]$ConfirmedSubmit,
    [switch]$SkipRuntimeStart
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Runtime = Join-Path $RepoRoot 'scripts\windows\EscapeHatch-Runtime.ps1'
$Prepare = Join-Path $RepoRoot 'scripts\prepare_managed_application.mjs'
if (-not (Test-Path -LiteralPath $Prepare)) { throw "Missing prepare script: $Prepare" }

function Invoke-RuntimeStatus {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runtime -Action Status 2>&1 |
        Tee-Object -Variable statusLines | Out-Host
    return ($statusLines | Out-String)
}

if (-not $SkipRuntimeStart) {
    $statusText = Invoke-RuntimeStatus
    if ($statusText -notmatch 'ESCAPEHATCH_STATE=OWNED_HEALTHY' -and $statusText -notmatch 'OWNED_ADOPTABLE') {
        Write-Host 'Starting managed EscapeHatch runtime...'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runtime -Action Start
        Start-Sleep -Seconds 2
        $null = Invoke-RuntimeStatus
    }
}

$nodeArgs = @(
    $Prepare
    '--port', "$Port"
)
if ($Company) { $nodeArgs += @('--company', $Company) }
if ($OpportunityId) { $nodeArgs += @('--opportunity-id', $OpportunityId) }
if ($Url) { $nodeArgs += @('--url', $Url) }
if ($PublicResumeUrl) { $nodeArgs += @('--public-resume-url', $PublicResumeUrl) }
if ($PortfolioUrl) { $nodeArgs += @('--portfolio-url', $PortfolioUrl) }
if ($MotivationFile) { $nodeArgs += @('--motivation-file', $MotivationFile) }
if ($ConsentLabel) { $nodeArgs += @('--consent-label', $ConsentLabel) }
if ($Submit) { $nodeArgs += '--submit' }
if ($ConfirmedSubmit) { $nodeArgs += '--confirmed-submit' }

$env:PORT = "$Port"
Write-Host "RUNNING node $($nodeArgs -join ' ')"
& node @nodeArgs
exit $LASTEXITCODE
