@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0private-sync-nord-lan-window.ps1" -Mode RestoreOnly
pause
