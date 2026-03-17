@echo off
setlocal
echo ========================================
echo   VocabBook Modern - 智能生词本 2.0
echo ========================================
echo.

set "ROOT=%~dp0"
set "VENV_PYTHON=%ROOT%.venv\Scripts\python.exe"

REM Check Python
py --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 未安装，请先安装 Python 3.10+
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js 未安装，请先安装 Node.js 18+
    pause
    exit /b 1
)

if not exist "%VENV_PYTHON%" (
    echo [1/5] 创建项目虚拟环境...
    py -m venv "%ROOT%.venv"
    if errorlevel 1 (
        echo [ERROR] 创建项目虚拟环境失败。
        pause
        exit /b 1
    )
) else (
    echo [1/5] 复用项目虚拟环境...
)

echo [2/5] 安装后端开发依赖...
"%VENV_PYTHON%" -m pip install -r "%ROOT%backend\requirements-dev.txt" -q
if errorlevel 1 (
    echo [ERROR] 后端开发依赖安装失败。
    pause
    exit /b 1
)

echo [3/5] 安装前端依赖...
cd /d "%ROOT%frontend"
call npm install --silent
if errorlevel 1 (
    echo [ERROR] 前端依赖安装失败。
    pause
    exit /b 1
)

echo [4/5] 安装 Electron 依赖...
cd /d "%ROOT%electron"
call npm install --silent
if errorlevel 1 (
    echo [ERROR] Electron 依赖安装失败。
    pause
    exit /b 1
)

echo [5/5] 构建前端...
cd /d "%ROOT%frontend"
call npm run build
if errorlevel 1 (
    echo [ERROR] 前端构建失败。
    pause
    exit /b 1
)

echo.
echo ========================================
echo   安装完成！
echo   运行 start.bat 或 dev.bat 启动应用
echo ========================================
pause
