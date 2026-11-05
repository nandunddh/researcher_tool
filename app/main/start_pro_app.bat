@echo off
title SciProspect Professional - Lifetime Edition
color 0B

echo ===================================================================
echo     SCIPROSPECT PROFESSIONAL - LIFETIME UNLIMITED EDITION
echo ===================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo [ERROR] Python is not found. Please ensure Python is installed.
        pause
        exit /b 1
    )
    set PY_CMD=py
) else (
    set PY_CMD=python
)

echo Starting SciProspect Pro Desktop App...
%PY_CMD% run_pro_dashboard.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Exited with code %ERRORLEVEL%.
    pause
)
