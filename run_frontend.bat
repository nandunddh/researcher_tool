@echo off
setlocal
cd /d "%~dp0frontend"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.20 or later first.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 exit /b 1
)
echo Start run_web.bat separately for FastAPI on port 8000.
echo Open http://127.0.0.1:3000 for the React frontend.
call npm run dev
