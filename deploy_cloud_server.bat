@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "SERVER_HOST=8.137.163.86"
set "SERVER_USER=root"
set "REMOTE_ROOT=/var/www/vocabbook-cloud"
set "SERVICE_NAME=vocabbook-cloud"
set "PACKAGE_NAME=vocabbook-cloud-deploy.tar.gz"
set "REMOTE_HELPER=deploy_cloud_server_remote.sh"

echo ========================================
echo   VocabBook Cloud - Quick Deploy
echo   Server: %SERVER_HOST% (api.historyai.fun)
echo ========================================
echo.

if not exist "cloud_server\main.py" (
    echo Error: run this script from the project root
    pause
    exit /b 1
)

echo [1/4] Preparing deployment package...
if exist "deploy_tmp_cloud" rmdir /s /q deploy_tmp_cloud
mkdir deploy_tmp_cloud

xcopy /E /I /Y cloud_server deploy_tmp_cloud\cloud_server >nul
if exist "deploy_tmp_cloud\cloud_server\cloud_app.db" del /q deploy_tmp_cloud\cloud_server\cloud_app.db >nul 2>&1
if exist "deploy_tmp_cloud\cloud_server\__pycache__" rmdir /s /q deploy_tmp_cloud\cloud_server\__pycache__

mkdir deploy_tmp_cloud\deploy >nul 2>&1
xcopy /E /I /Y deploy\nginx deploy_tmp_cloud\deploy\nginx >nul
xcopy /E /I /Y deploy\systemd deploy_tmp_cloud\deploy\systemd >nul

mkdir deploy_tmp_cloud\docs\deploy >nul 2>&1
copy /Y docs\deploy\ALIYUN_CLOUDFLARE_DEPLOY.md deploy_tmp_cloud\docs\deploy\ >nul

if exist "%PACKAGE_NAME%" del /q "%PACKAGE_NAME%"
tar -czf "%PACKAGE_NAME%" -C deploy_tmp_cloud .
if %errorlevel% neq 0 (
    echo Package build failed.
    rmdir /s /q deploy_tmp_cloud
    pause
    exit /b 1
)
rmdir /s /q deploy_tmp_cloud

echo [2/4] Uploading package to server...
scp "%PACKAGE_NAME%" "%REMOTE_HELPER%" %SERVER_USER%@%SERVER_HOST%:/tmp/
if %errorlevel% neq 0 (
    echo Upload failed.
    del /q "%PACKAGE_NAME%"
    pause
    exit /b 1
)
del /q "%PACKAGE_NAME%"

echo [3/4] Deploying remotely and restarting service...
ssh %SERVER_USER%@%SERVER_HOST% "chmod +x /tmp/%REMOTE_HELPER% && /tmp/%REMOTE_HELPER% '%REMOTE_ROOT%' '%SERVICE_NAME%' '/tmp/%PACKAGE_NAME%'"
if %errorlevel% neq 0 (
    echo Remote deployment failed.
    pause
    exit /b 1
)

echo.
echo [4/4] Deployment finished.
echo Public URL: https://api.historyai.fun/
echo.
pause
