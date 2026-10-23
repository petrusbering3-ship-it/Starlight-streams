# Starlight Streams - afinstaller fra laptoppen
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
