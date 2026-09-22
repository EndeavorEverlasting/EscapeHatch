[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('Start', 'Stop', 'Restart', 'Status')]
    [string]$Action = 'Start'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $ScriptRoot '..\..')).TrimEnd('\', '/')
$RuntimeProtocol = 1
$RuntimeHost = '127.0.0.1'
$Port = if ($env:PORT) { [int]$env:PORT } else { 21031 }
$BasePath = if ($env:BASE_PATH) { $env:BASE_PATH } else { '/' }
$StartTimeoutSeconds = if ($env:ESCAPEHATCH_START_TIMEOUT_SECONDS) { [int]$env:ESCAPEHATCH_START_TIMEOUT_SECONDS } else { 30 }
$StopTimeoutSeconds = if ($env:ESCAPEHATCH_STOP_TIMEOUT_SECONDS) { [int]$env:ESCAPEHATCH_STOP_TIMEOUT_SECONDS } else { 10 }
$Url = 'http://{0}:{1}' -f $RuntimeHost, $Port
$normalizedBasePath = '/' + $BasePath.Trim('/') + '/'
if ($normalizedBasePath -eq '//') { $normalizedBasePath = '/' }
$AppUrl = $Url + $normalizedBasePath

if ($Port -lt 1 -or $Port -gt 65535) { throw "PORT must be between 1 and 65535." }
if ($StartTimeoutSeconds -lt 1 -or $StopTimeoutSeconds -lt 1) { throw "Lifecycle timeouts must be positive integers." }

function Get-RepoFingerprint {
    param([Parameter(Mandatory)][string]$Path)
    $normalized = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/').ToLowerInvariant()
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

function New-RandomHex {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
        return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $rng.Dispose()
    }
}

function Get-RuntimePaths {
    param([Parameter(Mandatory)][string]$Fingerprint)
    $localRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [Environment]::GetFolderPath('LocalApplicationData') }
    if (-not $localRoot) { throw 'Unable to resolve LOCALAPPDATA.' }
    $runtimeDir = Join-Path $localRoot "EscapeHatch\runtime\$Fingerprint"
    $logDir = Join-Path $localRoot "EscapeHatch\logs\$Fingerprint"
    [PSCustomObject]@{
        RuntimeDir = $runtimeDir
        Receipt = Join-Path $runtimeDir 'runtime.json'
        LogDir = $logDir
    }
}

function Get-ObjectPropertyValue {
    param(
        $Object,
        [Parameter(Mandatory)][string]$Name
    )
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Read-RuntimeReceipt {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return [PSCustomObject]@{
            malformed = $false
            schema = Get-ObjectPropertyValue -Object $raw -Name 'schema'
            instanceId = Get-ObjectPropertyValue -Object $raw -Name 'instanceId'
            repoFingerprint = Get-ObjectPropertyValue -Object $raw -Name 'repoFingerprint'
            pid = Get-ObjectPropertyValue -Object $raw -Name 'pid'
            processStartTimeUtc = Get-ObjectPropertyValue -Object $raw -Name 'processStartTimeUtc'
            host = Get-ObjectPropertyValue -Object $raw -Name 'host'
            port = Get-ObjectPropertyValue -Object $raw -Name 'port'
            runtimeProtocol = Get-ObjectPropertyValue -Object $raw -Name 'runtimeProtocol'
            shutdownToken = Get-ObjectPropertyValue -Object $raw -Name 'shutdownToken'
            startedAtUtc = Get-ObjectPropertyValue -Object $raw -Name 'startedAtUtc'
        }
    } catch {
        return [PSCustomObject]@{ malformed = $true }
    }
}

function Write-RuntimeReceipt {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Receipt
    )
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temp = Join-Path $directory ("runtime.{0}.tmp" -f ([Guid]::NewGuid().ToString('N')))
    $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
    try {
        [IO.File]::WriteAllText($temp, (($Receipt | ConvertTo-Json -Depth 5) + [Environment]::NewLine), $encoding)
        if ([IO.File]::Exists($Path)) {
            [IO.File]::Replace($temp, $Path, $null)
        } else {
            [IO.File]::Move($temp, $Path)
        }
    } finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

