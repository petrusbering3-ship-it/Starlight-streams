# Starlight Streams - installation på laptoppen (serveren)
$ErrorActionPreference = "Stop"

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
# UTF-8 uden BOM
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20))

# 4. Start automatisk når laptoppen tænder
Write-Host "Sætter Starlight Streams til at starte automatisk ..."
$action = New-ScheduledTaskAction -Execute (Join-Path $dest "web-server.exe") -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
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
powercfg /setactive SCHEME_CURRENT

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
