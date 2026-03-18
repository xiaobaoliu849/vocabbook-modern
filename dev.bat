@echo off
setlocal
set "ROOT=%~dp0"
set "WINDOWS_VENV=%ROOT%.venv-win"
set "LEGACY_VENV=%ROOT%.venv"
set "VENV_PYTHON=%WINDOWS_VENV%\Scripts\python.exe"

if exist "%LEGACY_VENV%\Scripts\python.exe" (
    set "VENV_PYTHON=%LEGACY_VENV%\Scripts\python.exe"
)

echo Starting VocabBook Modern (DEV MODE - Unified Runner)...
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

REM Run the Python script to manage all processes
"%VENV_PYTHON%" "%ROOT%scripts\dev_runner.py"
if errorlevel 1 (
    exit /b %errorlevel%
)

echo.
echo Exiting...
pause
