# Starlight Streams - updates the power agent on the gaming pc to the latest release.
# Runs as the scheduled task "Starlight Power Agent Auto Update": every night, and at the next start
# when the pc was off at night. Only updates when there is a newer release (version.txt is written by the agent).
$ErrorActionPreference = "Stop"

$repository = "petrusbering3-ship-it/Starlight-streams"
$dir = Join-Path $env:ProgramFiles "Starlight Power Agent"
$agentTask = "Starlight Power Agent"
$displaysTask = "Starlight Display Info"

Start-Transcript -Path (Join-Path $env:TEMP "starlight-update-pc.log") -Force | Out-Null

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"

    $latest = (Invoke-RestMethod "https://api.github.com/repos/$repository/releases/latest" -UseBasicParsing).tag_name
    $installed = Get-Content (Join-Path $dir "version.txt") -ErrorAction SilentlyContinue
    if (-not $latest -or $latest -eq $installed) {
        Write-Host "Sluk-programmet er allerede opdateret ($installed)."
        Stop-Transcript | Out-Null
        exit
    }
    Write-Host "Ny version: $latest (installeret: $installed)"

    # Download first, so the agent keeps running if the download fails
    $tmp = Join-Path $env:TEMP "starlight-update-pc"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp "pc.zip"
    Invoke-WebRequest "https://github.com/$repository/releases/latest/download/Starlight-Streams-PC.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp -Force
    $new = Join-Path $tmp "Starlight-Streams-PC"
    Get-ChildItem $new -Recurse | Unblock-File

    Stop-ScheduledTask -TaskName $agentTask -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $displaysTask -ErrorAction SilentlyContinue
    Get-Process starlight-power-agent -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    try {
        Copy-Item (Join-Path $new "starlight-power-agent.exe") $dir -Force
        Copy-Item (Join-Path $new "update-pc.ps1") $dir -Force
        Copy-Item (Join-Path $new "autologon.ps1") $dir -Force
    } finally {
        # Always start the agent again, also when the update failed
        Start-ScheduledTask -TaskName $agentTask -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $displaysTask -ErrorAction SilentlyContinue
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Opdateret til $latest."
} catch {
    Write-Host "Opdateringen fejlede: $_"
}

Stop-Transcript | Out-Null
