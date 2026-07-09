@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" -m uvicorn api:app --port 8010
