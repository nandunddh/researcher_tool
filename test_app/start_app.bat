@echo off
title SciNexus - Evaluation Edition
color 0A

echo ===================================================================
echo           SCINEXUS - 7-DAY EVALUATION EDITION
echo ===================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo [ERROR] Python is not installed on this system.
        echo Please install Python 3.10+ from python.org to run SciNexus.
        echo.
        pause
        exit /b 1
    )
    set PY_CMD=py
) else (
    set PY_CMD=python
)

echo Starting SciNexus...
%PY_CMD% run_trial_dashboard.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Exited with code %ERRORLEVEL%.
    pause
)
