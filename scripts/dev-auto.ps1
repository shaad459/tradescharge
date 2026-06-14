# Keeps Tradescharge dev running - restarts when dev exits or backend/UI stop responding.
$ErrorActionPreference = "SilentlyContinue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$HealthIntervalSec = 10
$RestartDelaySec = 5
$StartupGraceSec = 50

function Test-DevHealthy {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 4
    if ($health.StatusCode -ne 200) {
      return $false
    }
    $ui = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 4
    return $ui.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Clear-StaleDevPorts {
  foreach ($port in @(8000, 5173)) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        Write-Host "[dev-auto] Freeing port $port (PID $($_.OwningProcess))"
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
  }
  Start-Sleep -Seconds 2
}

function Stop-DevProcessTree {
  param([System.Diagnostics.Process]$Proc)
  if ($null -eq $Proc -or $Proc.HasExited) {
    return
  }
  Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Clear-StaleDevPorts
}

function Wait-DevProcessOrUnhealthy {
  param([System.Diagnostics.Process]$Proc)
  $unhealthyStreak = 0
  $graceUntil = (Get-Date).AddSeconds($StartupGraceSec)
  while (-not $Proc.HasExited) {
    Start-Sleep -Seconds $HealthIntervalSec
    if ((Get-Date) -lt $graceUntil) {
      continue
    }
    if (Test-DevHealthy) {
      $unhealthyStreak = 0
      continue
    }
    $unhealthyStreak++
    Write-Host "[dev-auto] Health check failed ($unhealthyStreak) - ports 8000/5173 not OK"
    if ($unhealthyStreak -ge 3) {
      return $false
    }
  }
  return $true
}

Write-Host "[dev-auto] Watchdog started. Open http://127.0.0.1:5173 - Ctrl+C in this window to stop."
Write-Host "[dev-auto] Restarts when dev exits or when :8000/:5173 stop responding."

while ($true) {
  if (-not (Test-DevHealthy)) {
    Clear-StaleDevPorts
  }

  $started = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[dev-auto] Starting npm run dev:once at $started"

  $proc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:once" -WorkingDirectory $Root -PassThru

  $exitedClean = Wait-DevProcessOrUnhealthy -Proc $proc
  if (-not $exitedClean) {
    Write-Host "[dev-auto] Restarting unhealthy dev stack..."
    Stop-DevProcessTree -Proc $proc
  } elseif (-not $proc.HasExited) {
    Stop-DevProcessTree -Proc $proc
  } else {
    Write-Host "[dev-auto] Dev process ended (exit $($proc.ExitCode))"
  }

  Clear-StaleDevPorts
  Write-Host "[dev-auto] Restarting in $RestartDelaySec s..."
  Start-Sleep -Seconds $RestartDelaySec
}
