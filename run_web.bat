@echo off
setlocal
title SciProspect Web and SciStudio
echo ===================================================
echo   Starting SciProspect Web Server and SciStudio...
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

cd /d "%~dp0web"

:: Launch browser in background after 2 seconds
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

:: Start Uvicorn Server
"%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
exit /b

:setup_failed
echo.
echo Could not prepare the Python environment. Check the error above and try again.
pause
exit /b 1

