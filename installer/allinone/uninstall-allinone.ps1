# Starlight Streams - afinstaller alt-i-én fra gaming PC'en
$ErrorActionPreference = "Stop"

# Run as administrator: start an elevated copy of this script in its own window
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    exit
}

foreach ($script in @("uninstall-laptop.ps1", "uninstall-pc.ps1")) {
    $argumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $PSScriptRoot $script)`"", "-Embedded")
    Start-Process powershell.exe -ArgumentList $argumentList -NoNewWindow -Wait
}

Write-Host "Starlight Streams er fjernet fra PC'en." -ForegroundColor Green
Read-Host "Tryk Enter for at lukke"
