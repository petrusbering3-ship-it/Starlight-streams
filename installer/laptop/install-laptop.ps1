# Starlight Streams - installation på laptoppen (serveren)
$ErrorActionPreference = "Stop"

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

$logFile = Join-Path $env:TEMP "starlight-install-laptop.log"
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


$src = $PSScriptRoot
$dest = Join-Path $env:ProgramFiles "Starlight Streams"
$taskName = "Starlight Streams Server"
$ruleName = "Starlight Streams Server"

Write-Host ""
Write-Host "=== Starlight Streams - installation på laptoppen ===" -ForegroundColor Cyan
Write-Host ""

Get-ChildItem $src -Recurse | Unblock-File

# 1. Sluk-password
do {
    $token = Read-Host "Vælg et sluk-password (kun bogstaver a-z og tal, samme skal bruges på gaming PC'en)"
} until ($token -match '^[A-Za-z0-9]+$')

do {
    $minutes = Read-Host "Auto-sluk: sluk gaming PC'en efter hvor mange minutter uden stream? (0 = aldrig, tryk Enter for 30)"
    if (-not $minutes) { $minutes = "30" }
} until ($minutes -match '^[0-9]+$')

# 2. Kopier programmet
Write-Host "Installerer Starlight Streams i $dest ..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-Process web-server -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src "web-server.exe") $dest -Force
if (Test-Path (Join-Path $dest "static")) {
    Remove-Item (Join-Path $dest "static") -Recurse -Force
}
Copy-Item (Join-Path $src "static") $dest -Recurse -Force
# Used by the Update button in Starlight Streams
Copy-Item (Join-Path $src "update.ps1") $dest -Force

# One click updates: "Opdater Starlight Streams" on the desktop
$desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop "Opdater Starlight Streams.lnk"))
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $dest "update.ps1")`""
$shortcut.WorkingDirectory = $dest
$shortcut.IconLocation = "shell32.dll,238"
$shortcut.Save()

# 3. Config med sluk-password (beholder resten af en eksisterende config)
$serverDir = Join-Path $dest "server"
New-Item -ItemType Directory -Force -Path $serverDir | Out-Null
$configPath = Join-Path $serverDir "config.json"
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    $config = [pscustomobject]@{}
}
if (-not $config.moonlight) {
    $config | Add-Member -NotePropertyName moonlight -NotePropertyValue ([pscustomobject]@{})
}
$config.moonlight | Add-Member -NotePropertyName power_agent_token -NotePropertyValue $token -Force
$config.moonlight | Add-Member -NotePropertyName auto_shutdown_minutes -NotePropertyValue ([int]$minutes) -Force
# UTF-8 uden BOM
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20))

# 4. Start automatisk når laptoppen tænder
Write-Host "Sætter Starlight Streams til at starte automatisk ..."
$action = New-ScheduledTaskAction -Execute (Join-Path $dest "web-server.exe") -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
# Priority 2 (above normal): scheduled tasks run below normal by default, which adds lag
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -Priority 2
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

# 5. Firewall
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Program (Join-Path $dest "web-server.exe") -Action Allow -Profile Any | Out-Null

# 6. Laptoppen må ikke gå i dvale (heller ikke når låget er lukket)
Write-Host "Slår dvale fra når laptoppen er tilsluttet strøm ..."
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
# Less lag: the processor doesn't slow down and Wi-Fi doesn't power save on power
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100
powercfg /setacvalueindex SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 0
powercfg /setactive SCHEME_CURRENT
foreach ($adapter in (Get-NetAdapter -Physical -ErrorAction SilentlyContinue)) {
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*InterruptModeration" -RegistryValue 0 -ErrorAction SilentlyContinue
    Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*EEE" -RegistryValue 0 -ErrorAction SilentlyContinue
}

# 7. Tailscale Funnel: adgang fra internettet uden at installere noget på den anden computer
$ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
    Write-Host "Installerer Tailscale ..."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
    } else {
        $setup = Join-Path $env:TEMP "tailscale-setup.exe"
        Invoke-WebRequest "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" -OutFile $setup
        Start-Process $setup -Wait
    }
    Start-Sleep -Seconds 5
}

if (Test-Path $ts) {
    Write-Host ""
    Write-Host "Log ind i Tailscale (gratis konto). Åbn linket der vises herunder, hvis browseren ikke åbner af sig selv." -ForegroundColor Yellow
    & $ts up
    Write-Host ""
    Write-Host "Slår Tailscale Funnel til. Første gang skal du åbne linket og trykke 'Enable'." -ForegroundColor Yellow
    & $ts funnel --bg 8080
    Write-Host ""
    & $ts funnel status
} else {
    Write-Warning "Tailscale blev ikke installeret. Hent det fra https://tailscale.com/download og kør installeren igen."
}

Write-Host ""
Write-Host "=== Færdig! ===" -ForegroundColor Green
Write-Host "Åbn https-adressen ovenfor (den der slutter på .ts.net) i en browser - hvor som helst."
Write-Host "Hjemme kan du også bruge http://localhost:8080 på laptoppen."
Write-Host "Første gang du logger ind, bliver det navn og password du skriver til din admin-konto."
Write-Host "Husk at installere Starlight PC-delen på gaming PC'en med samme sluk-password: $token"

Stop-Transcript | Out-Null
Read-Host "Tryk Enter for at lukke"
