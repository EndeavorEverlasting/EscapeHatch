[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
$Manager = Join-Path $RepoRoot 'scripts\windows\EscapeHatch-Runtime.ps1'
$Launcher = Join-Path $RepoRoot 'Launch-EscapeHatch.ps1'
$ViteRoot = Join-Path $RepoRoot 'artifacts\escape-hatch'
$ViteJs = Join-Path $ViteRoot 'node_modules\vite\bin\vite.js'
$ViteConfig = Join-Path $ViteRoot 'vite.config.ts'
$RuntimeControl = Join-Path $ViteRoot 'runtime-control.ts'
$ForeignFixture = Join-Path $PSScriptRoot 'fixtures\foreign-listener.mjs'
$Port = 21031
$Origin = "http://127.0.0.1:$Port"

$previousEnv = @{
    PORT = $env:PORT
    BASE_PATH = $env:BASE_PATH
    ESCAPEHATCH_NO_BROWSER = $env:ESCAPEHATCH_NO_BROWSER
    ESCAPEHATCH_START_TIMEOUT_SECONDS = $env:ESCAPEHATCH_START_TIMEOUT_SECONDS
    ESCAPEHATCH_STOP_TIMEOUT_SECONDS = $env:ESCAPEHATCH_STOP_TIMEOUT_SECONDS
}
$env:PORT = [string]$Port
$env:BASE_PATH = '/'
$env:ESCAPEHATCH_NO_BROWSER = '1'
$env:ESCAPEHATCH_START_TIMEOUT_SECONDS = '10'
$env:ESCAPEHATCH_STOP_TIMEOUT_SECONDS = '5'

$foreignProcess = $null
$unmanagedProcess = $null
$unrelatedProcess = $null
$runtimeControlBackup = $null
$runtimeControlMutated = $false
$tempLogPaths = @()
$caseCount = 0

function Assert-True {
    param([bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Assert-Equal {
    param($Actual, $Expected, [Parameter(Mandatory)][string]$Message)
    if ($Actual -ne $Expected) {
        throw "ASSERTION FAILED: $Message (expected=$Expected actual=$Actual)"
    }
}

function Write-Case {
    param([Parameter(Mandatory)][string]$Name)
    $script:caseCount += 1
    Write-Host ("CASE {0:D2}: {1}" -f $script:caseCount, $Name) -ForegroundColor Cyan
}

function Get-RepoFingerprint {
    $normalized = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/').ToLowerInvariant()
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

$Fingerprint = Get-RepoFingerprint
$RuntimeDir = Join-Path $env:LOCALAPPDATA "EscapeHatch\runtime\$Fingerprint"
$ReceiptPath = Join-Path $RuntimeDir 'runtime.json'
$LogDir = Join-Path $env:LOCALAPPDATA "EscapeHatch\logs\$Fingerprint"

function Invoke-PowerShellEntryPoint {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string[]]$Arguments = @(),
        [int[]]$ExpectedExitCodes = @(0),
        [int]$TimeoutSeconds = 45
    )
    $stamp = [Guid]::NewGuid().ToString('N')
    $stdout = Join-Path $env:TEMP "eh-entry-$stamp.out.log"
    $stderr = Join-Path $env:TEMP "eh-entry-$stamp.err.log"
    $script:tempLogPaths += @($stdout, $stderr)
    $processArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $Path + '"')) + $Arguments
    $process = Start-Process powershell.exe -ArgumentList $processArgs -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch {}
        $partial = @(
            if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue }
        ) -join [Environment]::NewLine
        throw ("PowerShell entry point {0} exceeded {1}s. Partial output: {2}" -f $Path, $TimeoutSeconds, $partial)
    }
    $process.Refresh()
    $output = @(
        if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue }
    ) -join [Environment]::NewLine
    $code = $process.ExitCode
    if ($ExpectedExitCodes -notcontains $code) {
        throw "PowerShell entry point $Path exit $code; expected $($ExpectedExitCodes -join ','). Output: $output"
    }
    [PSCustomObject]@{
        ExitCode = $code
        Output = $output
    }
}

