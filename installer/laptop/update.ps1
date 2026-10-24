# Starlight Streams - updates the server on this laptop to the latest release.
# Started by the server itself (Update button) as the scheduled task "Starlight Streams Update".
$ErrorActionPreference = "Stop"

$repository = "petrusbering3-ship-it/Starlight-streams"
$dir = $PSScriptRoot
$serverTask = "Starlight Streams Server"
$updateTask = "Starlight Streams Update"

Start-Transcript -Path (Join-Path $dir "update.log") -Force | Out-Null

$tmp = Join-Path $env:TEMP "starlight-update"
try {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $tmp | Out-Null

    # Download first, so the server keeps running if the download fails
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $tmp "laptop.zip"
    Invoke-WebRequest "https://github.com/$repository/releases/latest/download/Starlight-Streams-Laptop.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp -Force
    $new = Join-Path $tmp "Starlight-Streams-Laptop"
    Get-ChildItem $new -Recurse | Unblock-File

    Stop-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
    Get-Process web-server -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    # server\ (config and data) is kept
    Copy-Item (Join-Path $new "web-server.exe") $dir -Force
    Remove-Item (Join-Path $dir "static") -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item (Join-Path $new "static") $dir -Recurse -Force
    Copy-Item (Join-Path $new "update.ps1") $dir -Force

    Write-Host "Updated to the latest release"
} catch {
    Write-Host "Update failed: $_"
} finally {
    # Always start the server again, also when the update failed
    Start-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
    Unregister-ScheduledTask -TaskName $updateTask -Confirm:$false -ErrorAction SilentlyContinue
}