function Assert-RuntimeStorageWritable {
    param([Parameter(Mandatory)]$Paths)
    New-Item -ItemType Directory -Path $Paths.RuntimeDir -Force | Out-Null
    New-Item -ItemType Directory -Path $Paths.LogDir -Force | Out-Null
    $probe = Join-Path $Paths.RuntimeDir ("write-probe.{0}.tmp" -f ([Guid]::NewGuid().ToString('N')))
    try {
        $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
        [IO.File]::WriteAllText($probe, 'escapehatch-runtime-storage-probe', $encoding)
    } finally {
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    }
}

function Remove-RuntimeReceipt {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$ExpectedInstanceId = ''
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    if ($ExpectedInstanceId) {
        $current = Read-RuntimeReceipt -Path $Path
        if ($null -ne $current -and -not $current.malformed -and $current.instanceId -ne $ExpectedInstanceId) {
            return
        }
    }
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Get-ListenerObservation {
    try {
        $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { [int]$_.LocalPort -eq $Port })
    } catch {
        throw "Unable to query authoritative TCP listener state for port $Port: $($_.Exception.Message)"
    }

    if ($listeners.Count -eq 0) {
        return [PSCustomObject]@{ Present = $false; Pid = $null; Multiple = $false }
    }

    $pids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($pids.Count -ne 1) {
        return [PSCustomObject]@{ Present = $true; Pid = $null; Multiple = $true }
    }

    return [PSCustomObject]@{ Present = $true; Pid = [int]$pids[0]; Multiple = $false }
}

function Get-ProcessObservation {
    param([Parameter(Mandatory)][int]$ProcessId)
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        [PSCustomObject]@{
            Pid = $ProcessId
            Name = $process.ProcessName
            StartTimeUtc = $process.StartTime.ToUniversalTime().ToString('o')
            CommandLine = [string]$cim.CommandLine
        }
    } catch {
        return $null
    }
}

function Get-RuntimeIdentity {
    try {
        return Invoke-RestMethod -Method Get -Uri "$Url/__escapehatch/runtime" -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-SameRepoViteProcess {
    param([Parameter(Mandatory)]$Process)
    if ($null -eq $Process -or -not $Process.CommandLine) { return $false }
    if ([string]$Process.Name -ne 'node') { return $false }
    $viteJs = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'artifacts\escape-hatch\node_modules\vite\bin\vite.js'))
    $viteConfig = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'artifacts\escape-hatch\vite.config.ts'))
    return (
        $Process.CommandLine.IndexOf($viteJs, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $Process.CommandLine.IndexOf($viteConfig, [StringComparison]::OrdinalIgnoreCase) -ge 0
    )
}

function Test-HealthMatchesCurrentRepo {
    param(
        $Health,
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)][int]$ListenerPid
    )
    if ($null -eq $Health) { return $false }
    try {
        $app = Get-ObjectPropertyValue -Object $Health -Name 'app'
        $protocol = Get-ObjectPropertyValue -Object $Health -Name 'protocol'
        $repoFingerprint = Get-ObjectPropertyValue -Object $Health -Name 'repoFingerprint'
        $healthPid = Get-ObjectPropertyValue -Object $Health -Name 'pid'
        $instanceId = Get-ObjectPropertyValue -Object $Health -Name 'instanceId'
        return (
            [string]$app -eq 'EscapeHatch' -and
            [int]$protocol -eq $RuntimeProtocol -and
            [string]$repoFingerprint -eq $Fingerprint -and
            [int]$healthPid -eq $ListenerPid -and
            -not [string]::IsNullOrWhiteSpace([string]$instanceId)
        )
    } catch {
        return $false
    }
}

function Test-ReceiptMatchesHealthyRuntime {
    param(
        $Receipt,
        $Health,
        $Process,
        [Parameter(Mandatory)][string]$Fingerprint
    )
    if ($null -eq $Receipt -or $Receipt.malformed) { return $false }
    try {
        return (
            [string]$Receipt.schema -eq 'escapehatch-local-runtime/v1' -and
            [string]$Receipt.instanceId -eq [string](Get-ObjectPropertyValue -Object $Health -Name 'instanceId') -and
            [string]$Receipt.repoFingerprint -eq $Fingerprint -and
            [int]$Receipt.pid -eq [int](Get-ObjectPropertyValue -Object $Health -Name 'pid') -and
            [int]$Receipt.runtimeProtocol -eq $RuntimeProtocol -and
            [string]$Receipt.processStartTimeUtc -eq [string]$Process.StartTimeUtc -and
            -not [string]::IsNullOrWhiteSpace([string]$Receipt.shutdownToken)
        )
    } catch {
        return $false
    }
}

