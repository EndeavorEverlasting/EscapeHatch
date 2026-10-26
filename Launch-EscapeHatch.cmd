@echo off
setlocal EnableExtensions
title EscapeHatch - Open
cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot enter the EscapeHatch checkout folder.
  echo Keep this launcher beside the repository scripts and try again.
  pause
  exit /b 1
)

if not defined PORT set "PORT=21031"
if not defined ESCAPEHATCH_NO_BROWSER set "ESCAPEHATCH_NO_BROWSER=0"
set "EH_BOOTSTRAP=%~dp0scripts\windows\EscapeHatch-Install.ps1"
set "EH_MANAGER=%~dp0scripts\windows\EscapeHatch-Runtime.ps1"

echo.
echo =====================================================
echo   EscapeHatch - open the local application
echo =====================================================
echo Folder: %CD%
echo Port:   %PORT%
echo.
echo [1/2] Checking the startup entrypoint...
if exist "%EH_BOOTSTRAP%" (
  echo [2/2] Starting through the installed/bootstrap recovery manager...
  echo This is the supported path after the Windows installer is integrated.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%EH_BOOTSTRAP%" -Action Bootstrap
) else (
  if not exist "%EH_MANAGER%" (
    echo [ERROR] Neither the Windows bootstrapper nor lifecycle manager is present.
    echo Recheck this folder against the canonical EscapeHatch checkout.
    pause
    exit /b 1
  )
  echo [2/2] Starting through the existing runtime manager...
  echo If startup fails, the real error and an actionable next step will stay here.
  rem Run in a separate powershell.exe process, NOT nested inside Launch-EscapeHatch.ps1.
  rem The nested PowerShell 5.1 call may leave the command window blank/hung.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%EH_MANAGER%" -Action Start
)
set "EH_RESULT=%ERRORLEVEL%"
echo.
if not "%EH_RESULT%"=="0" goto :failed
echo [OK] EscapeHatch startup command completed.
echo Open: http://127.0.0.1:%PORT%/
echo If the browser did not open, paste that address into the browser.
echo This window may now be closed. Status-EscapeHatch.cmd checks the running app.
timeout /t 8 /nobreak >nul
exit /b 0

:failed
echo [ERROR] EscapeHatch did not start successfully. Exit code: %EH_RESULT%
echo No unrelated processes were terminated by this launcher.
echo Check Status-EscapeHatch.cmd and the exact error printed above.
echo If dependencies are missing, the Windows installer remains owned by PR #95.
echo This window stays open so the error is visible.
pause
exit /b %EH_RESULT%
