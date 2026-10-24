@echo off
REM Starlight Streams: updates Starlight Streams on this laptop to the newest version.
REM Works for every installed version: downloads the newest update script and runs it.
echo Henter opdateringen ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f=Join-Path $env:TEMP 'starlight-update.ps1'; Invoke-WebRequest 'https://github.com/petrusbering3-ship-it/Starlight-streams/releases/latest/download/update.ps1' -OutFile $f -UseBasicParsing; & $f"
