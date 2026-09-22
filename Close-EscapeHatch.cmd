@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scripts\windows\EscapeHatch-Runtime.ps1" (
  echo ERROR: EscapeHatch lifecycle manager is missing.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Close-EscapeHatch.ps1"
exit /b %ERRORLEVEL%
