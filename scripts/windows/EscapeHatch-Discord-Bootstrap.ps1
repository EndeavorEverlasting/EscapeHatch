# Companion bootstrap for a user-initiated EscapeHatch community handoff.
# Discord is optional: browser-only joins remain valid. No credentials/self-bots.
[CmdletBinding()]
param(
  [ValidateSet('Status','Install','OpenPartnerPortal','OpenInvite')]
  [string]$Action = 'Status',
  [switch]$ApproveInstall,
  [switch]$OperatorInitiated,
  [string]$OpportunityId = '',
  [string]$InviteUrl = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$partnerEntry = 'https://talent.micro1.ai/dashboard?discord=join'
function Test-DiscordInstalled {
  if ($env:LOCALAPPDATA -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Discord\Update.exe') -PathType Leaf)) { return $true }
  return [bool](Get-Command 'Discord.exe' -ErrorAction SilentlyContinue)
}
function Test-DiscordInvite([string]$Value) {
  try {
    $uri = [Uri]$Value
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -cne 'https' -or
      -not [string]::IsNullOrWhiteSpace($uri.UserInfo) -or
      -not [string]::IsNullOrWhiteSpace($uri.Query) -or
      -not [string]::IsNullOrWhiteSpace($uri.Fragment) -or -not $uri.IsDefaultPort) { return $false }
    if ($uri.Host -ceq 'discord.gg') { return $uri.AbsolutePath -cmatch '^/[A-Za-z0-9_-]{2,64}/?$' }
    if ($uri.Host -ceq 'discord.com' -or $uri.Host -ceq 'www.discord.com') {
      return $uri.AbsolutePath -cmatch '^/invite/[A-Za-z0-9_-]{2,64}/?$'
    }
  } catch { return $false }
  return $false
}
function Write-Result([string]$Stage,[bool]$Installed,[string]$Next) {
  [pscustomobject]@{
    schema = 'escapehatch/discord-bootstrap-status/v2'
    stage = $Stage
    installed = $Installed
    opportunityBound = -not [string]::IsNullOrWhiteSpace($OpportunityId)
    partner = 'micro1'
    authenticated = 'NOT_OBSERVED'
    membership = 'NOT_VERIFIED'
    nextAction = $Next
  } | ConvertTo-Json -Compress
}
$installed = Test-DiscordInstalled
if ($Action -eq 'Status') {
  Write-Result 'STATUS' $installed 'Use partner portal sign-in; Discord desktop is optional.'
  exit 0
}
if ($Action -eq 'Install') {
  if ($installed) { Write-Result 'ALREADY_INSTALLED' $true 'Continue with browser sign-in'; exit 0 }
  if (-not $ApproveInstall -or -not $OperatorInitiated) {
    throw 'INSTALL_CONSENT_REQUIRED: explicit local approval and operator initiation are mandatory.'
  }
  $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'WINGET_MISSING: no arbitrary binary download fallback.' }
  & $winget.Source install --id Discord.Discord --exact --source winget --silent --disable-interactivity --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw ('DISCORD_INSTALL_FAILED: ' + $LASTEXITCODE) }
  $installed = Test-DiscordInstalled
  if (-not $installed) { throw 'DISCORD_INSTALL_UNVERIFIED' }
  Write-Result 'INSTALLED' $true 'Authenticate personally in the owned Discord session.'
  exit 0
}
if ($OpportunityId -notmatch '^[A-Za-z0-9:_-]{1,160}$') {
  throw 'OPPORTUNITY_BINDING_REQUIRED: retrieve the existing opportunity ID from private EscapeHatch.'
}
if (-not $OperatorInitiated) {
  throw 'UI_ACTION_CONSENT_REQUIRED: no surprise foreground windows during silent jobs.'
}
if ($Action -eq 'OpenPartnerPortal') {
  Start-Process -FilePath $partnerEntry
  Write-Result 'PARTNER_PORTAL_OPENED' $installed 'Sign into micro1; obtain server invite in the existing session.'
  exit 0
}
if (-not (Test-DiscordInvite $InviteUrl)) {
  throw 'INVALID_INVITE: only exact direct Discord invite origins accepted.'
}
Start-Process -FilePath $InviteUrl
Write-Result 'INVITE_OPENED' $installed 'Approve exact server membership personally; verify trusted membership readback.'
