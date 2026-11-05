@echo off
title SciProspect Pro Desktop App
echo ===================================================
echo   Starting SciProspect Pro Desktop Application...
echo ===================================================
echo.
cd /d "%~dp0app\main"
python run_pro_dashboard.py
pause