function Get-RuntimeObservation {
    param(
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)][string]$ReceiptPath
    )

    $receipt = Read-RuntimeReceipt -Path $ReceiptPath
    $listener = Get-ListenerObservation

    if (-not $listener.Present) {
        if ($null -ne $receipt) {
            if (-not $receipt.malformed) {
                try {
                    $receiptProcess = Get-ProcessObservation -ProcessId ([int]$receipt.pid)
                    if (
                        $null -ne $receiptProcess -and
                        [string]$receiptProcess.StartTimeUtc -eq [string]$receipt.processStartTimeUtc -and
                        (Test-SameRepoViteProcess -Process $receiptProcess)
                    ) {
                        return [PSCustomObject]@{
                            State = 'FOREIGN_CONFLICT'; Receipt = $receipt; Listener = $listener
                            Health = $null; Process = $receiptProcess
                            Reason = 'Receipt identifies a live same-repo Vite process, but no listening socket proves destructive ownership; automatic termination is forbidden.'
                        }
                    }
                } catch {}
            }
            return [PSCustomObject]@{
                State = 'STALE_RECEIPT'; Receipt = $receipt; Listener = $listener
                Health = $null; Process = $null; Reason = 'Receipt does not identify a current process owning the configured listening socket.'
            }
        }
        return [PSCustomObject]@{
            State = 'STOPPED'; Receipt = $null; Listener = $listener
            Health = $null; Process = $null; Reason = 'No listener and no runtime receipt.'
        }
    }

    if ($listener.Multiple -or $null -eq $listener.Pid) {
        return [PSCustomObject]@{
            State = 'FOREIGN_CONFLICT'; Receipt = $receipt; Listener = $listener
            Health = $null; Process = $null; Reason = 'Multiple or ambiguous listeners own the configured port.'
        }
    }

    $process = Get-ProcessObservation -ProcessId $listener.Pid
    $health = Get-RuntimeIdentity
    $sameRepo = Test-SameRepoViteProcess -Process $process
    $healthMatches = Test-HealthMatchesCurrentRepo -Health $health -Fingerprint $Fingerprint -ListenerPid $listener.Pid

    if ($healthMatches -and $sameRepo) {
        if (Test-ReceiptMatchesHealthyRuntime -Receipt $receipt -Health $health -Process $process -Fingerprint $Fingerprint) {
            return [PSCustomObject]@{
                State = 'OWNED_HEALTHY'; Receipt = $receipt; Listener = $listener
                Health = $health; Process = $process; Reason = 'Runtime identity, receipt, process, and socket owner agree.'
            }
        }
        return [PSCustomObject]@{
            State = 'OWNED_ADOPTABLE'; Receipt = $receipt; Listener = $listener
            Health = $health; Process = $process; Reason = 'Healthy same-repo runtime is positively identified but its secret-bearing receipt is missing or stale.'
        }
    }

    if ($sameRepo) {
        return [PSCustomObject]@{
            State = 'OWNED_UNHEALTHY'; Receipt = $receipt; Listener = $listener
            Health = $health; Process = $process; Reason = 'Same-repo Vite process owns the port but does not present the expected managed identity.'
        }
    }

    $name = if ($null -ne $process) { $process.Name } else { 'unknown' }
    return [PSCustomObject]@{
        State = 'FOREIGN_CONFLICT'; Receipt = $receipt; Listener = $listener
        Health = $health; Process = $process; Reason = "Port $Port is owned by unproven process PID $($listener.Pid) ($name)."
    }
}

function Test-ExactOwnershipNow {
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [Parameter(Mandatory)][string]$ExpectedStartTimeUtc
    )
    $listener = Get-ListenerObservation
    if (-not $listener.Present -or $listener.Multiple -or [int]$listener.Pid -ne $ProcessId) { return $false }
    $process = Get-ProcessObservation -ProcessId $ProcessId
    if ($null -eq $process -or [string]$process.StartTimeUtc -ne $ExpectedStartTimeUtc) { return $false }
    return (Test-SameRepoViteProcess -Process $process)
}

