@echo off
setlocal
set "ROOT=%~dp0"
set "VENV_PYTHON=%ROOT%.venv\Scripts\python.exe"

echo Starting VocabBook Modern...
echo.

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Missing project virtual environment: %VENV_PYTHON%
    echo Run install.bat first, or create .venv and install backend\requirements-dev.txt.
    pause
    exit /b 1
)

REM Start backend in background
start "VocabBook Backend" /min cmd /c "cd /d \"%ROOT%backend\" && \"%VENV_PYTHON%\" -m uvicorn main:app --host 127.0.0.1 --port 8000"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start Electron
cd /d "%ROOT%electron"
call npm start
exit /b %errorlevel%
