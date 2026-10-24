# Starlight Streams - afinstaller sluk-programmet fra gaming PC'en
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