function Wait-ForOwnedExit {
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [Parameter(Mandatory)][int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $alive = $null -ne (Get-ProcessObservation -ProcessId $ProcessId)
        $listener = Get-ListenerObservation
        $sameListener = $listener.Present -and -not $listener.Multiple -and [int]$listener.Pid -eq $ProcessId
        if (-not $alive -and -not $sameListener) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Stop-ProvenOwnedProcess {
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [Parameter(Mandatory)][string]$ExpectedStartTimeUtc
    )

    if (-not (Test-ExactOwnershipNow -ProcessId $ProcessId -ExpectedStartTimeUtc $ExpectedStartTimeUtc)) {
        throw "Ownership reproof failed for PID $ProcessId; refusing destructive action."
    }

    Stop-Process -Id $ProcessId -ErrorAction Stop
    if (Wait-ForOwnedExit -ProcessId $ProcessId -TimeoutSeconds 3) { return }

    if (-not (Test-ExactOwnershipNow -ProcessId $ProcessId -ExpectedStartTimeUtc $ExpectedStartTimeUtc)) {
        throw "Ownership changed before forced process-tree fallback for PID $ProcessId; refusing escalation."
    }

    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "taskkill failed for proven owned PID $ProcessId with exit code $LASTEXITCODE." }
    if (-not (Wait-ForOwnedExit -ProcessId $ProcessId -TimeoutSeconds 3)) {
        throw "Proven owned PID $ProcessId did not exit after bounded process-tree termination."
    }
}

