@echo off
setlocal enabledelayedexpansion
title Build SciNexus Setup.exe
color 0B

echo =====================================================================
echo    BUILDING SCINEXUS - WINDOWS SETUP WIZARD
echo =====================================================================
echo.

:: 1. Detect Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo [ERROR] Python not found. Please install Python to build the setup.
        pause
        exit /b 1
    )
    set PY_CMD=py
) else (
    set PY_CMD=python
)

:: 2. Check / Install PyInstaller
echo [Step 1/3] Checking PyInstaller...
%PY_CMD% -m pip show pyinstaller >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo PyInstaller not found. Installing now...
    %PY_CMD% -m pip install pyinstaller
)

:: 3. Compile Python code into binary folder (dist/SciNexus)
echo.
echo [Step 2/3] Compiling SciNexus into standalone Windows executable...
%PY_CMD% -m PyInstaller --noconfirm --onedir --windowed ^
  --name "SciNexus" ^
  --add-data "..\static;static" ^
  --add-data "01_extract_researchers_test.py;." ^
  --add-data "02_collect_scholarly_emails_test.py;." ^
  --add-data "trial_manager.py;." ^
  --add-data "app.py;." ^
  --hidden-import "app" ^
  --hidden-import "uvicorn" ^
  --hidden-import "fastapi" ^
  --collect-all "webview" ^
  run_trial_dashboard.py



if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] PyInstaller compilation failed. Check the logs above.
    pause
    exit /b 1
)

:: 4. Locate Inno Setup Compiler (ISCC.exe)
echo.
echo [Step 3/3] Packaging into Windows Setup Wizard...
set "ISCC_PATH="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files (x86)\Inno Setup 5\ISCC.exe" set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
if not defined ISCC_PATH (
    for /f "tokens=*" %%i in ('where iscc.exe 2^>nul') do set "ISCC_PATH=%%i"
)


if "%ISCC_PATH%"=="" (
    color 0E
    echo.
    echo =====================================================================
    echo [NOTICE] Inno Setup compiler ISCC.exe was not found.
    echo.
    echo Your standalone application was built successfully in:
    echo   dist\SciNexus\
    echo.
    echo To turn it into a single SciNexus_Setup.exe wizard:
    echo 1. Download Inno Setup from: https://jrsoftware.org/isdl.php
    echo 2. Run this build_setup.bat again!
    echo =====================================================================
    echo.
    pause
    exit /b 0
)

echo Found Inno Setup at: "%ISCC_PATH%"
"%ISCC_PATH%" installer.iss

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo.
    echo =====================================================================
    echo SUCCESS! Your client installer has been built:
    echo.
    echo    📁 dist_installer\SciNexus_Setup.exe
    echo.
    echo This is the ONLY file you need to send to your client/tester!
    echo They will double-click it, choose their folder, and get a SciNexus desktop icon.
    echo =====================================================================
    echo.
) else (
    color 0C
    echo [ERROR] Inno Setup compilation failed.
)

pause
