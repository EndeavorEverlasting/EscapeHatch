[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$root = Join-Path ([IO.Path]::GetTempPath()) ('eh-port-proof-' + [Guid]::NewGuid().ToString('N'))
$previous = @{}
foreach ($name in @('LOCALAPPDATA','PORT','ESCAPEHATCH_NO_BROWSER','ESCAPEHATCH_START_TIMEOUT_SECONDS')) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$fixtureProcess = $null
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Run-Manager([string]$Action, [int]$Expected = 0) {
    $stdout = Join-Path $root 'entry.out.log'
    $stderr = Join-Path $root 'entry.err.log'
    $managerPath = Join-Path $root 'scripts\windows\EscapeHatch-Runtime.ps1'
    $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $managerPath + '"'), '-Action', $Action)
    $child = Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $child.Handle
    if (-not $child.WaitForExit(30000)) { Stop-Process -Id $child.Id; throw "Manager $Action exceeded 30s" }
    $output = (Get-Content -LiteralPath $stdout -Raw) + (Get-Content -LiteralPath $stderr -Raw)
    Assert ($child.ExitCode -eq $Expected) "Unexpected manager exit for $Action : $output"
    return $output
}
try {
    New-Item -ItemType Directory -Path (Join-Path $root 'scripts\windows'), (Join-Path $root 'artifacts\escape-hatch\node_modules\vite\bin') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'scripts\windows\EscapeHatch-Runtime.ps1') -Destination (Join-Path $root 'scripts\windows\EscapeHatch-Runtime.ps1')
    [IO.File]::WriteAllText((Join-Path $root 'artifacts\escape-hatch\vite.config.ts'), '// disposable controlled runtime fixture')
    $fixture = @"
const http = require('http');
const server = http.createServer((req,res) => {
  if(req.url === '/__escapehatch/runtime') {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({app:'EscapeHatch',protocol:1,instanceId:process.env.ESCAPEHATCH_INSTANCE_ID,repoFingerprint:process.env.ESCAPEHATCH_REPO_FINGERPRINT,pid:process.pid,startedAtUtc:process.env.ESCAPEHATCH_STARTED_AT_UTC}));
  } else if(req.url === '/__escapehatch/shutdown' && req.headers['x-escapehatch-shutdown-token'] === process.env.ESCAPEHATCH_SHUTDOWN_TOKEN) {
    res.writeHead(202); res.end('{}'); server.close(() => process.exit(0));
  } else { res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.PORT), '127.0.0.1');
