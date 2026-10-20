@echo off
chcp 65001 > nul
cd /d "%~dp0"

if exist "runtime\node.exe" goto launch

where node > nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js를 찾을 수 없습니다.
    echo Portable 버전^(ARAM-Mayhem-Viewer-Portable^)을 받거나 Node.js를 설치해주세요.
    pause
    exit /b 1
)

if not exist node_modules (
    echo 처음 실행: 필수 패키지 설치 중... ^(npm install^)
    call npm install --omit=dev --no-audit --no-fund
    if errorlevel 1 (
        echo [오류] 패키지 설치에 실패했습니다.
        pause
        exit /b 1
    )
)

:launch
rem 서버는 창 없이 백그라운드로 실행되고, 준비되면 브라우저가 열립니다.
start "" wscript.exe "%~dp0launcher.vbs" --open
exit /b 0
