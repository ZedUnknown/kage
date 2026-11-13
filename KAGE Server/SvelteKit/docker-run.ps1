param(
    [ValidateSet('start', 'update', 'status', 'logs', 'stop', 'check')]
    [string]$Action = 'start'
)

# Run from PowerShell: .\docker-run.ps1 [action]
# Actions: start (default), update, status, logs, stop, check.
# Compose reads .env beside this script.
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env'))) {
    throw 'Missing .env. Copy .env.example to .env and set its values first.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not available. Start Docker Desktop and try again.'
}

function Invoke-Compose {
    param([string[]]$ComposeArgs)

    & docker compose @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    switch ($Action) {
        'check' {
            # Validate Compose and required .env values without starting containers.
            Invoke-Compose -ComposeArgs @('config', '--quiet')
            Write-Host 'Docker Compose configuration is valid.'
        }
        'start' {
            # Build the image, run migrations, and start web and worker.
            Invoke-Compose -ComposeArgs @('config', '--quiet')
            Invoke-Compose -ComposeArgs @('up', '--build', '-d')
            Invoke-Compose -ComposeArgs @('ps', '-a')
        }
        'update' {
            # Build the updated image and apply migrations before recreating services.
            Invoke-Compose -ComposeArgs @('build', 'migrate')
            Invoke-Compose -ComposeArgs @('run', '--rm', 'migrate')
            Invoke-Compose -ComposeArgs @('up', '-d')
            Invoke-Compose -ComposeArgs @('ps', '-a')
        }
        'status' {
            # Include the completed one-shot migration container.
            Invoke-Compose -ComposeArgs @('ps', '-a')
        }
        'logs' {
            # Ctrl+C stops viewing logs; containers keep running.
            Invoke-Compose -ComposeArgs @('logs', '-f', 'migrate', 'web', 'worker')
        }
        'stop' {
            # Stop containers; PostgreSQL on the host is unaffected.
            Invoke-Compose -ComposeArgs @('down')
        }
    }
} finally {
    Pop-Location
}
