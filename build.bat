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
if exist build-release rmdir /s /q build-release
if exist dist-release rmdir /s /q dist-release

echo Running PyInstaller...
pyinstaller --clean --distpath dist-release --workpath build-release vocabbook-backend.spec

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
