$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$paths = @(
  (Join-Path $root 'scripts/windows/EscapeHatch-Discord-Bootstrap.ps1'),
  (Join-Path $root 'scripts/windows/EscapeHatch-micro1-community.ps1')
)
foreach ($scriptPath in $paths) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors -and $errors.Count -gt 0) { throw ('PowerShell parse failed for ' + $scriptPath + ': ' + $errors[0].Message) }
}
$helper = $paths[0]
$status = & $helper -Action Status | ConvertFrom-Json
if ($status.schema -cne 'escapehatch/discord-bootstrap-status/v2' -or
    $status.authenticated -cne 'NOT_OBSERVED' -or
    $status.membership -cne 'NOT_VERIFIED') { throw 'Discord bootstrap must not claim authentication or membership.' }
$blocked = $false
try { & $helper -Action OpenPartnerPortal -OpportunityId 'synthetic-opportunity' | Out-Null }
catch { $blocked = $_.Exception.Message -match 'UI_ACTION_CONSENT_REQUIRED' }
if (-not $blocked) { throw 'Opening a foreground partner browser without explicit operator initiation must be blocked.' }
$blocked = $false
try { & $helper -Action OpenInvite -OpportunityId 'synthetic-opportunity' -OperatorInitiated -InviteUrl 'https://discord.gg.evil.test/abcd' | Out-Null }
catch { $blocked = $_.Exception.Message -match 'INVALID_INVITE' }
if (-not $blocked) { throw 'Lookalike Discord invite must be rejected.' }
Write-Host 'DISCORD_BOOTSTRAP_GUARD=PASS'
