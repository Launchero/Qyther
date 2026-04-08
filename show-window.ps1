# Force show the Electron window
$process = Get-Process | Where-Object {$_.ProcessName -like "*electron*"} | Select-Object -First 1
if ($process) {
    Write-Host "Found Electron process: $($process.Id)"
    Write-Host "The app is running. Check your system tray (bottom-right) for a blue circle icon."
    Write-Host "Click the tray icon to show the window."
} else {
    Write-Host "Electron is not running. Run: npm run dev"
}