function Invoke-Manager {
    param(
        [Parameter(Mandatory)][ValidateSet('Start','Stop','Restart','Status')][string]$Action,
        [int[]]$ExpectedExitCodes = @(0)
    )
    Invoke-PowerShellEntryPoint -Path $Manager -Arguments @('-Action', $Action) -ExpectedExitCodes $ExpectedExitCodes
}

function Get-ListenerPids {
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { [int]$_.LocalPort -eq $Port } |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Wait-ForListener {
    param([int]$TimeoutSeconds = 10)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $pids = @(Get-ListenerPids)
        if ($pids.Count -eq 1) { return [int]$pids[0] }
        if ($pids.Count -gt 1) { throw "Ambiguous listeners on port $Port." }
        Start-Sleep -Milliseconds 200
    }
    throw "Port $Port did not become ready within $TimeoutSeconds seconds."
}

function Wait-ForNoListener {
    param([int]$TimeoutSeconds = 10)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (@(Get-ListenerPids).Count -eq 0) { return }
        Start-Sleep -Milliseconds 200
    }
    throw "Port $Port remained occupied after $TimeoutSeconds seconds."
}

function Test-ProcessAlive {
    param([int]$ProcessId)
    try {
        Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-Identity {
    Invoke-RestMethod -Method Get -Uri "$Origin/__escapehatch/runtime" -TimeoutSec 3 -ErrorAction Stop
}

function Read-Receipt {
    if (-not (Test-Path -LiteralPath $ReceiptPath -PathType Leaf)) { return $null }
    Get-Content -LiteralPath $ReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-FixtureReceipt {
    param(
        [int]$ProcessId,
        [string]$ProcessStartTimeUtc,
        [string]$InstanceId = 'fixture-instance'
    )
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    @{
        schema = 'escapehatch-local-runtime/v1'
        instanceId = $InstanceId
        repoFingerprint = $Fingerprint
        pid = $ProcessId
        processStartTimeUtc = $ProcessStartTimeUtc
        host = '127.0.0.1'
        port = $Port
        runtimeProtocol = 1
        shutdownToken = 'synthetic-fixture-token'
        startedAtUtc = '2026-09-22T00:00:00.0000000Z'
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
}

function Start-UnmanagedVite {
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $stamp = [Guid]::NewGuid().ToString('N')
    $out = Join-Path $env:TEMP "eh-unmanaged-$stamp.out.log"
    $err = Join-Path $env:TEMP "eh-unmanaged-$stamp.err.log"
    $script:tempLogPaths += @($out, $err)
    $args = @(
        ('"' + $ViteJs + '"'),
        '--config', ('"' + $ViteConfig + '"'),
        '--host', '127.0.0.1',
        '--port', [string]$Port,
        '--strictPort'
    )

    $managedNames = @(
        'ESCAPEHATCH_INSTANCE_ID',
        'ESCAPEHATCH_REPO_FINGERPRINT',
        'ESCAPEHATCH_SHUTDOWN_TOKEN',
        'ESCAPEHATCH_STARTED_AT_UTC',
        'ESCAPEHATCH_RUNTIME_PROTOCOL'
    )
    $savedManagedEnv = @{}
    foreach ($name in $managedNames) {
        $savedManagedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    try {
        Start-Process -FilePath $nodeExe -ArgumentList $args -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    } finally {
        foreach ($name in $managedNames) {
            [Environment]::SetEnvironmentVariable($name, $savedManagedEnv[$name], 'Process')
        }
    }
}

function Start-ForeignListener {
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $stamp = [Guid]::NewGuid().ToString('N')
    $out = Join-Path $env:TEMP "eh-foreign-$stamp.out.log"
    $err = Join-Path $env:TEMP "eh-foreign-$stamp.err.log"
    $script:tempLogPaths += @($out, $err)
    Start-Process -FilePath $nodeExe -ArgumentList @(('"' + $ForeignFixture + '"')) -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
}

function Invoke-ConcurrentStarts {
    $stamp = [Guid]::NewGuid().ToString('N')
    $out1 = Join-Path $env:TEMP "eh-concurrent-$stamp-1.out.log"
    $err1 = Join-Path $env:TEMP "eh-concurrent-$stamp-1.err.log"
    $out2 = Join-Path $env:TEMP "eh-concurrent-$stamp-2.out.log"
    $err2 = Join-Path $env:TEMP "eh-concurrent-$stamp-2.err.log"
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $Manager + '"'),'-Action','Start')
    $p1 = Start-Process powershell.exe -ArgumentList $args -PassThru -RedirectStandardOutput $out1 -RedirectStandardError $err1
    $p2 = Start-Process powershell.exe -ArgumentList $args -PassThru -RedirectStandardOutput $out2 -RedirectStandardError $err2
    $script:tempLogPaths += @($out1, $err1, $out2, $err2)
    $p1Done = $p1.WaitForExit(45000)
    $p2Done = $p2.WaitForExit(45000)
    if (-not $p1Done -or -not $p2Done) {
        foreach ($p in @($p1, $p2)) {
            try {
                $p.Refresh()
                if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction Stop }
            } catch {}
        }
        $detail = @(
            if (Test-Path -LiteralPath $out1) { Get-Content -LiteralPath $out1 -Raw -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $err1) { Get-Content -LiteralPath $err1 -Raw -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $out2) { Get-Content -LiteralPath $out2 -Raw -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $err2) { Get-Content -LiteralPath $err2 -Raw -ErrorAction SilentlyContinue }
        ) -join [Environment]::NewLine
        throw "Concurrent Start exceeded 45 seconds. Output: $detail"
    }
    Assert-Equal $p1.ExitCode 0 "first concurrent Start must succeed"
    Assert-Equal $p2.ExitCode 0 "second concurrent Start must succeed"
}

function Stop-TestOwnedProcess {
    param($Process)
    if ($null -eq $Process) { return }
    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction Stop
            $Process.WaitForExit()
        }
    } catch {}
}

