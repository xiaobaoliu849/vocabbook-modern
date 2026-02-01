@echo off
echo Starting VocabBook Modern (DEV MODE)...
echo.

REM Start Backend
echo Starting Backend...
start "VocabBook Backend" /min cmd /c "cd /d "%~dp0backend" && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

REM Start Frontend
echo Starting Frontend...
start "VocabBook Frontend" /min cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo Waiting for services to start...
timeout /t 5 /nobreak >nul

REM Start Electron
echo Starting Electron...
cd /d "%~dp0electron"
set NODE_ENV=development
call npm start