"@
    [IO.File]::WriteAllText((Join-Path $root 'artifacts\escape-hatch\node_modules\vite\bin\vite.js'), $fixture)
    # Execute the canonical parser/selector directly for malformed identity negatives.
    $tokens = $null; $parseErrors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts\windows\EscapeHatch-Runtime.ps1'), [ref]$tokens, [ref]$parseErrors)
    Assert ($parseErrors.Count -eq 0) 'Manager must parse under Windows PowerShell'
    foreach ($name in @('Get-ObjectPropertyValue','Read-RuntimeReceipt','Select-RuntimeEndpoint')) {
        $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        Invoke-Expression $definition.Extent.Text
    }
    $RuntimeHost = '127.0.0.1'; $RuntimeProtocol = 1; $normalizedBasePath = '/'
    $hintPath = Join-Path $root 'hint.json'
    $validHint = @{schema='escapehatch-local-runtime/v1';repoFingerprint='synthetic';host='127.0.0.1';runtimeProtocol=1;port=21047}
    foreach ($change in @(@{host='0.0.0.0'}, @{repoFingerprint='other'}, @{runtimeProtocol=2}, @{schema='other'}, @{port=0}, @{port=65536}, @{port='bad'}, @{port=21047.5})) {
        $hint = $validHint.Clone()
        foreach ($key in $change.Keys) { $hint[$key] = $change[$key] }
        $hint | ConvertTo-Json | Set-Content -LiteralPath $hintPath -Encoding UTF8
        $script:Port = 33333
        Select-RuntimeEndpoint -Fingerprint 'synthetic' -ReceiptPath $hintPath
        Assert ($script:Port -eq 33333) 'Unbound or invalid receipt must not select an endpoint'
    }
    '{broken' | Set-Content -LiteralPath $hintPath
    Select-RuntimeEndpoint -Fingerprint 'synthetic' -ReceiptPath $hintPath
    Assert ($script:Port -eq 33333) 'Malformed JSON must not select an endpoint'
    Remove-Item -LiteralPath $hintPath
    $env:LOCALAPPDATA = Join-Path $root 'private-fixture'
    $env:ESCAPEHATCH_NO_BROWSER = '1'
    $env:ESCAPEHATCH_START_TIMEOUT_SECONDS = '10'
    $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
    $env:PORT = [string]$port
    $started = Run-Manager 'Start'
    Assert ($started -match "URL=http://127.0.0.1:$port/") 'Cold start must announce selected port'
    $receiptPath = @(Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Filter runtime.json -Recurse)[0].FullName
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $fixtureProcess = Get-Process -Id ([int]$receipt.pid)
    $env:PORT = $null
    $status = Run-Manager 'Status'
    Assert ($status -match 'ESCAPEHATCH_STATE=OWNED_HEALTHY') 'Receipt discovery must prove healthy runtime with no caller PORT'
    Assert ($status -match "PORT=$port") 'Status must announce receipt port'
    $reused = Run-Manager 'Start'
    Assert ($reused -match "PID=$($receipt.pid)") 'Repeat start must reuse the same PID'
    $env:PORT = '1'
    $status = Run-Manager 'Status'
    Assert ($status -match "PORT=$port") 'Installed receipt takes precedence over a conflicting PORT hint'
    Run-Manager 'Stop' | Out-Null
    $fixtureProcess.WaitForExit(10000) | Out-Null
    Assert $fixtureProcess.HasExited 'Canonical stop must terminate only the controlled owned fixture'
    $fixtureProcess = $null

    # Select a recorded endpoint with an unrelated real listener: never fallback or kill.
    $env:PORT = [string]$port
    $foreignPath = Join-Path $source 'tests\windows\fixtures\foreign-listener.mjs'
    $fixtureProcess = Start-Process node.exe -ArgumentList ('"' + $foreignPath + '"') -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(10)
    do { Start-Sleep -Milliseconds 200; $listening = @(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq $port).Count -gt 0 } while (-not $listening -and (Get-Date) -lt $deadline)
    Assert $listening 'Foreign fixture must listen before classification'
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
    $env:PORT = $null
    $status = Run-Manager 'Status' 2
    Assert ($status -match 'FOREIGN_CONFLICT') 'Stale receipt over foreign listener must fail closed'
    Run-Manager 'Start' 1 | Out-Null
    Run-Manager 'Stop' 1 | Out-Null
    $fixtureProcess.Refresh()
    Assert (-not $fixtureProcess.HasExited) 'Foreign listener must remain alive after Start and Stop'
    Assert (Test-Path -LiteralPath $receiptPath) 'Foreign conflict must preserve receipt for diagnosis'
    Write-Host 'WINDOWS_RUNTIME_PORT_DISCOVERY: PASS (cold start, no-env discovery, repeat PID, override precedence, owned stop, foreign status/start/stop preservation)'
} finally {
    # Only the exact child handle created by this test may be cleaned up.
    if ($null -ne $fixtureProcess) { $fixtureProcess.Refresh(); if (-not $fixtureProcess.HasExited) { Stop-Process -Id $fixtureProcess.Id -ErrorAction SilentlyContinue } }
    # Catch startup assertions too: clean only nodes whose exact command line is in this unique fixture root.
    foreach ($candidate in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root + '\artifacts\escape-hatch\node_modules\vite\bin\vite.js') })) {
        Stop-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
    }
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $resolved = [IO.Path]::GetFullPath($root)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved).StartsWith('eh-port-proof-')) { Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue }
}
