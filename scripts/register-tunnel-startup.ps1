# Register Tradescharge named tunnel + backend to run at Windows logon (current user).

$ErrorActionPreference = "Stop"
$Root = "d:\Tradescharge"
$namedScript = Join-Path $Root "scripts\start-named-tunnel.ps1"
$config = Join-Path $env:USERPROFILE ".cloudflared\config.yml"

if (-not (Test-Path $config)) {
    Write-Error "Run setup-named-tunnel.ps1 first. Quick tunnels cannot use a fixed URL."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$namedScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "TradeschargeCloudflareTunnel" `
    -Action $action -Trigger $trigger -Settings $settings -Force

Write-Host "Registered scheduled task: TradeschargeCloudflareTunnel"
Write-Host "Runs at logon: $namedScript"
