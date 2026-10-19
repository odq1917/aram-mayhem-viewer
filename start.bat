@echo off
chcp 65001 > nul
title 롤 증강 칼바람 전적 검색기 (ARAM Mayhem Search Viewer)
cd /d "%~dp0"

echo =======================================================
echo  ⚔️ 롤 증강 칼바람 전적 검색기 (ARAM Mayhem Viewer)
echo =======================================================
echo.

if exist "runtime\node.exe" (
    echo [실행] 내장 런타임으로 서버 실행 및 브라우저 오픈...
    start "" "http://localhost:3500"
    "runtime\node.exe" server.js
    pause
    exit /b
)

if not exist node_modules (
    echo [1/2] 필수 패키지 설치 중... (npm install)
    call npm install
    echo.
)

echo [2/2] 서버 실행 및 브라우저 오픈...
start "" "http://localhost:3500"
node server.js
pause
