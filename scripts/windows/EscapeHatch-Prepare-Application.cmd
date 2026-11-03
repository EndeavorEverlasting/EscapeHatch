@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0EscapeHatch-Prepare-Application.ps1" %*
exit /b %ERRORLEVEL%
