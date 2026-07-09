@echo off
REM Starts the Portfolio Terminal backend (FastAPI) and frontend (Vite/React),
REM then opens the app in your default browser. Both servers run in their own
REM minimized windows - use "Stop Portfolio Terminal" to shut them down.

setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%backend\venv\Scripts\python.exe" (
    echo ERROR: Could not find %ROOT%backend\venv\Scripts\python.exe
    echo Make sure the backend virtual environment has been set up.
    pause
    exit /b 1
)

echo Starting Portfolio Terminal backend on port 8010...
start "PortfolioTerminal-Backend" /min "%ROOT%backend\run.bat"

echo Starting Portfolio Terminal frontend on port 5180...
start "PortfolioTerminal-Frontend" /min "%ROOT%frontend\run.bat"

echo Waiting for the frontend to come up...
ping -n 6 127.0.0.1 >nul

start "" "http://localhost:5180"

echo.
echo Portfolio Terminal is running:
echo   Backend:  http://localhost:8010
echo   Frontend: http://localhost:5180
echo.
echo This window will close automatically. The servers keep running
echo minimized in the taskbar until you use "Stop Portfolio Terminal".
ping -n 4 127.0.0.1 >nul
exit /b 0
