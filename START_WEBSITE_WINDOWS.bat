@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install it from https://nodejs.org/.
  pause
  exit /b 1
)
start "Greenwich Credit Partners v2 server" cmd /k "npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173/"
start "" "http://localhost:4173/admin/login.html"
