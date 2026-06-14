# After: gh auth login (browser)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    Write-Host "Then run this script again."
    exit 1
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
    gh repo create tradescharge --private --source=. --remote=origin --push
    Write-Host "Created private repo and pushed."
} else {
    git push -u origin main
    Write-Host "Pushed to $remote"
}

Write-Host ""
Write-Host "Next: docs/DEPLOY-TRADESCHARGE-COM.md"
