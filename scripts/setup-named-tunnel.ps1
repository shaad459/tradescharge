# One-time: Cloudflare named tunnel + DNS for a stable hostname (survives reboots).
# Requires a domain on Cloudflare. See docs/CLOUDFLARE-TUNNEL.md

$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "Install cloudflared first: winget install Cloudflare.cloudflared"
}

$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cfDir | Out-Null

# Quick tunnels break if config.yml exists — we only create config after login
$configPath = Join-Path $cfDir "config.yml"
if (Test-Path $configPath) {
    Write-Host "Config already exists: $configPath"
    Get-Content $configPath
    $overwrite = Read-Host "Overwrite? (y/N)"
    if ($overwrite -ne "y") { exit 0 }
}

Write-Host "Step 1: Browser login to Cloudflare..."
cloudflared tunnel login

$tunnelName = Read-Host "Tunnel name (e.g. tradescharge)"
if ([string]::IsNullOrWhiteSpace($tunnelName)) { $tunnelName = "tradescharge" }

Write-Host "Step 2: Creating tunnel '$tunnelName'..."
cloudflared tunnel create $tunnelName

$hostname = Read-Host "Public hostname (e.g. tradescharge.yourdomain.com)"
if ([string]::IsNullOrWhiteSpace($hostname)) {
    Write-Error "Hostname is required (must be a zone on your Cloudflare account)"
}

Write-Host "Step 3: DNS route..."
cloudflared tunnel route dns $tunnelName $hostname

# Find credentials file (UUID.json)
$credFiles = Get-ChildItem $cfDir -Filter "*.json" | Where-Object { $_.Name -ne "cert.pem" }
if ($credFiles.Count -eq 0) {
    Write-Error "No tunnel credentials JSON in $cfDir — tunnel create may have failed"
}
$credFile = $credFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1

$tunnelId = [System.IO.Path]::GetFileNameWithoutExtension($credFile.Name)

@"

tunnel: $tunnelId
credentials-file: $($credFile.FullName)

ingress:
  - hostname: $hostname
    service: http://127.0.0.1:8000
  - service: http_status:404

"@ | Set-Content -Path $configPath -Encoding UTF8

Write-Host ""
Write-Host "Wrote $configPath"
Write-Host ""
Write-Host "Set in .env:"
Write-Host "  FRONTEND_URL=https://$hostname"
Write-Host "  KITE_REDIRECT_URL=https://$hostname/auth/kite/callback"
Write-Host ""
Write-Host "Add the same callback in https://developers.kite.trade"
Write-Host "Start after reboot: npm run tunnel:named"
