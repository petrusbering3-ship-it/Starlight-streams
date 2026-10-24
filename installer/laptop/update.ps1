# Starlight Streams - updates the server on this laptop to the latest release.
#
# Works three ways:
# - the Update button in Starlight Streams runs it as the scheduled task "Starlight Streams Update" (-Silent)
# - the "Opdater Starlight Streams" shortcut on the desktop
# - Update-Starlight.bat from the latest release, also for installs that are too old to update themselves
param([switch]$Silent)
$ErrorActionPreference = "Stop"

$repository = "petrusbering3-ship-it/Starlight-streams"
$serverTask = "Starlight Streams Server"
$updateTask = "Starlight Streams Update"
$shortcutName = "Opdater Starlight Streams.lnk"

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

# The install folder: next to this script, or the default one (when started from a download)
$dir = $PSScriptRoot
if (-not $dir -or -not (Test-Path (Join-Path $dir "web-server.exe"))) {
    $dir = Join-Path $env:ProgramFiles "Starlight Streams"
}

Start-Transcript -Path (Join-Path $env:TEMP "starlight-update.log") -Force | Out-Null

function Wait-ForUser {
    if (-not $Silent) {
        Read-Host "Tryk Enter for at lukke"
    }
}

Write-Host ""
Write-Host "=== Starlight Streams - opdatering ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Join-Path $dir "web-server.exe"))) {
    Write-Host "Starlight Streams er ikke installeret på denne computer ($dir)." -ForegroundColor Red
    Write-Host "Kør Install.bat fra Starlight-Streams-Laptop.zip først."
    Stop-Transcript | Out-Null
    Wait-ForUser
    exit 1
}

$tmp = Join-Path $env:TEMP "starlight-update"
$updated = $false
try {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $tmp | Out-Null

    # Download first, so the server keeps running if the download fails
    Write-Host "Henter den nyeste version ..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"
    $zip = Join-Path $tmp "laptop.zip"
    Invoke-WebRequest "https://github.com/$repository/releases/latest/download/Starlight-Streams-Laptop.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp -Force
    $new = Join-Path $tmp "Starlight-Streams-Laptop"
    Get-ChildItem $new -Recurse | Unblock-File

    Write-Host "Installerer ..."
    Stop-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
    Get-Process web-server -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    # server\ (config and data) is kept
    Copy-Item (Join-Path $new "web-server.exe") $dir -Force
    Remove-Item (Join-Path $dir "static") -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $new "static") $dir -Recurse -Force
    Copy-Item (Join-Path $new "update.ps1") $dir -Force

    $updated = $true
} catch {
    Write-Host "Opdateringen fejlede: $_" -ForegroundColor Red
} finally {
    # Always start the server again, also when the update failed
    Start-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# One click updates from now on: a shortcut on the desktop
try {
    $desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $desktop $shortcutName))
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $dir "update.ps1")`""
    $shortcut.WorkingDirectory = $dir
    $shortcut.IconLocation = "shell32.dll,238"
    $shortcut.Save()
} catch {
    Write-Host "Kunne ikke lave genvejen på skrivebordet: $_"
}

if ($updated) {
    Write-Host ""
    Write-Host "=== Opdateret til den nyeste version! ===" -ForegroundColor Green
    Write-Host "Genindlæs Starlight Streams i browseren (tryk F5)."
    Write-Host "Næste gang: dobbeltklik på 'Opdater Starlight Streams' på skrivebordet."
}

Stop-Transcript | Out-Null
if ($Silent) {
    Unregister-ScheduledTask -TaskName $updateTask -Confirm:$false -ErrorAction SilentlyContinue
}
Wait-ForUser
