@echo off
setlocal
cd /d %~dp0

powershell -NoProfile -ExecutionPolicy Bypass -Command  = (Get-Item .).FullName; = Join-Path 'launcher.vbs'; New-Item -Path 'HKCU:\Software\Classes\aram-mayhem' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\Software\Classes\aram-mayhem' -Name '(default)' -Value 'URL:ARAM Mayhem Protocol'; Set-ItemProperty -Path 'HKCU:\Software\Classes\aram-mayhem' -Name 'URL Protocol' -Value ''; New-Item -Path 'HKCU:\Software\Classes\aram-mayhem\shell\open\command' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\Software\Classes\aram-mayhem\shell\open\command' -Name '(default)' -Value ('wscript.exe ' +  + ' %1'); Write-Host '[성공] aram-mayhem 프로토콜이 등록되었습니다.' -ForegroundColor Green

echo Opening guide page...
start " %~dp0guide.html
