# Cognizant talent-community preparation through the installed private EscapeHatch runtime.
# Never submits, opts into marketing, logs in, or mutates an existing job ledger.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Status', 'Prepare')]
    [string]$Action,
    [ValidateRange(1, 65535)] [int]$Port = 21031,
    [string]$SourceOpportunityId = '',
    [string]$SourceUrl = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$origin = 'http://127.0.0.1:' + $Port
$scopeId = 'talent-community:cognizant:us-en'
$scopeUrl = 'https://careers.cognizant.com/us-en/talent-community/'
$api = $origin + '/__escapehatch/managed-assist'
$headers = @{ Origin = $origin; 'x-escapehatch-operator-action' = 'confirmed' }

function Invoke-EhLocalPost {
    param([string]$Route, [hashtable]$Payload)
    return Invoke-RestMethod -Uri ($api + $Route) -Method Post -ContentType 'application/json' -Headers $headers -Body ($Payload | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 40
}

# Readiness does not confer employer submission authority.
$workspace = Invoke-RestMethod -Uri ($origin + '/__escapehatch/workspace/status') -Method Get -TimeoutSec 15
if ($workspace.managed -ne $true -or $workspace.state -ne 'READY') {
    throw 'EscapeHatch private workspace is not READY. Use its installed launcher and resolve context first.'
}
$assist = Invoke-RestMethod -Uri ($api + '/status') -Method Get -TimeoutSec 15
if ($assist.ok -ne $true) { throw 'Owned managed-browser controller is unavailable.' }
$listenerState = if ($assist.listeners -and $assist.listeners.submission) {
    [string]$assist.listeners.submission.state
} else { 'NOT_BOUND' }

if ($Action -eq 'Status') {
    [pscustomobject]@{
        ok = $true; workflow = 'cognizant_talent_community_profile'; workspace = 'READY'
        listener = $listenerState; currentBrowserState = [string]$assist.state
        employerUploadObserved = $false; enrollmentSubmitted = $false
    } | ConvertTo-Json -Depth 5
    exit 0
}
if ([string]::IsNullOrWhiteSpace($SourceOpportunityId) -or [string]::IsNullOrWhiteSpace($SourceUrl)) {
    throw 'The local agent must resolve the submitted Cognizant job ID and URL from the existing private workspace.'
}
if ($listenerState -in @('ARMED', 'PENDING', 'PROCESSING')) {
    throw 'An active application listener still owns a session. Preserve it and reconcile its evidence first.'
}

# Source identity, submitted status, reviewed PDF and exact bytes are verified by the host.
$reused = Invoke-EhLocalPost '/talent-community/cognizant/reuse-resume' @{
    sourceOpportunityId = $SourceOpportunityId; sourceUrl = $SourceUrl
}
if ($reused.ok -ne $true -or $reused.scope.opportunityId -ne $scopeId -or
    $reused.resume.reviewed -ne $true -or $reused.jobApplicationUnchanged -ne $true) {
    throw 'Reviewed source resume could not be bound to the independent talent-community scope.'
}

# Persistent Chrome reuses its exact existing tab without reloading any typed answer.
$launched = Invoke-EhLocalPost '/launch' @{
    opportunityId = $scopeId; url = $scopeUrl; employerName = 'Cognizant Talent Community'
}
if ($launched.ok -ne $true) { throw 'Managed talent-community browser launch was not verified.' }
[pscustomobject]@{
    ok = $true; workflow = 'cognizant_talent_community_profile'
    scopeId = $scopeId; scopeUrl = $scopeUrl
    reviewedResumeReuse = $true; sourceJobPreserved = $true
    browserState = [string]$launched.state
    requiresFormInspection = $true; requiresOperatorConsentAndSubmit = $true
    employerUploadObserved = $false; enrollmentSubmitted = $false
} | ConvertTo-Json -Depth 5
