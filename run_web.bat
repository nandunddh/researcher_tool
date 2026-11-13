@echo off
setlocal
title SciProspect Backend API and SciStudio
echo ===================================================
echo   Starting SciProspect Backend Server (Port 8000)...
echo ===================================================
echo.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 goto setup_failed
)

".venv\Scripts\python.exe" -c "import uvicorn, fastapi, requests, psycopg2, pydantic, aiofiles, multipart" >nul 2>nul
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 goto setup_failed
)

cd /d "%~dp0backend"

:: Start Uvicorn Server
"%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
exit /b

:setup_failed
echo.
echo Could not prepare the Python environment. Check the error above and try again.
pause
exit /b 1

