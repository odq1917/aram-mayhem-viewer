@echo off
chcp 65001 > nul
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127\.0\.0\.1:3500 .*LISTENING"') do (
    taskkill /pid %%p /f > nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="1" (
    echo MAYHEM.GG 서버를 종료했습니다.
) else (
    echo 실행 중인 MAYHEM.GG 서버가 없습니다.
)
ping -n 3 127.0.0.1 > nul
