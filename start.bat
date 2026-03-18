@echo off
setlocal
set "ROOT=%~dp0"
set "WINDOWS_VENV=%ROOT%.venv-win"
set "LEGACY_VENV=%ROOT%.venv"
set "VENV_PYTHON=%WINDOWS_VENV%\Scripts\python.exe"

if exist "%LEGACY_VENV%\Scripts\python.exe" (
    set "VENV_PYTHON=%LEGACY_VENV%\Scripts\python.exe"
)

echo Starting VocabBook Modern...
echo.

if not exist "%VENV_PYTHON%" (
    if exist "%LEGACY_VENV%\bin\python" (
        echo [INFO] Detected a WSL/Linux virtual environment at %LEGACY_VENV%
        echo [INFO] Windows scripts use %WINDOWS_VENV% to avoid cross-OS conflicts.
        echo.
    )
    echo [ERROR] Missing Windows project virtual environment: %VENV_PYTHON%
    echo Run install.bat first. It will create %WINDOWS_VENV% and install backend\requirements-dev.txt.
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
