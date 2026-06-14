# Restart Tradescharge dev (backend 8000 + frontend 5173)
$ErrorActionPreference = "SilentlyContinue"
foreach ($port in @(8000, 5173)) {
  Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force
  }
}
Start-Sleep -Seconds 2
Set-Location $PSScriptRoot\..
npm run dev
