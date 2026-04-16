# push.ps1 — run this any time Claude updates the game files
# Usage: .\push.ps1 "your message here"
#        .\push.ps1   (uses a default message if none provided)

param([string]$msg = "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")

Set-Location $PSScriptRoot
git add .
git commit -m $msg
git push
Write-Host ""
Write-Host "Live at: https://fredthesled.github.io/justfkngolf/" -ForegroundColor Green
Write-Host "GitHub Pages usually updates within 30-60 seconds." -ForegroundColor DarkGray
