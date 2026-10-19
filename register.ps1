 = Split-Path -Parent System.Management.Automation.InvocationInfo.MyCommand.Definition
if (-not ) {  = (Get-Location).Path }
 = Join-Path  launcher.vbs

# HKCU\Software\Classes\aram-mayhem 키 생성
 = HKCU:\Software\Classes\aram-mayhem
if (-not (Test-Path )) {
    New-Item -Path  -Force | Out-Null
}
Set-ItemProperty -Path  -Name (default) -Value URL:ARAM Mayhem Protocol
Set-ItemProperty -Path  -Name URL Protocol -Value "

 = \shell\open\command
if (-not (Test-Path )) {
 New-Item -Path -Force | Out-Null
}
Set-ItemProperty -Path -Name (default) -Value wscript.exe " %1"

Write-Host 
Write-Host ======================================================== -ForegroundColor Cyan
Write-Host  [성공] aram-mayhem:// 브라우저 북마크 프로토콜 등록 완료! -ForegroundColor Green
Write-Host ======================================================== -ForegroundColor Cyan
Write-Host 
Write-Host 이제 브라우저 북마크 클릭 한 번으로 서버가 자동 실행됩니다. -ForegroundColor Yellow
Write-Host 안내 페이지(guide.html)를 엽니다...

 = Join-Path guide.html
Start-Process 
