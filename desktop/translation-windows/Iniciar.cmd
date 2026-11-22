@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Dependencias ausentes. Execute npm install nesta pasta primeiro.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
