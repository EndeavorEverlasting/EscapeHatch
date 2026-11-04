# Focus an ALREADY-OPEN EscapeHatch operator browser window. Never Start-Process
# a new browser profile, never open a LAN IP URL (Chrome HTTPS-First interstitial).
# Prefer title match on EscapeHatch tabs; optional navigate to localhost operator URL.
[CmdletBinding()]
param(
  [string]$TitleHint = 'EscapeHatch',
  [ValidateSet('None', 'Corridor', 'LanLocal', 'Custom')]
  [string]$Navigate = 'None',
  [string]$CustomUrl = '',
  [switch]$Json
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class EhOperatorBrowserFocus {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<string> ListVisible() {
    var hits = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      var t = sb.ToString();
      if (string.IsNullOrWhiteSpace(t)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT r; GetWindowRect(h, out r);
      hits.Add(string.Join("\t", new object[] { pid, h.ToInt64(), r.Left, r.Top, r.Right, r.Bottom, t }));
      return true;
    }, IntPtr.Zero);
    return hits;
  }
}
"@ | Out-Null

$browserNames = @('chrome', 'msedge', 'brave', 'firefox', 'Arc')
$browserPids = @(Get-Process -Name $browserNames -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id -Unique)

$candidates = @()
foreach ($row in [EhOperatorBrowserFocus]::ListVisible()) {
  $parts = $row -split "`t", 7
  if ($parts.Count -lt 7) { continue }
  $procId = [int]$parts[0]
  if ($browserPids -notcontains $procId) { continue }
  $title = $parts[6]
  if ($title -notmatch [regex]::Escape($TitleHint) -and $title -notmatch 'EscapeHatch') { continue }
  # Skip minimized ghost coords unless that is all we have
  $left = [int]$parts[2]; $top = [int]$parts[3]
  $score = 100
  if ($title -match [regex]::Escape($TitleHint)) { $score += 40 }
  if ($title -match 'Connect vault|corridor|phone|Pair') { $score += 20 }
  if ($left -le -10000) { $score -= 30 }
  $candidates += [pscustomobject]@{
    ProcessId = $procId
    Hwnd = [IntPtr]([int64]$parts[1])
    Left = $left; Top = $top; Right = [int]$parts[4]; Bottom = [int]$parts[5]
    Title = $title
    Score = $score
  }
}

if (-not $candidates) {
  $out = [ordered]@{
    ok = $false
    reason = 'no_escapehatch_browser_window'
    hint = 'Open/focus an existing EscapeHatch Chrome/Brave/Edge tab. Host will not Start-Process a new browser.'
  }
  if ($Json) { $out | ConvertTo-Json -Compress; exit 2 }
  Write-Output "ok=false reason=no_escapehatch_browser_window"
  exit 2
}

$pick = $candidates | Sort-Object Score -Descending | Select-Object -First 1
[EhOperatorBrowserFocus]::ShowWindow($pick.Hwnd, 9) | Out-Null
if ($pick.Left -le -10000 -or $pick.Top -le -10000) {
  [EhOperatorBrowserFocus]::MoveWindow($pick.Hwnd, 40, 40, 1280, 900, $true) | Out-Null
}
[EhOperatorBrowserFocus]::SetForegroundWindow($pick.Hwnd) | Out-Null
Start-Sleep -Milliseconds 350

$url = $null
switch ($Navigate) {
  'Corridor' { $url = 'http://127.0.0.1:18766/corridor' }
  'LanLocal' { $url = 'http://127.0.0.1:18765/' }
  'Custom' {
    if ($CustomUrl -match '(?i)^https?://(127\.0\.0\.1|localhost)(:\d+)?(/|$)') {
      $url = $CustomUrl
    } else {
      throw "CustomUrl must be localhost/127.0.0.1 only (refusing LAN IP / public hosts to avoid HTTPS-First interstitials and browser spray)."
    }
  }
}

if ($url) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.Clipboard]::SetText($url)
  Start-Sleep -Milliseconds 100
  # Ctrl+L focuses omnibox in Chromium; Ctrl+V pastes localhost URL; Enter navigates.
  [System.Windows.Forms.SendKeys]::SendWait('^l')
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 60
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

$out = [ordered]@{
  ok = $true
  selectedPid = $pick.ProcessId
  selectedHwnd = $pick.Hwnd.ToInt64()
  selectedTitle = $pick.Title
  selectedScore = $pick.Score
  navigated = $url
  candidateCount = $candidates.Count
  rule = 'attach_existing_title_match_no_start_process_no_lan_ip'
}
if ($Json) { $out | ConvertTo-Json -Compress; exit 0 }
Write-Output ("ok=true pid={0} hwnd={1} title={2} navigated={3}" -f $out.selectedPid, $out.selectedHwnd, $out.selectedTitle, $out.navigated)
exit 0
