@echo off
REM Starlight Streams (all-in-one: everything on the gaming pc). Double click to remove.
REM The PowerShell script asks for administrator rights itself and opens in its own window.
if exist "%~dp0uninstall-allinone.ps1" goto run
echo.
echo  Pak zip-filen ud foerst: hoejreklik paa zip-filen og vaelg "Udpak alle".
echo  Koer derefter Uninstall.bat fra den udpakkede mappe.
echo.
pause
exit /b
:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-allinone.ps1"
