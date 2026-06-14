# Start Tradescharge (production) + Cloudflare quick tunnel.
# Quick tunnels get a NEW trycloudflare.com URL each run — not stable across reboots.
# For a fixed URL use scripts/setup-named-tunnel.ps1 or Render (docs/CLOUDFLARE-TUNNEL.md).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Test-PortInUse([int]$Port) {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $c
}

function Update-EnvTunnelUrl([string]$BaseUrl) {
    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path $envFile)) {
        Write-Warning ".env not found — set FRONTEND_URL and KITE_REDIRECT_URL manually to $BaseUrl"
        return
    }
    $content = Get-Content $envFile -Raw
    $callback = "$BaseUrl/auth/kite/callback"
    $content = $content -replace '(?m)^FRONTEND_URL=.*$', "FRONTEND_URL=$BaseUrl"
    $content = $content -replace '(?m)^KITE_REDIRECT_URL=.*$', "KITE_REDIRECT_URL=$callback"
    Set-Content -Path $envFile -Value $content.TrimEnd() -NoNewline
    Add-Content -Path $envFile -Value "`n"
    Write-Host "Updated .env -> FRONTEND_URL=$BaseUrl"
}

function Start-BackendProduction {
    if (Test-PortInUse 8000) {
        Write-Host "Port 8000 already in use — assuming Tradescharge is running."
        return $null
    }
    Write-Host "Building frontend..."
    npm run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

    $env:NODE_ENV = "production"
    $env:SERVE_FRONTEND = "true"
    $env:HOST = "0.0.0.0"
    if (-not $env:PORT) { $env:PORT = "8000" }

    Write-Host "Starting backend on port $env:PORT..."
    $job = Start-Job -ScriptBlock {
        param($dir)
        Set-Location $dir
        $env:NODE_ENV = "production"
        $env:SERVE_FRONTEND = "true"
        $env:HOST = "0.0.0.0"
        $env:PORT = "8000"
        npm start 2>&1
    } -ArgumentList $Root

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortInUse 8000) { return $job }
        Start-Sleep -Seconds 1
    }
    throw "Backend did not listen on 8000 within 45s. Check: Receive-Job -Id $($job.Id)"
}

# Named tunnel if config exists
$namedConfig = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
if (Test-Path $namedConfig) {
    Write-Host "Named tunnel config found — use: npm run tunnel:named"
    Write-Host "  (Quick tunnel skipped to avoid conflicting with config.yml)"
    exit 1
}

$backendJob = Start-BackendProduction

$urlFile = Join-Path $Root "backend\data\tunnel-url.txt"
New-Item -ItemType Directory -Force -Path (Split-Path $urlFile) | Out-Null

Write-Host ""
Write-Host "Starting Cloudflare quick tunnel -> http://127.0.0.1:8000"
Write-Host "NOTE: URL will change on every restart. See docs/CLOUDFLARE-TUNNEL.md"
Write-Host ""

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Write-Error "cloudflared not found. Install: winget install Cloudflare.cloudflared"
}

$log = Join-Path $env:TEMP "tradescharge-cloudflared.log"
$proc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:8000", "--logfile", $log, "--loglevel", "info" `
    -PassThru -NoNewWindow

$publicUrl = $null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not $publicUrl) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $text = Get-Content $log -Raw -ErrorAction SilentlyContinue
        if ($text -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
            $publicUrl = $Matches[1]
        }
    }
}

if (-not $publicUrl) {
    Write-Warning "Could not read tunnel URL from log yet. Watch: $log"
    Write-Host "Or run: cloudflared tunnel --url http://127.0.0.1:8000"
    exit 0
}

Set-Content -Path $urlFile -Value $publicUrl
Update-EnvTunnelUrl $publicUrl

Write-Host ""
Write-Host "========================================"
Write-Host "  Public URL: $publicUrl"
Write-Host "========================================"
if ($publicUrl -notmatch 'sacred-award-known-survivor') {
    Write-Host "This is NOT sacred-award-known-survivor — quick tunnels cannot reuse old names."
}
Write-Host "Add in Kite developer portal:"
Write-Host "  $publicUrl/auth/kite/callback"
Write-Host ""
Write-Host "Press Ctrl+C to stop tunnel. Backend job Id: $($backendJob.Id)"
Write-Host "Stop backend: Stop-Job -Id $($backendJob.Id); Remove-Job -Id $($backendJob.Id)"

try {
    Wait-Process -Id $proc.Id
} finally {
    if ($backendJob) {
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    }
}
