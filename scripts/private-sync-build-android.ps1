# Build EscapeHatchAssist debug APK with a Gradle-compatible JDK (17/21).
# Android Studio JBR 25+ currently breaks Gradle 8.7 — prefer Temurin 21.
param(
  [string]$JavaHome = $(
    @(
      'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot',
      'C:\Program Files\Eclipse Adoptium\jdk-17*',
      'C:\Program Files\Microsoft\jdk-17*',
      'C:\Program Files\Java\jdk-17*'
    ) | ForEach-Object { Get-Item $_ -ErrorAction SilentlyContinue } |
      Select-Object -First 1 -ExpandProperty FullName
  )
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'android\application-assist'
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome 'bin\java.exe'))) {
  throw 'JDK_17_OR_21_REQUIRED (Android Studio JBR 25 is not usable with this Gradle)'
}
$ver = & (Join-Path $JavaHome 'bin\java.exe') -version 2>&1 | Out-String
if ($ver -match 'version "2[5-9]\.') {
  throw "JDK_TOO_NEW $JavaHome — use Temurin 17/21"
}
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"
Write-Output "JAVA_HOME=$JavaHome"
Push-Location $app
try {
  & .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "assembleDebug_failed=$LASTEXITCODE" }
} finally {
  Pop-Location
}
$apk = Join-Path $app 'app\build\outputs\apk\debug\app-debug.apk'
$od = Join-Path $env:USERPROFILE 'OneDrive\EscapeHatchPrivateSync'
if (Test-Path $apk) {
  if (Test-Path $od) {
    Copy-Item $apk (Join-Path $od 'EscapeHatchAssist-debug.apk') -Force
  }
  Copy-Item $apk (Join-Path $env:TEMP 'EscapeHatchAssist-debug.apk') -Force
  Write-Output "apk=$((Get-Item $apk).FullName) bytes=$((Get-Item $apk).Length)"
}
