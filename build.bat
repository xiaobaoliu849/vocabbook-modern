@echo off
echo =========================================
echo VocabBook Modern - Full Build Script
echo =========================================

echo.
echo [1/4] Building Frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed!
    cd ..
    exit /b %errorlevel%
)
cd ..

echo.
echo [2/4] Building Python Backend...
cd backend
echo Creating clean virtual environment (recreated each build to avoid stale deps)...
if exist venv-build rmdir /s /q venv-build
if %errorlevel% neq 0 (
    echo Failed to remove old venv-build!
    cd ..
    exit /b 1
)
python -m venv venv-build
if %errorlevel% neq 0 (
    echo venv creation failed!
    cd ..
    exit /b %errorlevel%
)
call venv-build\Scripts\activate
if %errorlevel% neq 0 (
    echo venv activation failed!
    cd ..
    exit /b %errorlevel%
)

echo Installing dependencies...
python -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo pip upgrade failed!
    call deactivate
    cd ..
    exit /b %errorlevel%
)
pip install pyinstaller fastapi uvicorn aiosqlite edge_tts openai anthropic google-generativeai beautifulsoup4 pydantic requests
if %errorlevel% neq 0 (
    echo dependency install failed!
    call deactivate
    cd ..
    exit /b %errorlevel%
)
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo requirements install failed!
    call deactivate
    cd ..
    exit /b %errorlevel%
)

echo Cleaning old build files...
if exist build-release rmdir /s /q build-release
if exist dist-release rmdir /s /q dist-release

echo Running PyInstaller...
pyinstaller --clean --distpath dist-release --workpath build-release vocabbook-backend.spec

if %errorlevel% neq 0 (
    echo Backend build failed!
    call deactivate
    cd ..
    exit /b %errorlevel%
)
call deactivate
cd ..

echo.
echo [3/4] Building Electron App...
cd electron
call npm install
if %errorlevel% neq 0 (
    echo npm install failed!
    cd ..
    exit /b %errorlevel%
)
call npm run dist:win
if %errorlevel% neq 0 (
    echo Electron build failed!
    cd ..
    exit /b %errorlevel%
)

echo Running release verification gate...
call npm run release:check
if %errorlevel% neq 0 (
    echo Release verification FAILED - do not ship these artifacts!
    cd ..
    exit /b %errorlevel%
)
cd ..

echo.
echo =========================================
echo Build Complete!
echo You can find the installer in the electron/dist folder.
echo =========================================
