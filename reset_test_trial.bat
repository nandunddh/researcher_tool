@echo off
title Reset SciProspect Test Trial Limit
color 0A
echo ========================================================
echo   🔄 SCIPROSPECT TRIAL LIMIT RESET UTILITY
echo ========================================================
echo.
echo Resetting 7-day evaluation period and restoring 1,000 daily lead quota...
echo.

cd /d "%~dp0"
python reset_test_trial.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Could not run python script.
)
echo.
echo Press any key to close this window...
pause >nul
