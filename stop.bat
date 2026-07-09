@echo off
REM Stops the Portfolio Terminal backend and frontend dev servers started by
REM start.bat. Delegates to stop.ps1, which finds whatever is actually
REM listening on the known ports (8010, 5180) and kills it plus its parent
REM shell - more reliable than matching on console window titles.

echo Stopping Portfolio Terminal...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
echo Done.
ping -n 4 127.0.0.1 >nul
exit /b 0
