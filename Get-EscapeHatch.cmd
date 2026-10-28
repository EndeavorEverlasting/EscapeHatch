@echo off
setlocal EnableExtensions DisableDelayedExpansion
title EscapeHatch - Guided Setup
echo.
echo ESCAPEHATCH SETUP - PRIVATE, PRESERVATION-FIRST
echo This guided installer will ask before installing missing dependencies.
echo It uses an isolated source folder and never overwrites an existing project.
echo.
if not defined LOCALAPPDATA (
  echo ERROR: Windows LOCALAPPDATA is required.
  exit /b 2
)
set "SOURCE=%LOCALAPPDATA%\EscapeHatch\source"
echo Proposed application source folder:
echo   %SOURCE%
set "CHOOSE="
set /p "CHOOSE=Press Enter to accept, or type a different empty source folder: "
if defined CHOOSE set "SOURCE=%CHOOSE%"
if "%SOURCE%"=="" exit /b 2
echo.
where git.exe >nul 2>nul
if errorlevel 1 (
  echo MISSING: Git for Windows.
  where winget.exe >nul 2>nul
  if errorlevel 1 (
    echo Install Git for Windows from the official installer, then rerun this setup.
    exit /b 3
  )
  choice /C YN /N /M "Install Git for Windows with winget? [Y/N] "
  if errorlevel 2 exit /b 3
  winget install --id Git.Git --exact --source winget --accept-source-agreements --accept-package-agreements
  if errorlevel 1 exit /b 3
  echo Git installed. Restart this setup so your environment can discover it.
  exit /b 3
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo MISSING: Node.js LTS with npm. Installer minimum is Node 22.16.
  where winget.exe >nul 2>nul
  if errorlevel 1 (
    echo Install Node.js LTS from the official installer, then rerun this setup.
    exit /b 3
  )
  choice /C YN /N /M "Install Node.js LTS with winget? [Y/N] "
  if errorlevel 2 exit /b 3
  winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
  if errorlevel 1 exit /b 3
  echo Node installed. Restart this setup so your environment can discover it.
  exit /b 3
)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=16)?0:1)"
if errorlevel 1 (
  echo Node.js was found but does not meet the canonical 22.16 minimum.
  where winget.exe >nul 2>nul
  if errorlevel 1 (
    echo Install a supported Node.js LTS release, then rerun this setup.
    exit /b 3
  )
  choice /C YN /N /M "Upgrade Node.js LTS with winget? [Y/N] "
  if errorlevel 2 exit /b 3
  winget upgrade --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo Supported Node.js installation could not be verified.
    exit /b 3
  )
  echo Restart setup after the Node.js upgrade.
  exit /b 3
)
if exist "%SOURCE%" (
  if not exist "%SOURCE%\.git" (
    echo ERROR: The destination exists and is not an EscapeHatch Git checkout.
    echo It has NOT been modified. Select an empty folder or the original checkout.
    exit /b 4
  )
  git -C "%SOURCE%" remote get-url origin 2>nul | findstr /I /X /C:"https://github.com/EndeavorEverlasting/EscapeHatch.git" >nul
  if errorlevel 1 (
    echo ERROR: Existing checkout has a different remote. Preserved unchanged.
    exit /b 4
  )
  echo Existing EscapeHatch checkout found. Checking whether a safe update is available...
  call :safe_update_existing
  if errorlevel 1 exit /b 8
) else (
  echo.
  echo Ready to clone the canonical EscapeHatch source into:
  echo   %SOURCE%
  choice /C YN /N /M "Clone source from github.com/EndeavorEverlasting/EscapeHatch? [Y/N] "
  if errorlevel 2 exit /b 2
  git clone --depth 1 https://github.com/EndeavorEverlasting/EscapeHatch.git "%SOURCE%"
  if errorlevel 1 (
    echo ERROR: Clone failed. No existing workspace was changed.
    exit /b 5
  )
)
if not exist "%SOURCE%\scripts\windows\EscapeHatch-Install.ps1" (
  echo ERROR: Required canonical installer is absent in this source revision.
  echo Use a version containing the reviewed Windows installer before continuing.
  exit /b 6
)
echo.
echo The canonical installer will validate Node version, source ownership,
echo private workspace integrity, runtime ownership and Windows shortcuts.
choice /C YN /N /M "Install and launch EscapeHatch from this source? [Y/N] "
if errorlevel 2 exit /b 2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SOURCE%\scripts\windows\EscapeHatch-Install.ps1" -Action Bootstrap -SourceRoot "%SOURCE%"
if errorlevel 1 (
  echo ERROR: Installation or startup was not proven. Existing user data was preserved.
  exit /b 7
)
echo.
echo Setup handed off to the canonical owned runtime. No employer application was submitted.
exit /b 0

:safe_update_existing
rem Work only on a clean, unmodified main checkout; never reset, rebase, or force-pull.
git -C "%SOURCE%" symbolic-ref --quiet --short HEAD 2>nul | findstr /X /C:"main" >nul
if errorlevel 1 (
  echo Existing custom branch or detached checkout preserved. No automatic update.
  exit /b 0
)
set "EH_DIRTY="
for /f "delims=" %%L in ('git -C "%SOURCE%" status --porcelain 2^>nul') do set "EH_DIRTY=1"
if defined EH_DIRTY (
  echo Existing changes detected. No source update. Your files are preserved.
  exit /b 0
)
if not exist "%SOURCE%\scripts\windows\EscapeHatch-Runtime.ps1" (
  echo Runtime manager unavailable. Source update skipped to protect the installation.
  exit /b 0
)
rem Stop state must be proven by the owned runtime manager. Never update a running app.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SOURCE%\scripts\windows\EscapeHatch-Runtime.ps1" -Action Status 2>nul | findstr /X /C:"ESCAPEHATCH_STATE=STOPPED" >nul
if errorlevel 1 (
  echo Running or uncertain runtime preserved. No source update during an active session.
  exit /b 0
)
echo A safe fast-forward can update the bundled chick, guide, and application UI.
choice /C YN /N /M "Check for and install verified source updates? [Y/N] "
if errorlevel 2 exit /b 0
git -C "%SOURCE%" fetch --no-tags origin main
if errorlevel 1 (
  echo Could not fetch source updates. Existing checkout preserved.
  exit /b 1
)
git -C "%SOURCE%" merge --ff-only FETCH_HEAD
if errorlevel 1 (
  echo Update could not fast-forward safely. Existing checkout preserved.
  exit /b 1
)
echo Safe source update completed. Bundled assets will load with the refreshed app.
exit /b 0
