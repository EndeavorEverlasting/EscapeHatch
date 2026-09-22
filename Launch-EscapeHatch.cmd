@echo off
REM EscapeHatch — One-click Windows launcher (no PowerShell policy issues)
REM Double-click this file. No pnpm / PORT / Vite / sh knowledge required.
REM Bypasses the Unix-only preinstall hook and runs Vite directly via node.

setlocal
cd /d "%~dp0"

if "%PORT%"=="" set PORT=21031
if "%BASE_PATH%"=="" set BASE_PATH=/

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: node not found on PATH. Install Node 24 from https://nodejs.org
  pause
  exit /b 1
)

if not exist "artifacts\escape-hatch\node_modules\vite\bin\vite.js" (
  echo ERROR: Vite not found at artifacts\escape-hatch\node_modules\vite\bin\vite.js
  echo Run pnpm install then re-launch, or ensure dependencies are installed.
  pause
  exit /b 1
)

REM Check if already listening on PORT
powershell -NoProfile -Command "try{ $c=Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'; if($c){exit 0}else{exit 1}} catch{exit 1}"
if %errorlevel%==0 (
  echo EscapeHatch already listening on http://127.0.0.1:%PORT%
  start "" "http://127.0.0.1:%PORT%/"
  echo Done.
  timeout /t 3 >nul
  exit /b 0
)

echo Starting EscapeHatch at http://127.0.0.1:%PORT%/ ...
echo   PORT=%PORT%  BASE_PATH=%BASE_PATH%

REM Launch Vite directly (no pnpm, no sh). Opens in a new window so this launcher can monitor.
start "EscapeHatch (Vite)" node "artifacts\escape-hatch\node_modules\vite\bin\vite.js" --config "artifacts\escape-hatch\vite.config.ts" --host 127.0.0.1 --port %PORT% --strictPort

echo Waiting for http://127.0.0.1:%PORT%/ (up to 30s)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:%PORT%/'; $d=(Get-Date).AddSeconds(30); while((Get-Date) -lt $d){ try{ $r=Invoke-WebRequest -Uri $u -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop; if($r.StatusCode -eq 200){ Write-Host 'Ready! (200 OK)' -ForegroundColor Green; exit 0 } } catch{}; Start-Sleep -Milliseconds 500 }; Write-Host 'WARN: no 200 within 30s, opening anyway' -ForegroundColor Yellow; exit 0"

echo Opening http://127.0.0.1:%PORT%/ ...
start "" "http://127.0.0.1:%PORT%/"

echo.
echo EscapeHatch is running. Leave the Vite window open.
echo To stop: close the "EscapeHatch (Vite)" window.
pause
