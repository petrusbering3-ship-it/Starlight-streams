# Starlight Streams - alt-i-én: alt installeres på gaming PC'en, ingen laptop
# Runs the pc part (Sunshine, power agent) and the server part (Starlight, Tailscale) on the same pc.
$ErrorActionPreference = "Stop"

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

$logFile = Join-Path $env:TEMP "starlight-install-allinone.log"
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

Write-Host ""
Write-Host "=== Starlight Streams - alt-i-én (ingen laptop) ===" -ForegroundColor Cyan
Write-Host ""

Get-ChildItem $src -Recurse | Unblock-File

do {
    $token = Read-Host "Vælg et sluk-password (kun bogstaver a-z og tal)"
} until ($token -match '^[A-Za-z0-9]+$')

do {
    $minutes = Read-Host "Auto-sluk: sluk PC'en efter hvor mange minutter uden stream? (tryk Enter for aldrig)"
    if (-not $minutes) { $minutes = "0" }
} until ($minutes -match '^[0-9]+$')

# Runs one of the normal installers in this window and stops if it fails
function Invoke-Part([string]$script, [string[]]$arguments) {
    $argumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $src $script)`"") + $arguments
    $process = Start-Process powershell.exe -ArgumentList $argumentList -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$script fejlede (se loggen i $env:TEMP)"
    }
}

Write-Host ""
Write-Host "--- 1/2: Sunshine og sluk-programmet ---" -ForegroundColor Cyan
Invoke-Part "install-pc.ps1" @("-Token", $token, "-Embedded")

Write-Host ""
Write-Host "--- 2/2: Starlight Streams og adgang fra internettet ---" -ForegroundColor Cyan
Invoke-Part "install-laptop.ps1" @("-Token", $token, "-Minutes", $minutes, "-Embedded")

Write-Host ""
Write-Host "=== Alt er installeret! ===" -ForegroundColor Green
Write-Host "1. Åbn https://localhost:47990 og opret et brugernavn og password til Sunshine (kun første gang)."
Write-Host "2. Åbn http://localhost:8080. Det første navn og password du skriver, bliver dit login."
Write-Host "3. Tryk på 'tilføj PC'. Din PC dukker op på listen: klik på den."
Write-Host "4. Tryk på PC'en. Skriv PIN-koden under 'PIN' på https://localhost:47990"
Write-Host "5. På Chromebooken: åbn adressen der slutter på .ts.net (står ovenfor) og log ind."
Write-Host ""
Write-Host "Husk: PC'en skal være tændt, når du vil streame. Den kan ikke tændes på afstand." -ForegroundColor Yellow
Write-Host "Genstart PC'en én gang."

Stop-Transcript | Out-Null
Read-Host "Tryk Enter for at lukke"
