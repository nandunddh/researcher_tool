@echo off
title SciProspect Root Admin Console
color 0B
echo ========================================================
echo   🛡️  SCIPROSPECT ROOT ADMIN LICENSING COMMAND CENTER
echo ========================================================
echo.
echo Launching Root Licensing Console...
echo Default Root Master Password: admin2026
echo.

cd /d "%~dp0"
python run_admin_portal.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [NOTE] Python not found or launch error.
    echo Trying to open browser directly if app is running...
    start http://localhost:8000/admin
    pause
)
