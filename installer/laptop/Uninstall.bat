@echo off
REM Starlight Streams uninstaller (laptop). Double click to remove.
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-laptop.ps1"
pause
