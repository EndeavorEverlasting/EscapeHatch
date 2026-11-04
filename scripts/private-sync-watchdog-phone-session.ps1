# Keep phone-proof session helpers alive until threeOfThree or MaxHours.
# Never prints pairing codes or preference values. Never opens a Nord LAN window
# (operator-gated). Always attempts Nord RestoreOnly so a prior pause cannot stick.
param(
  [int]$MaxHours = 6,
  [int]$IntervalSeconds = 60
)
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
$ledger = Join-Path $od 'multidevice-proof-ledger.json'
$deadline = (Get-Date).AddHours([Math]::Max(1, $MaxHours))
$env:ESCAPEHATCH_EXPERIMENTAL_SYNC = '1'
if (-not $env:ESCAPEHATCH_DATA_HOME) {
  $env:ESCAPEHATCH_DATA_HOME = Join-Path $env:LOCALAPPDATA 'EscapeHatch'
}

function Test-PsScriptRunning([string]$Needle) {
  return [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match $Needle })
}

function Start-HiddenScript([string]$Rel, [string[]]$Args) {
  Start-Process -WindowStyle Hidden powershell -ArgumentList (
    @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot $Rel)) + $Args
  )
}

Write-Output "watchdog=start until=$($deadline.ToUniversalTime().ToString('o'))"
while ((Get-Date) -lt $deadline) {
  if (Test-Path $ledger) {
    try {
      $j = Get-Content $ledger -Raw | ConvertFrom-Json
      if ($j.threeOfThree -eq $true) {
        Write-Output 'watchdog=stop threeOfThree=true'
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'private-sync-nord-lan-window.ps1') -Mode RestoreOnly |
          ForEach-Object { Write-Output $_ }
        exit 0
      }
    } catch { }
  }
  if (Test-Path (Join-Path $od 'escapehatch-phone-sync-proof.json')) {
    # Kick a single ingest pass; long await may already be running.
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'private-sync-await-phone-proof.ps1') -WaitMinutes 0 |
      ForEach-Object { Write-Output $_ }
  }

  # Nord must not stay disconnected from a forgotten LAN window.
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'private-sync-nord-lan-window.ps1') -Mode RestoreOnly 2>$null | Out-Null

  if (-not (Test-PsScriptRunning 'private-sync-await-phone-proof\.ps1')) {
    Start-HiddenScript 'private-sync-await-phone-proof.ps1' @('-WaitMinutes', '360')
    Write-Output 'restarted=await-phone-proof'
  }
  if (-not (Test-PsScriptRunning 'private-sync-pairing-keepalive\.ps1')) {
    Start-HiddenScript 'private-sync-pairing-keepalive.ps1' @('-MaxHours', '6')
    Write-Output 'restarted=pairing-keepalive'
  }
  if (-not (Test-PsScriptRunning 'private-sync-watch-lan-phone\.ps1')) {
    Start-HiddenScript 'private-sync-watch-lan-phone.ps1' @('-WaitMinutes', '360')
    Write-Output 'restarted=watch-lan-phone'
  }
  if (-not (Test-PsScriptRunning 'AttachOnly')) {
    Start-HiddenScript 'private-sync-phone-proof.ps1' @('-AttachOnly', '-WaitMinutes', '360')
    Write-Output 'restarted=AttachOnly'
  }

  # LAN install server (Node) — keep health up without touching Nord.
  $lanOk = $false
  try {
    $null = Invoke-WebRequest 'http://127.0.0.1:18765/health' -UseBasicParsing -TimeoutSec 2
    $lanOk = $true
  } catch { $lanOk = $false }
  if (-not $lanOk) {
    Start-Process -WindowStyle Hidden -FilePath node -ArgumentList @(
      '--experimental-strip-types', 'private-sync-phone-lan-server.ts', $od, '18765'
    ) -WorkingDirectory (Join-Path $repo 'artifacts\escape-hatch')
    Write-Output 'restarted=lan18765'
  }

  Start-Sleep -Seconds ([Math]::Max(30, $IntervalSeconds))
}
Write-Output 'watchdog=timeout'
exit 2
