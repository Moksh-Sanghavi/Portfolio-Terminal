# Stops the Portfolio Terminal backend and frontend dev servers.
# Two passes: (1) kill whatever is actually listening on the known ports,
# (2) kill any leftover shell/process whose command line references this
# project's run.bat launchers, since npm/uvicorn can spawn a few process
# layers deep and a simple parent-PID walk isn't reliable for all of them.

$ports = 8010, 5180

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Output "Nothing listening on port $port."
        continue
    }
    foreach ($conn in $conns) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Output "Stopped process on port $port (PID $($conn.OwningProcess))."
    }
}

$leftovers = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match [regex]::Escape('Portfolio Backtester\backend\run.bat') -or
    $_.CommandLine -match [regex]::Escape('Portfolio Backtester\frontend\run.bat')
}
foreach ($proc in $leftovers) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped leftover shell (PID $($proc.ProcessId))."
}