function Get-NodeExecutable {
    try {
        $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
        if ($nodeExe -and (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { return $nodeExe }
    } catch {}

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $candidate = $node.Source -replace '\.cmd$', '.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw 'node.exe was not found on PATH. Install a supported Node.js runtime before launching EscapeHatch.'
}

function Open-EscapeHatchBrowser {
    if ($env:ESCAPEHATCH_NO_BROWSER -eq '1') { return }
    Start-Process $AppUrl | Out-Null
}

function Show-LogTail {
    param([string]$Path)
    if ($Path -and (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Write-Host "--- $([IO.Path]::GetFileName($Path)) tail ---" -ForegroundColor DarkGray
        Get-Content -LiteralPath $Path -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    }
}

function Start-ColdRuntime {
    param(
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)]$Paths
    )

    $nodeExe = Get-NodeExecutable
    $viteJs = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'artifacts\escape-hatch\node_modules\vite\bin\vite.js'))
    $viteConfig = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'artifacts\escape-hatch\vite.config.ts'))
    if (-not (Test-Path -LiteralPath $viteJs -PathType Leaf)) { throw "Vite runtime not found at $viteJs" }
    if (-not (Test-Path -LiteralPath $viteConfig -PathType Leaf)) { throw "Vite config not found at $viteConfig" }

    Assert-RuntimeStorageWritable -Paths $Paths

    $instanceId = New-RandomHex -Bytes 16
    $shutdownToken = New-RandomHex -Bytes 32
    $startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
    $stdout = Join-Path $Paths.LogDir "runtime-$stamp-$instanceId.stdout.log"
    $stderr = Join-Path $Paths.LogDir "runtime-$stamp-$instanceId.stderr.log"

    $managedEnvironment = @{
        PORT = [string]$Port
        HOST = $RuntimeHost
        BASE_PATH = $BasePath
        ESCAPEHATCH_INSTANCE_ID = $instanceId
        ESCAPEHATCH_REPO_FINGERPRINT = $Fingerprint
        ESCAPEHATCH_SHUTDOWN_TOKEN = $shutdownToken
        ESCAPEHATCH_STARTED_AT_UTC = $startedAtUtc
        ESCAPEHATCH_RUNTIME_PROTOCOL = [string]$RuntimeProtocol
    }

    $previous = @{}
    foreach ($name in $managedEnvironment.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, [string]$managedEnvironment[$name], 'Process')
    }

    $arguments = @(
        ('"' + $viteJs + '"'),
        '--config', ('"' + $viteConfig + '"'),
        '--host', $RuntimeHost,
        '--port', [string]$Port,
        '--strictPort'
    )

    try {
        $process = Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    } finally {
        foreach ($name in $managedEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
        }
    }

    $process.Refresh()
    $processStart = $process.StartTime.ToUniversalTime().ToString('o')
    $receipt = @{
        schema = 'escapehatch-local-runtime/v1'
        instanceId = $instanceId
        repoFingerprint = $Fingerprint
        pid = [int]$process.Id
        processStartTimeUtc = $processStart
        host = $RuntimeHost
        port = [int]$Port
        runtimeProtocol = $RuntimeProtocol
        shutdownToken = $shutdownToken
        startedAtUtc = $startedAtUtc
    }
    try {
        Write-RuntimeReceipt -Path $Paths.Receipt -Receipt $receipt
    } catch {
        $receiptWriteError = $_.Exception.Message
        $cleanupDeadline = (Get-Date).AddSeconds($StartTimeoutSeconds)
        $cleaned = $false
        while ((Get-Date) -lt $cleanupDeadline) {
            $process.Refresh()
            if ($process.HasExited) {
                $cleaned = $true
                break
            }

            $health = Get-RuntimeIdentity
            $healthMatchesSpawn = (
                $null -ne $health -and
                [string](Get-ObjectPropertyValue -Object $health -Name 'app') -eq 'EscapeHatch' -and
                [int](Get-ObjectPropertyValue -Object $health -Name 'protocol') -eq $RuntimeProtocol -and
                [string](Get-ObjectPropertyValue -Object $health -Name 'instanceId') -eq $instanceId -and
                [string](Get-ObjectPropertyValue -Object $health -Name 'repoFingerprint') -eq $Fingerprint -and
                [int](Get-ObjectPropertyValue -Object $health -Name 'pid') -eq [int]$process.Id
            )

            if ($healthMatchesSpawn) {
                $headers = @{
                    'x-escapehatch-runtime-protocol' = [string]$RuntimeProtocol
                    'x-escapehatch-instance-id' = $instanceId
                    'x-escapehatch-shutdown-token' = $shutdownToken
                }
                try {
                    Invoke-RestMethod -Method Post -Uri "$Url/__escapehatch/shutdown" -Headers $headers -TimeoutSec 3 -ErrorAction Stop | Out-Null
                } catch {}
                if (Wait-ForOwnedExit -ProcessId $process.Id -TimeoutSeconds $StopTimeoutSeconds) {
                    $cleaned = $true
                    break
                }
            }

            if (Test-ExactOwnershipNow -ProcessId $process.Id -ExpectedStartTimeUtc $processStart) {
                Stop-ProvenOwnedProcess -ProcessId $process.Id -ExpectedStartTimeUtc $processStart
                $cleaned = $true
                break
            }

            Start-Sleep -Milliseconds 250
        }

        if (-not $cleaned) {
            throw "Runtime receipt persistence failed and PID $($process.Id) could not be safely re-proven for cleanup; no destructive action was taken. Receipt error: $receiptWriteError"
        }
        throw "Runtime receipt persistence failed after spawn; the spawned runtime was safely stopped. Receipt error: $receiptWriteError"
    }

    $deadline = (Get-Date).AddSeconds($StartTimeoutSeconds)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { break }
        $health = Get-RuntimeIdentity
        if (
            $null -ne $health -and
            [string](Get-ObjectPropertyValue -Object $health -Name 'app') -eq 'EscapeHatch' -and
            [int](Get-ObjectPropertyValue -Object $health -Name 'protocol') -eq $RuntimeProtocol -and
            [string](Get-ObjectPropertyValue -Object $health -Name 'instanceId') -eq $instanceId -and
            [string](Get-ObjectPropertyValue -Object $health -Name 'repoFingerprint') -eq $Fingerprint -and
            [int](Get-ObjectPropertyValue -Object $health -Name 'pid') -eq [int]$process.Id
        ) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 300
    }

    if (-not $ready) {
        $process.Refresh()
        $safeToRemoveReceipt = $process.HasExited
        if (-not $process.HasExited -and (Test-ExactOwnershipNow -ProcessId $process.Id -ExpectedStartTimeUtc $processStart)) {
            Stop-ProvenOwnedProcess -ProcessId $process.Id -ExpectedStartTimeUtc $processStart
            $safeToRemoveReceipt = $true
        }
        if ($safeToRemoveReceipt) {
            Remove-RuntimeReceipt -Path $Paths.Receipt -ExpectedInstanceId $instanceId
        } else {
            Write-Host "Startup failed but PID $($process.Id) is still live without sufficient socket ownership proof; preserving its receipt and refusing destructive cleanup." -ForegroundColor Yellow
        }
        Show-LogTail -Path $stdout
        Show-LogTail -Path $stderr
        throw "EscapeHatch runtime did not establish the expected managed identity within $StartTimeoutSeconds seconds."
    }

    Write-Host 'ESCAPEHATCH_STATE=OWNED_HEALTHY' -ForegroundColor Green
    Write-Host "PID=$($process.Id)"
    Write-Host "URL=$AppUrl"
    Open-EscapeHatchBrowser
}

