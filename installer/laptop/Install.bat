@echo off
REM Starlight Streams (laptop). Double click to install.
REM The PowerShell script asks for administrator rights itself and opens in its own window.
if exist "%~dp0install-laptop.ps1" goto run
echo.
echo  Pak zip-filen ud foerst: hoejreklik paa zip-filen og vaelg "Udpak alle".
echo  Koer derefter Install.bat fra den udpakkede mappe.
echo.
pause
exit /b
:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-laptop.ps1"
