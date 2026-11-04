# Watch LAN :18765 access log for a non-local phone client.
# Balloons when /apk, /offer, /capsule, or / is hit from another host.
# Never prints pairing codes or preference values.
param(
  [int]$WaitMinutes = 360,
  [string]$SelfIpv4 = ''
)
$ErrorActionPreference = 'Continue'
$log = Join-Path $env:TEMP 'eh-phone-lan-access.log'
$flag = Join-Path $env:TEMP 'eh-lan-phone-seen.flag'
$deadline = (Get-Date).AddMinutes([Math]::Max(1, $WaitMinutes))
if (-not $SelfIpv4) {
  $SelfIpv4 = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
      $_.IPAddress -like '192.168.*' -and $_.InterfaceAlias -match 'Wi-?Fi|WLAN'
    } | Select-Object -First 1 -ExpandProperty IPAddress)
}
Write-Output "watching=$log self=$SelfIpv4 until=$($deadline.ToUniversalTime().ToString('o'))"
$seen = @{}
while ((Get-Date) -lt $deadline) {
  if (Test-Path (Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync\escapehatch-phone-sync-proof.json')) {
    Write-Output 'phone_proof=seen lan_watch=stop'
    exit 0
  }
  if (Test-Path $log) {
    Get-Content $log -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object {
      $line = $_
      if ($line -notmatch '"remote"\s*:\s*"([^"]+)"') { return }
      $remote = $Matches[1] -replace '^::ffff:', ''
      if ($remote -in @('127.0.0.1', '::1', 'localhost', $SelfIpv4)) { return }
      # /health from a foreign host means companion LAN probe / beacon follow-up.
      if ($line -notmatch '"path"\s*:\s*"(/apk|/offer|/capsule|/|/index\.html|/proof|/health|/qr\.svg)"') { return }
      $key = "$remote|$($Matches[1])"
      if ($seen.ContainsKey($key)) { return }
      $seen[$key] = $true
      Write-Output "lan_phone_client remote=$remote path=$($Matches[1])"
      Set-Content -Path $flag -Value ((Get-Date).ToUniversalTime().ToString('o')) -NoNewline
      try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $ni = New-Object System.Windows.Forms.NotifyIcon
        $ni.Icon = [System.Drawing.SystemIcons]::Information
        $ni.Visible = $true
        $ni.ShowBalloonTip(
          20000,
          'EscapeHatch phone on LAN',
          "Device $remote hit the install server. Finish pair (TEMP code) → import → Send proof to PC.",
          [System.Windows.Forms.ToolTipIcon]::Info
        )
        Start-Sleep -Seconds 3
        $ni.Dispose()
      } catch {
        Write-Output 'balloon=skipped'
      }
      Start-Process 'http://127.0.0.1:18766/corridor' -ErrorAction SilentlyContinue
      $code = Join-Path $env:TEMP 'pairing-code.local.txt'
      if (Test-Path $code) { Start-Process notepad.exe $code }
    }
  }
  Start-Sleep -Seconds 5
}
Write-Output 'lan_watch=timeout'
exit 2
