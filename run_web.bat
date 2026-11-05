@echo off
title SciProspect Web & SciStudio
echo ===================================================
echo   Starting SciProspect Web Server & SciStudio...
echo ===================================================
echo.
cd /d "%~dp0web"

:: Launch browser in background after 2 seconds
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"

:: Start Uvicorn Server
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause

