@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\EscapeHatch-Install.ps1" -Action Install
exit /b %ERRORLEVEL%
