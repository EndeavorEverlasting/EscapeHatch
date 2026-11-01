# Canonical CLI for EscapeHatch career-browser PID selection / attach.
# Does not relaunch an owned progress session in AttachExisting/AttachOnly modes.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Status', 'CaptureBaseline', 'AttachExisting', 'AttachOnly', 'SelectAfterLaunch', 'BindReceipt')]
    [string]$Action,

    [string]$RepoRoot = $null,
    [Nullable[int]]$ExpectedAssistOriginPort = 21031,
    [string]$TargetHostHint = $null,
    [string]$BaselinePath = $null,
    [string]$AfterPath = $null,
    [string]$ReceiptPath = $null,
    [switch]$IncludeNonOwnedChrome,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
. (Join-Path $ScriptDir 'EscapeHatch-CareerBrowser-PidSelection.ps1')

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
}
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)

function Get-EhRepoFingerprint {
    param([string]$Root)
    $normalized = $Root.TrimEnd('\', '/').ToLowerInvariant()
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Get-EhCareerBrowserPaths {
    param([string]$Fingerprint)
    $base = Join-Path $env:LOCALAPPDATA "EscapeHatch\career-browser\$Fingerprint"
    return [pscustomobject]@{
        Dir = $base
        Receipt = Join-Path $base 'career-browser.json'
        Baseline = Join-Path $base 'baseline-snapshot.json'
        After = Join-Path $base 'after-snapshot.json'
    }
}

function Write-EhResult {
    param($Object)
    if ($Json) {
        $Object | ConvertTo-Json -Depth 10
    } else {
        $Object | ConvertTo-Json -Depth 6
    }
}

$fingerprint = Get-EhRepoFingerprint -Root $RepoRoot
$paths = Get-EhCareerBrowserPaths -Fingerprint $fingerprint
if (-not $BaselinePath) { $BaselinePath = $paths.Baseline }
if (-not $AfterPath) { $AfterPath = $paths.After }
if (-not $ReceiptPath) { $ReceiptPath = $paths.Receipt }

switch ($Action) {
    'Status' {
        $snap = Get-EhCareerBrowserProcessSnapshot -Label 'STATUS' -IncludeNonOwnedChrome:$IncludeNonOwnedChrome
        $selection = Select-EhCareerBrowserTarget `
            -Mode 'ATTACH_EXISTING' `
            -AfterSnapshot $snap `
            -ExpectedAssistOriginPort $ExpectedAssistOriginPort `
            -TargetHostHint $TargetHostHint
        $receipt = $null
        if (Test-Path -LiteralPath $ReceiptPath) {
            try { $receipt = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
        }
        Write-EhResult ([ordered]@{
            ok = $true
            action = 'Status'
            repoFingerprint = $fingerprint
            liveProcessCount = $snap.processCount
            attachPossible = [bool]$selection.ok
            selectionReason = $selection.selectionReason
            selectedPid = if ($selection.selected) { $selection.selected.pid } else { $null }
            selectedScore = if ($selection.selected) { $selection.selected.score } else { $null }
            selectedUserDataDir = if ($selection.selected) { $selection.selected.process.userDataDir } else { $null }
            receiptPath = $ReceiptPath
            receiptPresent = [bool]$receipt
            receiptPid = if ($receipt) { $receipt.pid } else { $null }
            candidates = @($selection.candidates | Select-Object -First 8 pid, score, eligible, signals, @{n='userDataDir';e={$_.process.userDataDir}}, @{n='title';e={$_.process.mainWindowTitle}})
        })
    }

    'CaptureBaseline' {
        $snap = Get-EhCareerBrowserProcessSnapshot -Label 'S1_pre_open' -IncludeNonOwnedChrome:$IncludeNonOwnedChrome
        Save-EhCareerBrowserProcessSnapshot -Snapshot $snap -OutputPath $BaselinePath | Out-Null
        Write-EhResult ([ordered]@{
            ok = $true
            action = 'CaptureBaseline'
            baselinePath = $BaselinePath
            processCount = $snap.processCount
            pids = @($snap.processes | ForEach-Object { $_.pid })
        })
    }

    'AttachExisting' {
        $snap = Get-EhCareerBrowserProcessSnapshot -Label 'S2_existing_session' -IncludeNonOwnedChrome:$IncludeNonOwnedChrome
        Save-EhCareerBrowserProcessSnapshot -Snapshot $snap -OutputPath $AfterPath | Out-Null
        $selection = Select-EhCareerBrowserTarget `
            -Mode 'ATTACH_EXISTING' `
            -AfterSnapshot $snap `
            -ExpectedAssistOriginPort $ExpectedAssistOriginPort `
            -TargetHostHint $TargetHostHint
        if (-not $selection.ok) {
            Write-EhResult ([ordered]@{
                ok = $false
                action = 'AttachExisting'
                selectionReason = $selection.selectionReason
                mayLaunch = $false
                message = 'No owned managed career browser found. Refuse relaunch here; use an explicit launch entrypoint only after operator consent.'
            })
            exit 2
        }
        $receipt = New-EhCareerBrowserReceipt -SelectionResult $selection -RepoFingerprint $fingerprint -AfterLabel $snap.label
        $dir = Split-Path -Parent $ReceiptPath
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        ($receipt | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
        Write-EhResult ([ordered]@{
            ok = $true
            action = 'AttachExisting'
            selectionReason = $selection.selectionReason
            receiptPath = $ReceiptPath
            pid = $receipt.pid
            userDataDir = $receipt.userDataDir
            score = $receipt.score
            signals = $receipt.signals
            mainWindowTitle = $receipt.mainWindowTitle
            mayLaunch = $false
            mayTerminate = $false
        })
    }

    'AttachOnly' {
        $snap = Get-EhCareerBrowserProcessSnapshot -Label 'S2_attach_only' -IncludeNonOwnedChrome:$IncludeNonOwnedChrome
        Save-EhCareerBrowserProcessSnapshot -Snapshot $snap -OutputPath $AfterPath | Out-Null
        $selection = Select-EhCareerBrowserTarget `
            -Mode 'ATTACH_ONLY' `
            -AfterSnapshot $snap `
            -ExpectedAssistOriginPort $ExpectedAssistOriginPort `
            -TargetHostHint $TargetHostHint
        if (-not $selection.ok) {
            Write-EhResult ([ordered]@{
                ok = $false
                action = 'AttachOnly'
                selectionReason = $selection.selectionReason
                mayLaunch = $false
                mayTerminate = $false
            })
            exit 2
        }
        $receipt = New-EhCareerBrowserReceipt -SelectionResult $selection -RepoFingerprint $fingerprint -AfterLabel $snap.label
        $dir = Split-Path -Parent $ReceiptPath
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        ($receipt | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
        Write-EhResult ([ordered]@{
            ok = $true
            action = 'AttachOnly'
            selectionReason = $selection.selectionReason
            receiptPath = $ReceiptPath
            pid = $receipt.pid
            userDataDir = $receipt.userDataDir
            score = $receipt.score
            signals = $receipt.signals
            mayLaunch = $false
            mayTerminate = $false
        })
    }

    'SelectAfterLaunch' {
        if (-not (Test-Path -LiteralPath $BaselinePath)) {
            throw "Baseline snapshot missing at $BaselinePath. Run -Action CaptureBaseline before opening Chrome."
        }
        $baseline = Get-Content -LiteralPath $BaselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $snap = Get-EhCareerBrowserProcessSnapshot -Label 'S2_after_open' -IncludeNonOwnedChrome:$IncludeNonOwnedChrome
        Save-EhCareerBrowserProcessSnapshot -Snapshot $snap -OutputPath $AfterPath | Out-Null
        $selection = Select-EhCareerBrowserTarget `
            -Mode 'SELECT_AFTER_LAUNCH' `
            -BaselineSnapshot $baseline `
            -AfterSnapshot $snap `
            -ExpectedAssistOriginPort $ExpectedAssistOriginPort `
            -TargetHostHint $TargetHostHint `
            -PreferNewPidWhenPresent
        if (-not $selection.ok) {
            Write-EhResult ([ordered]@{
                ok = $false
                action = 'SelectAfterLaunch'
                selectionReason = $selection.selectionReason
                diff = $selection.diff
            })
            exit 2
        }
        $receipt = New-EhCareerBrowserReceipt `
            -SelectionResult $selection `
            -RepoFingerprint $fingerprint `
            -BaselineLabel ([string]$baseline.label) `
            -AfterLabel $snap.label
        $dir = Split-Path -Parent $ReceiptPath
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        ($receipt | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
        Write-EhResult ([ordered]@{
            ok = $true
            action = 'SelectAfterLaunch'
            selectionReason = $selection.selectionReason
            receiptPath = $ReceiptPath
            pid = $receipt.pid
            userDataDir = $receipt.userDataDir
            score = $receipt.score
            signals = $receipt.signals
            newPids = @($selection.diff.newPids | ForEach-Object { $_.pid })
        })
    }

    'BindReceipt' {
        if (-not (Test-Path -LiteralPath $ReceiptPath)) { throw "Receipt missing: $ReceiptPath" }
        # ConvertFrom-Json turns ISO timestamps into DateTime; keep raw string for start-time reproof.
        $receiptMap = [ordered]@{}
        $raw = Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($prop in $raw.PSObject.Properties) { $receiptMap[$prop.Name] = $prop.Value }
        if ($receiptMap.Contains('processStartTimeUtc')) {
            $m = [regex]::Match((Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8), '"processStartTimeUtc"\s*:\s*"([^"]+)"')
            if ($m.Success) { $receiptMap.processStartTimeUtc = $m.Groups[1].Value }
        }
        $receipt = [pscustomobject]$receiptMap
        $live = Get-Process -Id ([int]$receipt.pid) -ErrorAction SilentlyContinue
        if (-not $live) {
            Write-EhResult ([ordered]@{ ok = $false; action = 'BindReceipt'; reason = 'process_exited'; receiptPid = $receipt.pid })
            exit 3
        }
        $rec = Get-EhCareerBrowserProcessRecord -Process $live
        $reproof = Test-EhCareerBrowserReceiptReproof -Receipt $receipt -LiveProcessRecord $rec
        Write-EhResult ([ordered]@{
            ok = [bool]$reproof.ok
            action = 'BindReceipt'
            receiptPid = $receipt.pid
            reproof = $reproof
            liveUserDataDir = $rec.userDataDir
            liveTitle = $rec.mainWindowTitle
        })
        if (-not $reproof.ok) { exit 4 }
    }
}
