@echo off
echo =========================================
echo VocabBook Modern - Full Build Script
echo =========================================

echo.
echo [1/3] Building Frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    exit /b %errorlevel%
)
cd ..

echo.
echo [2/3] Building Python Backend...
cd backend
echo Creating clean virtual environment...
python -m venv venv-build
call venv-build\Scripts\activate

echo Installing dependencies...
python -m pip install --upgrade pip
pip install pyinstaller fastapi uvicorn aiosqlite edge_tts openai anthropic google-generativeai beautifulsoup4 pydantic requests
pip install -r requirements.txt

echo Cleaning old build files...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo Running PyInstaller...
pyinstaller --name vocabbook-backend --onefile --clean --noupx --hidden-import uvicorn --hidden-import fastapi --hidden-import aiosqlite --hidden-import edge_tts --hidden-import openai --hidden-import anthropic --hidden-import google.generativeai --hidden-import bs4 --hidden-import pydantic main.py

if %errorlevel% neq 0 (
    echo Backend build failed!
    deactivate
    exit /b %errorlevel%
)
deactivate
cd ..

echo.
echo [3/3] Building Electron App...
cd electron
call npm install
call npm run dist:win
if %errorlevel% neq 0 (
    echo Electron build failed!
    exit /b %errorlevel%
)
cd ..

echo.
echo =========================================
echo Build Complete!
echo You can find the installer in the electron/dist folder.
echo =========================================
