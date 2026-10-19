@echo off
reg delete HKCU\Software\Classes\aram-mayhem /f > nul 2>&1
echo [SUCCESS] 'aram-mayhem://' protocol unregistered.
pause
