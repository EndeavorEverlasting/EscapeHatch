@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scripts\windows\EscapeHatch-Runtime.ps1" (
  echo ERROR: EscapeHatch lifecycle manager is missing.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Status-EscapeHatch.ps1"
set "STATUS_EXIT=%ERRORLEVEL%"
echo.
echo Press any key to close this status window...
pause >nul
exit /b %STATUS_EXIT%
