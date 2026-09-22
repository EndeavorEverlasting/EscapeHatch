<# EscapeHatch — One-click Windows launcher
   No pnpm / PORT / BASE_PATH / Vite / sh knowledge required.

   What it does:
   - Bypasses the pnpm preinstall wrapper that requires Unix `sh`
   - Starts the already-installed Vite runtime directly via node
   - Opens http://127.0.0.1:21031 in your default browser

   Usage (PowerShell):
     Right-click -> Run with PowerShell
     -or-  powershell -ExecutionPolicy Bypass -File .\Launch-EscapeHatch.ps1

   The sibling Launch-EscapeHatch.cmd does the same with no PowerShell policy hassle.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Resolve repo root (where this script lives) ---
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $RepoRoot

# --- Config (override by setting env before launch) ---
if (-not $env:PORT) { $env:PORT = "21031" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/" }
$Port = $env:PORT
$Url = "http://127.0.0.1:$Port"

# --- Checks ---
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "ERROR: node not found on PATH. Install Node 24 from https://nodejs.org" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}
Write-Host "Node $($(& node -v)) at $($node.Source)" -ForegroundColor Green

$viteJs = Join-Path $RepoRoot "artifacts\escape-hatch\node_modules\vite\bin\vite.js"
$viteConfig = Join-Path $RepoRoot "artifacts\escape-hatch\vite.config.ts"
if (-not (Test-Path -LiteralPath $viteJs)) {
  Write-Host "ERROR: Vite not found at $viteJs" -ForegroundColor Red
  Write-Host "Run: pnpm install  (or use Node-based installer) then re-launch." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"
  exit 1
}
if (-not (Test-Path -LiteralPath $viteConfig)) {
  Write-Host "ERROR: vite.config.ts missing at $viteConfig" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}
# Use relative paths for Start-Process to avoid quoting issues with spaces in $RepoRoot ("OneDrive - Northwell Health")
$viteJsRel = "artifacts\escape-hatch\node_modules\vite\bin\vite.js"
$viteConfigRel = "artifacts\escape-hatch\vite.config.ts"

# --- If already listening, just open browser ---
try {
  $existing = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
  if ($existing) {
    Write-Host "EscapeHatch already listening on $Url (PID $($existing.OwningProcess))" -ForegroundColor Cyan
    try { Invoke-WebRequest -Uri "$Url/" -TimeoutSec 3 -UseBasicParsing | Out-Null; Write-Host "Health check: OK (200)" -ForegroundColor Green } catch { Write-Host "Health check: no 200 yet, opening anyway..." -ForegroundColor Yellow }
    Write-Host "Opening $Url ..."
    Start-Process $Url | Out-Null
    Write-Host "Done. Keep this window open or close it - app stays running." -ForegroundColor Green
    exit 0
  }
} catch {}

# --- Start Vite directly (no pnpm, no sh) ---
Write-Host ""
Write-Host "Starting EscapeHatch at $Url ..." -ForegroundColor Cyan
Write-Host "  PORT=$Port  BASE_PATH=$env:BASE_PATH" -ForegroundColor DarkGray
Write-Host "  vite --config artifacts/escape-hatch/vite.config.ts --host 127.0.0.1 --port $Port --strictPort" -ForegroundColor DarkGray
Write-Host ""

$viteArgs = @($viteJsRel, "--config", $viteConfigRel, "--host", "127.0.0.1", "--port", $Port, "--strictPort")
# Resolve real node.exe (node on PATH is a .cmd shim that Start-Process cannot execute directly)
$nodeExe = $null
try { $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source } catch {}
if (-not $nodeExe -or -not (Test-Path -LiteralPath $nodeExe)) {
  $maybe = $node.Source -replace '\.cmd$','.exe'
  if (Test-Path -LiteralPath $maybe) { $nodeExe = $maybe } else { $nodeExe = "node.exe" }
}
Write-Host "  node: $nodeExe" -ForegroundColor DarkGray
Write-Host "  args: $viteArgs" -ForegroundColor DarkGray
# Start Vite as a child process; inherit env PORT/BASE_PATH
$proc = Start-Process -FilePath $nodeExe -ArgumentList $viteArgs -WorkingDirectory $RepoRoot -PassThru -WindowStyle Normal

# --- Wait for HTTP ready (bounded, 30s) ---
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if ($proc.HasExited) {
    Write-Host "Vite exited early with code $($proc.ExitCode)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit $proc.ExitCode
  }
  try {
    $resp = Invoke-WebRequest -Uri "$Url/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-Host "WARN: Vite did not return 200 within 30s, opening browser anyway..." -ForegroundColor Yellow
} else {
  Write-Host "EscapeHatch ready! (200 OK)" -ForegroundColor Green
}

Write-Host "Opening $Url ..."
Start-Process $Url | Out-Null
Write-Host ""
Write-Host "EscapeHatch is running. Leave this window open." -ForegroundColor Green
Write-Host "To stop: close the Vite window or run: Get-Process node | Stop-Process" -ForegroundColor DarkGray
# Keep launcher window open so user sees result; Vite runs in its own window
if ($Host.Name -eq 'ConsoleHost') {
  Read-Host "Press Enter to keep running (app stays open in background)" | Out-Null
}
