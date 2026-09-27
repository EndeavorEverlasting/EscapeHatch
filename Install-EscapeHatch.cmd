@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scripts\windows\Install-EscapeHatch.ps1" (
  echo ERROR: EscapeHatch installer orchestrator is missing.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Install-EscapeHatch.ps1" %*
exit /b %ERRORLEVEL%
