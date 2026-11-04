@echo off
REM Double-click when the phone is ready for http://<pc>:18765/
REM Disconnects Nord briefly, then ALWAYS reconnects (APK hit / proof / 12 min).
REM Prefer OneDrive APK when possible so this window is unnecessary.
setlocal
set "SCRIPT=%~dp0private-sync-nord-lan-window.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Mode Open -MaxMinutes 12 -RestoreAfterForeignApk
echo.
echo If Nord did not reconnect: powershell -File "%SCRIPT%" -Mode RestoreOnly
pause
