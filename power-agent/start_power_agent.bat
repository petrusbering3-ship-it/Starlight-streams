@echo off
REM Starlight Streams power agent for Windows.
REM 1. Change MY_SECRET below to your own password (same as power_agent_token in config.json)
REM 2. Put a shortcut to this file in shell:startup so it starts with Windows
REM 3. Allow port 47900 in Windows Firewall when asked
cd /d "%~dp0"
python starlight_power_agent.py --token MY_SECRET
