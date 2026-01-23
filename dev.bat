@echo off
echo Starting VocabBook Modern (Development Mode)...
echo.
echo [1] Starting Backend (http://localhost:8000)
echo [2] Starting Frontend (http://localhost:5173)
echo.
echo Press Ctrl+C in each terminal to stop.
echo.

REM Start backend
start "Backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start frontend
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Development servers started!
echo.
echo Backend API: http://localhost:8000/docs
echo Frontend:    http://localhost:5173
echo.
pause
