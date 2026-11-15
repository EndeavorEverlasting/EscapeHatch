@echo off
setlocal
powershell.exe -NoLogo -NoProfile -File "%~dp0scripts\container\Launch.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" if "%~1"=="" pause
exit /b %RESULT%
