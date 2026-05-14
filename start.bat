@echo off
echo ================================================
echo          GoalFlow - Khoi dong ung dung
echo ================================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/3] Cai dat dependencies...
    call npm install
    echo.
) else (
    echo [1/3] Dependencies da duoc cai dat
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo [2/3] Cau hinh .env...
    echo WARNING: File .env chua ton tai!
    echo Vui long:
    echo   1. Copy file .env.example thanh .env
    echo   2. Dien thong tin API keys vao file .env
    echo   3. Chay lai script nay
    echo.
    pause
    exit /b 1
) else (
    echo [2/3] File .env da ton tai
    echo.
)

echo [3/3] Khoi dong server...
echo.
echo Server se chay tai: http://localhost:3000
echo Nhan Ctrl+C de dung server
echo.
echo ================================================
echo.

node server.js
