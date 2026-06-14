# Run a persistent Cloudflare named tunnel (fixed hostname). Requires setup-named-tunnel.ps1 first.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$config = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
if (-not (Test-Path $config)) {
    Write-Error "Missing $config — run: scripts\setup-named-tunnel.ps1"
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "Install cloudflared: winget install Cloudflare.cloudflared"
}

# Start backend if needed
function Test-PortInUse([int]$Port) {
    $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-PortInUse 8000)) {
    Write-Host "Building and starting production server on :8000..."
    npm run build | Out-Host
    $env:NODE_ENV = "production"
    $env:SERVE_FRONTEND = "true"
    $env:HOST = "0.0.0.0"
    $env:PORT = "8000"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; npm start" -WindowStyle Minimized
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline -and -not (Test-PortInUse 8000)) { Start-Sleep 1 }
    if (-not (Test-PortInUse 8000)) { throw "Backend failed to start on 8000" }
}

Write-Host "Running named tunnel (config: $config)"
Write-Host "Stop with Ctrl+C"
cloudflared tunnel --config $config run
