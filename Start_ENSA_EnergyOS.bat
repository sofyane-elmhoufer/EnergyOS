@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start_ENSA_EnergyOS.ps1"
if errorlevel 1 pause
endlocal