function Invoke-StartAction {
    param(
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)]$Paths
    )
    $observation = Get-RuntimeObservation -Fingerprint $Fingerprint -ReceiptPath $Paths.Receipt

    switch ($observation.State) {
        'OWNED_HEALTHY' {
            Write-Host 'EscapeHatch is already running and verified.' -ForegroundColor Cyan
            Write-Host "PID=$($observation.Process.Pid)"
            Write-Host "URL=$AppUrl"
            Open-EscapeHatchBrowser
            return
        }
        'OWNED_ADOPTABLE' {
            Remove-RuntimeReceipt -Path $Paths.Receipt
            Write-Host 'EscapeHatch healthy orphan verified; reusing it without reconstructing its missing shutdown secret.' -ForegroundColor Yellow
            Write-Host "PID=$($observation.Process.Pid)"
            Write-Host "URL=$AppUrl"
            Open-EscapeHatchBrowser
            return
        }
        'OWNED_UNHEALTHY' {
            Write-Host "Recovering positively owned unhealthy EscapeHatch PID $($observation.Process.Pid)." -ForegroundColor Yellow
            Stop-ProvenOwnedProcess -ProcessId $observation.Process.Pid -ExpectedStartTimeUtc $observation.Process.StartTimeUtc
            Remove-RuntimeReceipt -Path $Paths.Receipt
        }
        'STALE_RECEIPT' {
            Remove-RuntimeReceipt -Path $Paths.Receipt
        }
        'FOREIGN_CONFLICT' {
            throw "$($observation.Reason) EscapeHatch will not terminate an unproven listener. Run Status for diagnostics."
        }
        'STOPPED' {}
        default { throw "Unknown runtime state: $($observation.State)" }
    }

    $after = Get-ListenerObservation
    if ($after.Present) {
        throw "Port $Port is still occupied after safe recovery; refusing cold start."
    }
    Start-ColdRuntime -Fingerprint $Fingerprint -Paths $Paths
}

function Invoke-HealthyGracefulStop {
    param(
        [Parameter(Mandatory)]$Observation,
        [Parameter(Mandatory)]$Paths
    )

    $headers = @{
        'x-escapehatch-runtime-protocol' = [string]$RuntimeProtocol
        'x-escapehatch-instance-id' = [string]$Observation.Receipt.instanceId
        'x-escapehatch-shutdown-token' = [string]$Observation.Receipt.shutdownToken
    }

    try {
        Invoke-RestMethod -Method Post -Uri "$Url/__escapehatch/shutdown" -Headers $headers -TimeoutSec 3 -ErrorAction Stop | Out-Null
    } catch {
        Write-Host 'Graceful shutdown request failed; ownership will be re-proven before bounded fallback.' -ForegroundColor Yellow
    }

    if (-not (Wait-ForOwnedExit -ProcessId $Observation.Process.Pid -TimeoutSeconds $StopTimeoutSeconds)) {
        Stop-ProvenOwnedProcess -ProcessId $Observation.Process.Pid -ExpectedStartTimeUtc $Observation.Process.StartTimeUtc
    }
    Remove-RuntimeReceipt -Path $Paths.Receipt -ExpectedInstanceId ([string]$Observation.Receipt.instanceId)
}

