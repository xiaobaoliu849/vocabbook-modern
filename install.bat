@echo off
echo ========================================
echo   VocabBook Modern - 智能生词本 2.0
echo ========================================
echo.

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

echo [1/4] 安装后端依赖...
cd /d "%~dp0backend"
py -m pip install -r requirements.txt -q

echo [2/4] 安装前端依赖...
cd /d "%~dp0frontend"
call npm install --silent

echo [3/4] 安装 Electron 依赖...
cd /d "%~dp0electron"
call npm install --silent

echo [4/4] 构建前端...
cd /d "%~dp0frontend"
call npm run build

echo.
echo ========================================
echo   安装完成！
echo   运行 start.bat 启动应用
echo ========================================
pause
