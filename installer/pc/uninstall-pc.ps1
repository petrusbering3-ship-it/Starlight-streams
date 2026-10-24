# Starlight Streams - afinstaller sluk-programmet fra gaming PC'en

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

$logFile = Join-Path $env:TEMP "starlight-uninstall-pc.log"
Start-Transcript -Path $logFile -Force | Out-Null

# Keep the window open on errors, so you can see what went wrong
trap {
    Write-Host ""
    Write-Host "Noget gik galt: $_" -ForegroundColor Red
    Write-Host "Send et billede af denne besked, eller filen $logFile"
    Stop-Transcript | Out-Null
    Read-Host "Tryk Enter for at lukke"
    exit 1
}

$name = "Starlight Power Agent"
Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "Starlight Display Info" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Starlight Display Info" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:ProgramData "Starlight") -Recurse -Force -ErrorAction SilentlyContinue
Get-Process starlight-power-agent -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1
Remove-Item (Join-Path $env:ProgramFiles "Starlight Power Agent") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Sluk-programmet er fjernet. Sunshine kan fjernes under Apps i Windows-indstillinger." -ForegroundColor Green

Stop-Transcript | Out-Null
Read-Host "Tryk Enter for at lukke"
