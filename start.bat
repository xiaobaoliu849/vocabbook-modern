@echo off
echo Starting VocabBook Modern...
echo.

REM Start backend in background
start "VocabBook Backend" /min cmd /c "cd /d "%~dp0backend" && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start Electron
cd /d "%~dp0electron"
call npm start
