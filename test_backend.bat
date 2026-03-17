@echo off
setlocal

set "ROOT=%~dp0"
set "VENV_PYTHON=%ROOT%.venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Missing project virtual environment: %VENV_PYTHON%
    echo Run install.bat first, or create .venv and install backend\requirements-dev.txt.
    exit /b 1
)

cd /d "%ROOT%"
"%VENV_PYTHON%" -m pytest %*
exit /b %errorlevel%
