@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo A instalação não foi concluída. Confira a mensagem acima.
  pause
  exit /b 1
)
exit /b 0
