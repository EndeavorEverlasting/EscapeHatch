# Deterministic local micro1 community preparation through EscapeHatch's owned managed Chrome.
# It opens the official Talent Platform, never signs in, joins Discord or submits an application.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Status', 'Prepare')]
    [string]$Action,
    [ValidateRange(1,65535)] [int]$Port = 21031,
    [string]$SourceOpportunityId = '',
    [string]$SourceUrl = '',
    [switch]$OperatorInitiated
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$origin = 'http://127.0.0.1:' + $Port
$communityId = 'talent-community:micro1:certified-experts'
$communityUrl = 'https://talent.micro1.ai/dashboard?discord=join'
$api = $origin + '/__escapehatch/managed-assist'
$headers = @{ Origin = $origin; 'x-escapehatch-operator-action' = 'confirmed' }

$workspace = Invoke-RestMethod -Uri ($origin + '/__escapehatch/workspace/status') -Method Get -TimeoutSec 15
if ($workspace.managed -ne $true -or $workspace.state -ne 'READY') {
    throw 'ESCAPEHATCH_PRIVATE_WORKSPACE_NOT_READY: recover the installed owner binding, not a fixture.'
}
$assist = Invoke-RestMethod -Uri ($api + '/status') -Method Get -TimeoutSec 15
if ($assist.ok -ne $true) { throw 'MANAGED_BROWSER_UNAVAILABLE' }
$listenerState = if ($assist.listeners -and $assist.listeners.submission) { [string]$assist.listeners.submission.state } else { 'NOT_BOUND' }

if ($Action -eq 'Status') {
    [pscustomobject]@{
        schema = 'escapehatch/micro1-community-preparation/v1'
        ok = $true
        workspace = 'READY'
        listener = $listenerState
        browser = [string]$assist.state
        portalUrl = $communityUrl
        membership = 'NOT_VERIFIED'
        authenticated = 'NOT_OBSERVED'
        submitIssued = $false
    } | ConvertTo-Json -Depth 5
    exit 0
}
if (-not $OperatorInitiated) {
    throw 'OPERATOR_INITIATED_ACTION_REQUIRED: no surprise foreground browser during silent jobs.'
}
if ($SourceOpportunityId -notmatch '^[A-Za-z0-9:_-]{1,160}$' -or [string]::IsNullOrWhiteSpace($SourceUrl)) {
    throw 'SOURCE_OPPORTUNITY_REQUIRED: resolve the existing micro1 job/account from the private workspace.'
}
try {
    $source = [Uri]$SourceUrl
    if ($source.Scheme -cne 'https' -or -not $source.IsDefaultPort -or $source.UserInfo -or
        $source.Host -notin @('talent.micro1.ai', 'www.micro1.ai', 'micro1.ai')) {
        throw 'source_invalid'
    }
} catch { throw 'SOURCE_URL_INVALID: source must be an owned micro1 HTTPS role/account page.' }
if ($listenerState -in @('ARMED', 'PENDING', 'PROCESSING')) {
    throw 'ACTIVE_SUBMISSION_LISTENER: preserve current browser session and reconcile it first.'
}
$payload = @{
    opportunityId = $communityId
    url = $communityUrl
    employerName = 'micro1 Certified Talent Community'
} | ConvertTo-Json -Compress
$launch = Invoke-RestMethod -Uri ($api + '/launch') -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -TimeoutSec 40
if ($launch.ok -ne $true) { throw 'MICRO1_PORTAL_LAUNCH_UNVERIFIED' }
[pscustomobject]@{
    schema = 'escapehatch/micro1-community-preparation/v1'
    ok = $true
    sourceOpportunityId = $SourceOpportunityId
    jobApplicationUnchanged = $true
    communityScope = $communityId
    browserState = [string]$launch.state
    inviteResolved = $false
    membership = 'NOT_VERIFIED'
    authenticated = 'NOT_OBSERVED'
    submitIssued = $false
    next = 'Use the authenticated Talent Platform Join Discord CTA; require consent and fresh guild membership proof.'
} | ConvertTo-Json -Depth 5
