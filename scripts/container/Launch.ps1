param(
    [Parameter(Position = 0)]
    [ValidateSet('open', 'stop', 'help', '--help')]
    [string]$Action = 'open',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$container = 'escapehatch-desktop'
$image = 'escapehatch-desktop:local'
$volume = 'escapehatch-desktop-workspace'
$owner = 'dev.escapehatch.launcher'
$port = 21030

function Get-LaunchContainer {
    # Docker returns a nonzero result when this name is available.
    $ErrorActionPreference = 'Continue'
    $result = & docker container inspect --format '{{index .Config.Labels "dev.escapehatch.launcher"}}|{{.State.Running}}' $container 2>$null
    if ($LASTEXITCODE -eq 0) { return $result }
}

function Open-EscapeHatch {
    if ($Action -in @('help', '--help')) {
        Write-Host 'EscapeHatch: Hey, press me, click me.'
        Write-Host 'Usage: Launch.ps1 [open | stop | help] [-NoBrowser]'
        Write-Host 'Open starts EscapeHatch and opens the Journey tutorial. Stop keeps your workspace.'
        return
    }
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop, then click this launcher again. https://docs.docker.com/get-docker/'
    }
    $endpoint = $env:DOCKER_HOST
    if ($env:DOCKER_CONTEXT -or !$endpoint) {
        $endpoint = & docker context inspect --format '{{.Endpoints.docker.Host}}'
        if ($LASTEXITCODE -ne 0) { throw 'Choose a local Docker Desktop context and try again.' }
    }
    if ($endpoint -notlike 'npipe:////./pipe/*') {
        throw 'Choose your local Docker Desktop context so EscapeHatch can open on this computer.'
    }
    $dockerOs = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0 -or $dockerOs -ne 'linux') {
        throw 'Start Docker Desktop in Linux containers mode, then try again.'
    }

    $current = Get-LaunchContainer
    if ($current -and $current -notlike "$owner|*") { throw "Docker already has a different container named $container." }
    if ($Action -eq 'stop') {
        if ($current -eq "$owner|true") {
            & docker stop $container | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Docker could not close EscapeHatch.' }
        }
        Write-Host 'EscapeHatch is closed. Your workspace is still here for next time.'
        return
    }

    Write-Host 'Hey, press me, click me.'
    Write-Host 'Let us get your escape hatch open.'
    if (!$current) {
        Write-Host 'Warming up the hatch. The first build may take a few minutes.'
        & docker build --tag $image .
        if ($LASTEXITCODE -ne 0) { throw 'The build stopped. Check Docker output, then click again to retry.' }
        & docker run --detach --init --rm --name $container --label "$owner=$owner" `
            --publish "127.0.0.1:${port}:$port" --mount "type=volume,source=$volume,target=/workspace" $image | Out-Null
        if ($LASTEXITCODE -ne 0 -and (Get-LaunchContainer) -ne "$owner|true") {
            throw "EscapeHatch could not start. Check Docker and whether port $port is already in use."
        }
    }
    Write-Host 'Waiting for your private workspace...'
    $launchUrl = $null
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $ErrorActionPreference = 'Continue'
        $launchUrl = & docker exec $container node --experimental-strip-types container-server.ts launch-url 2>$null
        $ErrorActionPreference = 'Stop'
        if ($LASTEXITCODE -eq 0) { break }
        if ((Get-LaunchContainer) -ne "$owner|true") { throw 'EscapeHatch stopped during startup. Click again after checking Docker.' }
        Start-Sleep -Seconds 1
    }
    if ($launchUrl -cnotmatch '^http://escapehatch\.localhost:21030/__launch/[a-f0-9]{64}$') {
        throw 'The workspace did not become ready. Check docker logs escapehatch-desktop.'
    }
    if ($NoBrowser) { Write-Output $launchUrl; return }
    try {
        Start-Process -FilePath $launchUrl
        Write-Host 'Your tutorial is open. Follow the chick.'
    } catch {
        Write-Host "Open this private link in your browser on this computer:`n$launchUrl"
    }
}

Push-Location (Join-Path $PSScriptRoot '../..')
try {
    Open-EscapeHatch
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    Pop-Location
}
