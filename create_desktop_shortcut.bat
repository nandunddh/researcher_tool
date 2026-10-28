@echo off
title Create Desktop Shortcut - SciProspect Pro
color 0A

echo Creating Desktop Shortcut for SciProspect Pro (Lifetime)...

set SCRIPT_DIR=%~dp0
set TARGET_BAT=%SCRIPT_DIR%start_pro_app.bat
set ICON_PATH=%SCRIPT_DIR%static\favicon.ico
set SHORTCUT_NAME=SciProspect Pro (Lifetime).lnk

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [System.Environment]::GetFolderPath('Desktop'); " ^
  "$s = $ws.CreateShortcut((Join-Path $desktop '%SHORTCUT_NAME%')); " ^
  "$s.TargetPath = '%TARGET_BAT%'; " ^
  "$s.WorkingDirectory = '%SCRIPT_DIR%'; " ^
  "if (Test-Path '%ICON_PATH%') { $s.IconLocation = '%ICON_PATH%'; } " ^
  "$s.Save()"

echo.
echo ===================================================================
echo [SUCCESS] Shortcut created on your Desktop:
echo "SciProspect Pro (Lifetime)"
echo ===================================================================
echo.
pause
