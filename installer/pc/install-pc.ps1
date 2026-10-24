# Starlight Streams - installation på gaming PC'en
$ErrorActionPreference = "Stop"

$src = $PSScriptRoot
$dest = Join-Path $env:ProgramFiles "Starlight Power Agent"
$taskName = "Starlight Power Agent"
$ruleName = "Starlight Power Agent"
$port = 47900

Write-Host ""
Write-Host "=== Starlight Streams - installation på gaming PC'en ===" -ForegroundColor Cyan
Write-Host ""

Get-ChildItem $src -Recurse | Unblock-File

# 1. Sluk-password
do {
    $token = Read-Host "Skriv sluk-passwordet (det samme som du valgte på laptoppen)"
} until ($token -match '^[A-Za-z0-9]+$')

# 2. Sunshine (det program der streamer skærmen)
$sunshine = Join-Path $env:ProgramFiles "Sunshine\sunshine.exe"
if (-not (Test-Path $sunshine)) {
    Write-Host "Installerer Sunshine ..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id LizardByte.Sunshine -e --accept-source-agreements --accept-package-agreements
    } else {
        Write-Warning "Kunne ikke installere Sunshine automatisk. Hent det her og installer det:"
        Start-Process "https://github.com/LizardByte/Sunshine/releases/latest"
    }
} else {
    Write-Host "Sunshine er allerede installeret."
}

# 3. Sluk-programmet, starter automatisk når PC'en tænder
Write-Host "Installerer sluk-programmet i $dest ..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-Process starlight-power-agent -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src "starlight-power-agent.exe") $dest -Force

$action = New-ScheduledTaskAction -Execute (Join-Path $dest "starlight-power-agent.exe") -Argument "--token $token --port $port"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null

# 4. Wake-on-LAN, så PC'en kan tændes igen
Write-Host "Slår Wake-on-LAN til på netværkskortet ..."
$adapters = Get-NetAdapter -Physical | Where-Object { $_.MediaType -eq "802.3" }
foreach ($adapter in $adapters) {
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*WakeOnMagicPacket" -RegistryValue 1 -ErrorAction SilentlyContinue
    # Wake from a full shutdown (Realtek: "Shutdown Wake-On-Lan", Intel: "PME")
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "S5WakeOnLan" -RegistryValue 1 -ErrorAction SilentlyContinue
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "EnablePME" -RegistryValue 1 -ErrorAction SilentlyContinue
    # Keep the network card powered while the pc is off
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*EEE" -RegistryValue 0 -ErrorAction SilentlyContinue
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "PowerSavingMode" -RegistryValue 0 -ErrorAction SilentlyContinue
    Set-NetAdapterPowerManagement -Name $adapter.Name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue
    powercfg /deviceenablewake "$($adapter.InterfaceDescription)" | Out-Null
}
if (-not $adapters) {
    Write-Warning "Fandt intet netværkskabel-kort. Wake-on-LAN virker normalt kun med kabel."
}

# Hurtig opstart forhindrer ofte Wake-on-LAN
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name HiberbootEnabled -Value 0 -Type DWord

# 5. Vis PC'ens adresse
# Prefer the cable network card: Wake-on-LAN goes to the card the pc is added with
$configs = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" }
$wired = $configs | Where-Object { $_.NetAdapter.MediaType -eq "802.3" -and $_.NetAdapter.InterfaceDescription -notmatch "Virtual|Hyper-V|VPN|Tailscale|VMware|VirtualBox" } | Select-Object -First 1
if ($wired) {
    $ip = $wired.IPv4Address.IPAddress
} else {
    $ip = ($configs | Select-Object -First 1).IPv4Address.IPAddress
    Write-Warning "PC'en er ikke tilsluttet med netværkskabel. Tænd på afstand (Wake-on-LAN) virker normalt kun med kabel."
}

Write-Host ""
Write-Host "=== Færdig! ===" -ForegroundColor Green
Write-Host "1. Åbn https://localhost:47990 og opret et brugernavn og password til Sunshine (kun første gang)."
Write-Host "2. Gå ind i Starlight Streams, tryk på 'tilføj PC' og skriv denne adresse: $ip"
Write-Host "   (Har du allerede tilføjet PC'en med en anden adresse, så fjern den og tilføj den igen med denne.)"
Write-Host "3. Tryk på PC'en for at parre. Skriv PIN-koden under 'PIN' på https://localhost:47990"
Write-Host "4. Slå 'Wake on LAN' til i BIOS og slå 'ErP' / 'Deep Sleep' fra, så PC'en kan tændes igen."
Write-Host "Genstart PC'en én gang, så alt er slået til."
