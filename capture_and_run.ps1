<#
  capture_and_run.ps1  -  Axum nightly capture orchestrator

  Run this ONCE per day from Task Scheduler at 23:00. Each run:
    1. STOPS the previous day's espflash capture (ends data collection cleanly).
    2. PROCESSES the just-closed log -> Claude API -> dated markdown report.
    3. STARTS a fresh detached capture into a new dated log for the next day.

  This single-task design is deliberately more robust than two racing tasks:
  the capture runs detached (survives this script exiting), and each daily run
  is self-healing - if a capture died early, the next 23:00 run just starts a
  new one. The raw .log files are kept on disk untouched.

  One-time setup:
    - Set the paths below to match your machine.
    - Put your API key in D:\scheduler\.env:   ANTHROPIC_API_KEY="sk-ant-..."
      (process_log.py loads it automatically via _load_dotenv.)
    - Create the scheduled task (run once, in an elevated PowerShell):

        $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
                     -Argument "-NoProfile -ExecutionPolicy Bypass -File D:\scheduler\capture_and_run.ps1"
        $trigger = New-ScheduledTaskTrigger -Daily -At 11:00PM
        Register-ScheduledTask -TaskName "AxumNightly" -Action $action `
                     -Trigger $trigger -RunLevel Highest -Description "Axum capture + nightly report"
#>

# ----------------------------------------------------------------- config ----
$Port       = "COM11"
$LogDir     = "D:\scheduler\logs"
$Processor  = "D:\scheduler\process_log.py"
$Python     = "python"                       # or full path to python.exe
$KeepDays   = 14                             # delete raw logs older than this

# ----------------------------------------------------------------- helpers ---
function Write-Stamp($msg) {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---- 1. STOP the previous capture -------------------------------------------
# espflash monitor holds the serial port; stopping it flushes and closes the log.
$running = Get-Process -Name "espflash" -ErrorAction SilentlyContinue
if ($running) {
    Write-Stamp "Stopping previous capture (espflash PID $($running.Id))..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 3            # let the OS release the COM port + flush
} else {
    Write-Stamp "No previous capture running (first run, or it had already exited)."
}

# ---- 2. PROCESS the just-closed log -----------------------------------------
# The newest .log in $LogDir is the day we just finished capturing.
$lastLog = Get-ChildItem -Path $LogDir -Filter "*.log" -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime | Select-Object -Last 1
if ($lastLog) {
    Write-Stamp "Processing $($lastLog.Name) ..."
    & $Python $Processor $lastLog.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Stamp "WARNING: processor exited with code $LASTEXITCODE (see output above)."
    }
} else {
    Write-Stamp "No log to process yet - starting first capture."
}

# ---- 3. START a fresh detached capture --------------------------------------
$newLog = Join-Path $LogDir ("esp32-monitor-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-Stamp "Starting new capture -> $newLog"

# Write the inner script to a temp file — more reliable than -Command with a
# multiline string, which can silently fail when passed via Start-Process.
$innerScript = Join-Path $env:TEMP "axum_capture.ps1"
@"
Write-Host ''
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host '  AXUM CAPTURE - press CTRL+R ONCE to start the device' -ForegroundColor Yellow
Write-Host '  streaming, then just leave this window open.' -ForegroundColor Yellow
Write-Host "  Logging to: $newLog" -ForegroundColor DarkGray
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host ''
espflash monitor --port $Port |
  ForEach-Object { "`$([System.DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss.fff')) `$_" } |
  Tee-Object -FilePath "$newLog"
"@ | Set-Content -Path $innerScript -Encoding UTF8

# Visible, normal window that stays open while espflash runs.
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $innerScript `
    -WindowStyle Normal

Start-Sleep -Seconds 5
if (Get-Process -Name "espflash" -ErrorAction SilentlyContinue) {
    Write-Stamp "Capture running. Press CTRL+R once in the new window to start device streaming."
} else {
    Write-Stamp "WARNING: espflash did not appear to start. Check COM port ($Port) and device connection."
}

# ---- 4. Housekeeping: prune old raw logs ------------------------------------
Get-ChildItem -Path $LogDir -Filter "*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    ForEach-Object {
        Write-Stamp "Pruning old log $($_.Name)"
        Remove-Item $_.FullName -Force
    }

Write-Stamp "Done."