function Invoke-StopAction {
    param(
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)]$Paths
    )
    $observation = Get-RuntimeObservation -Fingerprint $Fingerprint -ReceiptPath $Paths.Receipt

    switch ($observation.State) {
        'STOPPED' {
            Write-Host 'EscapeHatch is already stopped.' -ForegroundColor Green
            return
        }
        'STALE_RECEIPT' {
            Remove-RuntimeReceipt -Path $Paths.Receipt
            Write-Host 'Removed stale runtime receipt; EscapeHatch is stopped.' -ForegroundColor Green
            return
        }
        'FOREIGN_CONFLICT' {
            throw "$($observation.Reason) Listener left untouched."
        }
        'OWNED_HEALTHY' {
            Invoke-HealthyGracefulStop -Observation $observation -Paths $Paths
        }
        'OWNED_ADOPTABLE' {
            Write-Host 'Stopping verified healthy orphan via ownership-reproved bounded termination; its shutdown token is intentionally unrecoverable.' -ForegroundColor Yellow
            Stop-ProvenOwnedProcess -ProcessId $observation.Process.Pid -ExpectedStartTimeUtc $observation.Process.StartTimeUtc
            Remove-RuntimeReceipt -Path $Paths.Receipt
        }
        'OWNED_UNHEALTHY' {
            Stop-ProvenOwnedProcess -ProcessId $observation.Process.Pid -ExpectedStartTimeUtc $observation.Process.StartTimeUtc
            Remove-RuntimeReceipt -Path $Paths.Receipt
        }
        default { throw "Unknown runtime state: $($observation.State)" }
    }

    $remaining = Get-ListenerObservation
    if ($remaining.Present) {
        if (-not $remaining.Multiple -and $null -ne $remaining.Pid) {
            Write-Host "Port $Port is now occupied by PID $($remaining.Pid); no further process will be terminated automatically." -ForegroundColor Yellow
        } else {
            Write-Host "Port $Port remains occupied by an ambiguous listener; no further process will be terminated automatically." -ForegroundColor Yellow
        }
    }
    Write-Host 'EscapeHatch stop completed.' -ForegroundColor Green
}

function Invoke-StatusAction {
    param(
        [Parameter(Mandatory)][string]$Fingerprint,
        [Parameter(Mandatory)]$Paths
    )
    $observation = Get-RuntimeObservation -Fingerprint $Fingerprint -ReceiptPath $Paths.Receipt
    Write-Host "ESCAPEHATCH_STATE=$($observation.State)"
    Write-Host "PORT=$Port"
    Write-Host "URL=$AppUrl"
    if ($null -ne $observation.Listener -and $observation.Listener.Present -and $null -ne $observation.Listener.Pid) {
        Write-Host "PID=$($observation.Listener.Pid)"
    }
    if ($null -ne $observation.Process -and $observation.Process.Name) {
        Write-Host "PROCESS=$($observation.Process.Name)"
    }
    Write-Host "REASON=$($observation.Reason)"
    if ($observation.State -eq 'FOREIGN_CONFLICT') {
        $script:StatusExitCode = 2
    }
}

$fingerprint = Get-RepoFingerprint -Path $RepoRoot
$paths = Get-RuntimePaths -Fingerprint $fingerprint
$mutexName = "Local\EscapeHatch.Runtime.$fingerprint"
$mutex = New-Object System.Threading.Mutex -ArgumentList $false, $mutexName
$lockTaken = $false
$exitCode = 0
$script:StatusExitCode = 0

try {
    try {
        $lockTaken = $mutex.WaitOne([TimeSpan]::FromSeconds(15))
    } catch [Threading.AbandonedMutexException] {
        $lockTaken = $true
    }
    if (-not $lockTaken) { throw 'Timed out waiting for the EscapeHatch lifecycle lock.' }

    switch ($Action) {
        'Start' { Invoke-StartAction -Fingerprint $fingerprint -Paths $paths }
        'Stop' { Invoke-StopAction -Fingerprint $fingerprint -Paths $paths }
        'Restart' {
            Invoke-StopAction -Fingerprint $fingerprint -Paths $paths
            Invoke-StartAction -Fingerprint $fingerprint -Paths $paths
        }
        'Status' {
            Invoke-StatusAction -Fingerprint $fingerprint -Paths $paths
            if ($script:StatusExitCode -eq 2) { $exitCode = 2 }
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    if ($lockTaken) {
        try { $mutex.ReleaseMutex() } catch {}
    }
    $mutex.Dispose()
}

exit $exitCode
