# Starlight Streams - afinstaller fra laptoppen

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

$logFile = Join-Path $env:TEMP "starlight-uninstall-laptop.log"
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

$name = "Starlight Streams Server"
Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
Get-Process web-server -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue

$ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (Test-Path $ts) { & $ts funnel reset }

Start-Sleep -Seconds 1
Remove-Item (Join-Path $env:ProgramFiles "Starlight Streams") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Starlight Streams er fjernet. Tailscale kan fjernes under Apps i Windows-indstillinger." -ForegroundColor Green

Stop-Transcript | Out-Null
Read-Host "Tryk Enter for at lukke"
