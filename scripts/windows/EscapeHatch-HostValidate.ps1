# Local deterministic validation gate; never merges, pushes or opens foreground apps.
[CmdletBinding()]
param(
  [ValidateSet('Plan','Run','Verify')][string]$Action = 'Plan',
  [ValidateSet('Core','Full')][string]$Profile = 'Core',
  [string]$Receipt = '',
  [string]$PythonPath = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runner = Join-Path $root 'scripts\host_validation.py'
$python = $PythonPath
if (-not $python) {
  $command = Get-Command python.exe -ErrorAction SilentlyContinue
  if (-not $command) { throw 'PYTHON_MISSING: use the installed EscapeHatch toolchain.' }
  $python = $command.Source
}
$argsList = @($runner, $Action.ToLowerInvariant(), '--profile', $Profile.ToLowerInvariant(), '--root', $root)
if ($Action -eq 'Verify') {
  if (-not $Receipt) { throw 'RECEIPT_REQUIRED' }
  $argsList += @('--receipt', $Receipt)
}
& $python @argsList
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