function Assert-ScriptParses {
    param([Parameter(Mandatory)][string]$Path)
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -gt 0) {
        $detail = $errors | ForEach-Object {
            "{0}:{1}:{2}: {3}" -f $_.Extent.File, $_.Extent.StartLineNumber, $_.Extent.StartColumnNumber, $_.Message
        } | Out-String
        throw ("PowerShell parse errors in {0}: {1}" -f $Path, $detail)
    }
}

try {
    Assert-True (Test-Path -LiteralPath $Manager -PathType Leaf) "lifecycle manager must exist"
    Assert-True (Test-Path -LiteralPath $ViteJs -PathType Leaf) "Vite runtime must be installed before lifecycle tests"
    Assert-True (Test-Path -LiteralPath $ForeignFixture -PathType Leaf) "foreign listener fixture must exist"
    Assert-ScriptParses -Path $Manager
    Assert-ScriptParses -Path $Launcher

    Invoke-Manager -Action Stop | Out-Null
    $initialPids = @(Get-ListenerPids)
    Assert-Equal $initialPids.Count 0 "test runner port $Port must be free after safe managed-runtime cleanup"

    Write-Case 'cold start creates one healthy instance'
    Invoke-Manager -Action Start | Out-Null
    $identity1 = Get-Identity
    $receipt1 = Read-Receipt
    Assert-Equal ([string]$identity1.app) 'EscapeHatch' 'identity app'
    Assert-Equal ([int]$identity1.protocol) 1 'identity protocol'
    Assert-Equal ([int]$identity1.pid) ([int]$receipt1.pid) 'receipt and identity PID'
    Assert-Equal @(Get-ListenerPids).Count 1 'cold start listener count'

    Write-Case 'second start reuses the same instance and PID'
    Invoke-Manager -Action Start | Out-Null
    $identity2 = Get-Identity
    Assert-Equal ([string]$identity2.instanceId) ([string]$identity1.instanceId) 'second Start instanceId reuse'
    Assert-Equal ([int]$identity2.pid) ([int]$identity1.pid) 'second Start PID reuse'

    Write-Case 'concurrent starts converge to one instance'
    Invoke-Manager -Action Stop | Out-Null
    Invoke-ConcurrentStarts
    $concurrentIdentity = Get-Identity
    Assert-Equal @(Get-ListenerPids).Count 1 'concurrent Start listener count'
    Assert-True ([int]$concurrentIdentity.pid -gt 0) 'concurrent Start identity PID'

    Write-Case 'graceful stop frees port 21031'
    $gracefulPid = [int]$concurrentIdentity.pid
    $gracefulStarted = Get-Date
    $gracefulStop = Invoke-Manager -Action Stop
    $gracefulElapsed = ((Get-Date) - $gracefulStarted).TotalSeconds
    Assert-True ($gracefulStop.Output -notmatch 'Graceful shutdown request failed') 'healthy Stop must not report graceful shutdown request failure'
    Assert-True ($gracefulElapsed -lt ([int]$env:ESCAPEHATCH_STOP_TIMEOUT_SECONDS)) 'healthy Stop must complete before the forced-fallback timeout'
    Wait-ForNoListener
    Assert-True (-not (Test-ProcessAlive -ProcessId $gracefulPid)) 'gracefully stopped PID must exit'

    Write-Case 'second stop is idempotent success'
    $secondStop = Invoke-Manager -Action Stop
    Assert-Equal $secondStop.ExitCode 0 'second Stop exit code'

    Write-Case 'stale receipt with no process self-heals'
    Write-FixtureReceipt -ProcessId 2147483000 -ProcessStartTimeUtc '2000-01-01T00:00:00.0000000Z' -InstanceId 'stale-fixture'
    Invoke-Manager -Action Start | Out-Null
    $staleRecovery = Get-Identity
    Assert-True ([string]$staleRecovery.instanceId -ne 'stale-fixture') 'stale receipt must not be adopted'
    Invoke-Manager -Action Stop | Out-Null

    Write-Case 'same-repo healthy orphan is adopted without secret reconstruction'
    Invoke-Manager -Action Start | Out-Null
    $orphanBefore = Get-Identity
    Remove-Item -LiteralPath $ReceiptPath -Force
    Invoke-Manager -Action Start | Out-Null
    $orphanAfter = Get-Identity
    Assert-Equal ([string]$orphanAfter.instanceId) ([string]$orphanBefore.instanceId) 'healthy orphan instance must be reused'
    Assert-Equal ([int]$orphanAfter.pid) ([int]$orphanBefore.pid) 'healthy orphan PID must be reused'
    Assert-True (-not (Test-Path -LiteralPath $ReceiptPath)) 'adoption must not reconstruct missing shutdown secret'
    Invoke-Manager -Action Stop | Out-Null
    Wait-ForNoListener

    Write-Case 'same-repo unhealthy Vite process is recovered'
    $unmanagedProcess = Start-UnmanagedVite
    $unmanagedPid = Wait-ForListener
    Assert-Equal $unmanagedPid $unmanagedProcess.Id 'unmanaged Vite must own test port'
    $unmanagedPayload = $null
    try {
        $unmanagedPayload = Invoke-RestMethod -Method Get -Uri "$Origin/__escapehatch/runtime" -TimeoutSec 2 -ErrorAction Stop
    } catch {}
    $unmanagedLooksManaged = $false
    if ($null -ne $unmanagedPayload) {
        $appProperty = $unmanagedPayload.PSObject.Properties['app']
        $protocolProperty = $unmanagedPayload.PSObject.Properties['protocol']
        $repoProperty = $unmanagedPayload.PSObject.Properties['repoFingerprint']
        $pidProperty = $unmanagedPayload.PSObject.Properties['pid']
        if ($null -ne $appProperty -and $null -ne $protocolProperty -and $null -ne $repoProperty -and $null -ne $pidProperty) {
            $unmanagedLooksManaged = (
                [string]$appProperty.Value -eq 'EscapeHatch' -and
                [int]$protocolProperty.Value -eq 1 -and
                [string]$repoProperty.Value -eq $Fingerprint -and
                [int]$pidProperty.Value -eq $unmanagedProcess.Id
            )
        }
    }
    Assert-True (-not $unmanagedLooksManaged) 'unmanaged Vite response must not validate as managed EscapeHatch identity'
    Invoke-Manager -Action Start | Out-Null
    $recoveredIdentity = Get-Identity
    Assert-True ([int]$recoveredIdentity.pid -ne [int]$unmanagedProcess.Id) 'manager must replace unhealthy same-repo Vite'
    Assert-True (-not (Test-ProcessAlive -ProcessId $unmanagedProcess.Id)) 'unhealthy same-repo Vite must exit after ownership proof'
    $unmanagedProcess = $null
    Invoke-Manager -Action Stop | Out-Null

    Write-Case 'unrelated port listener survives untouched'
    $foreignProcess = Start-ForeignListener
    Assert-Equal (Wait-ForListener) $foreignProcess.Id 'foreign fixture must own test port'
    $foreignStart = Invoke-PowerShellEntryPoint -Path $Launcher -ExpectedExitCodes @(1)
    Assert-True ($foreignStart.Output -match 'cannot prove|unproven|FOREIGN|will not terminate') 'foreign launcher Start must explain refusal'
    Assert-True (Test-ProcessAlive -ProcessId $foreignProcess.Id) 'foreign process must survive launcher Start'
    Invoke-Manager -Action Stop -ExpectedExitCodes @(1) | Out-Null
    Assert-True (Test-ProcessAlive -ProcessId $foreignProcess.Id) 'foreign process must survive Stop'
    $foreignStatus = Invoke-Manager -Action Status -ExpectedExitCodes @(2)
    Assert-True ($foreignStatus.Output -match 'FOREIGN_CONFLICT') 'Status must identify foreign conflict'
    Stop-TestOwnedProcess -Process $foreignProcess
    $foreignProcess = $null
    Wait-ForNoListener

    Write-Case 'reused or mismatched receipt PID is never killed'
    $unrelatedProcess = Start-Process powershell.exe -ArgumentList @('-NoProfile','-Command','Start-Sleep -Seconds 60') -PassThru -WindowStyle Hidden
    $unrelatedProcess.Refresh()
    Write-FixtureReceipt -ProcessId $unrelatedProcess.Id -ProcessStartTimeUtc $unrelatedProcess.StartTime.ToUniversalTime().ToString('o') -InstanceId 'pid-reuse-fixture'
    Invoke-Manager -Action Stop | Out-Null
    Assert-True (Test-ProcessAlive -ProcessId $unrelatedProcess.Id) 'receipt PID alone must never authorize termination'
    Assert-True (-not (Test-Path -LiteralPath $ReceiptPath)) 'mismatched receipt should self-heal'
    Stop-TestOwnedProcess -Process $unrelatedProcess
    $unrelatedProcess = $null

    Write-Case 'forced child crash is recoverable on next start'
    Invoke-Manager -Action Start | Out-Null
    $crashBefore = Get-Identity
    Stop-Process -Id ([int]$crashBefore.pid) -Force -ErrorAction Stop
    Wait-ForNoListener
    Assert-True (Test-Path -LiteralPath $ReceiptPath) 'forced crash should leave receipt for recovery'
    Invoke-Manager -Action Start | Out-Null
    $crashAfter = Get-Identity
    Assert-True ([int]$crashAfter.pid -ne [int]$crashBefore.pid) 'crash recovery must start a fresh process'
    Invoke-Manager -Action Stop | Out-Null

    Write-Case 'startup timeout cleans only its own failed runtime and receipt'
    $runtimeControlBackup = [IO.File]::ReadAllText($RuntimeControl)
    $runtimeControlMutated = $true
    $inertControl = @'
import type { Plugin } from 'vite';
export function createRuntimeControlPlugin(): Plugin {
  return { name: 'escapehatch-runtime-control-timeout-fixture' };
}
'@
    [IO.File]::WriteAllText($RuntimeControl, $inertControl, (New-Object System.Text.UTF8Encoding -ArgumentList $false))
    $env:ESCAPEHATCH_START_TIMEOUT_SECONDS = '3'
    $timeoutResult = Invoke-Manager -Action Start -ExpectedExitCodes @(1)
    Assert-True ($timeoutResult.Output -match 'did not establish the expected managed identity') 'timeout failure must be explicit'
    Wait-ForNoListener
    Assert-True (-not (Test-Path -LiteralPath $ReceiptPath)) 'failed owned startup receipt must be cleaned'
    [IO.File]::WriteAllText($RuntimeControl, $runtimeControlBackup, (New-Object System.Text.UTF8Encoding -ArgumentList $false))
    $runtimeControlMutated = $false
    $env:ESCAPEHATCH_START_TIMEOUT_SECONDS = '10'

    Write-Case 'restart yields a new instance and no stale listener'
    Invoke-Manager -Action Start | Out-Null
    $restartBefore = Get-Identity
    Invoke-Manager -Action Restart | Out-Null
    $restartAfter = Get-Identity
    Assert-True ([string]$restartAfter.instanceId -ne [string]$restartBefore.instanceId) 'Restart must create a new instanceId'
    Assert-True (-not (Test-ProcessAlive -ProcessId ([int]$restartBefore.pid))) 'old restart PID must exit'
    Assert-Equal @(Get-ListenerPids).Count 1 'Restart must leave one listener'
    Invoke-Manager -Action Stop | Out-Null

    Write-Case 'runtime secrets never appear in identity, shutdown response, or runtime logs'
    Invoke-Manager -Action Start | Out-Null
    $secretIdentity = Get-Identity
    $secretReceipt = Read-Receipt
    $token = [string]$secretReceipt.shutdownToken
    Assert-True (-not [string]::IsNullOrWhiteSpace($token)) 'receipt must contain shutdown token'
    $identityJson = $secretIdentity | ConvertTo-Json -Depth 5 -Compress
    Assert-True (-not $identityJson.Contains($token)) 'identity response must not expose shutdown token'
    if (Test-Path -LiteralPath $LogDir) {
        $logText = @(Get-ChildItem -LiteralPath $LogDir -Filter '*.log' -File -ErrorAction SilentlyContinue |
            ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue }) -join [Environment]::NewLine
        Assert-True (-not $logText.Contains($token)) 'runtime logs must not contain shutdown token'
    }
    $headers = @{
        'x-escapehatch-runtime-protocol' = '1'
        'x-escapehatch-instance-id' = [string]$secretReceipt.instanceId
        'x-escapehatch-shutdown-token' = $token
    }
    $shutdownResponse = Invoke-WebRequest -Method Post -Uri "$Origin/__escapehatch/shutdown" -Headers $headers -TimeoutSec 3 -ErrorAction Stop
    Assert-Equal ([int]$shutdownResponse.StatusCode) 202 'authorized shutdown HTTP status'
    Assert-True (-not ([string]$shutdownResponse.Content).Contains($token)) 'shutdown response must not expose shutdown token'
    Wait-ForNoListener
    Invoke-Manager -Action Stop | Out-Null

    Assert-Equal $caseCount 14 'all required lifecycle regression cases must execute'
    Write-Host "WINDOWS_RUNTIME_LIFECYCLE_TESTS: PASS ($caseCount cases)" -ForegroundColor Green
} catch {
    Write-Host "WINDOWS_RUNTIME_LIFECYCLE_TESTS: FAIL" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($runtimeControlMutated -and $null -ne $runtimeControlBackup) {
        try {
            [IO.File]::WriteAllText($RuntimeControl, $runtimeControlBackup, (New-Object System.Text.UTF8Encoding -ArgumentList $false))
        } catch {}
    }
    Stop-TestOwnedProcess -Process $foreignProcess
    Stop-TestOwnedProcess -Process $unmanagedProcess
    Stop-TestOwnedProcess -Process $unrelatedProcess
    try { Invoke-Manager -Action Stop -ExpectedExitCodes @(0,1) | Out-Null } catch {}
    if ($tempLogPaths.Count -gt 0) {
        Remove-Item -LiteralPath $tempLogPaths -Force -ErrorAction SilentlyContinue
    }
    foreach ($name in $previousEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], 'Process')
    }
}
