@echo off
title Equipment Verification Server
:: 1. บังคับให้เริ่มทำงานในโฟลเดอร์ของไฟล์ bat นี้เสมอ
cd /d "%~dp0"

echo ==========================================
echo    Surgical Instrument Verification
echo ==========================================
echo.

:: 2. Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10 or newer from python.org
    pause
    exit /b
)

:: 3. Check and Create Virtual Environment
if not exist ".venv\Scripts\activate.bat" (
    echo [INFO] Creating virtual environment .venv ...
    python -m venv .venv
)

:: 4. Activate Virtual Environment
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else (
    echo [ERROR] Virtual environment broken. Please delete .venv folder and try again.
    pause
    exit /b
)

:: 5. Install Requirements
echo [INFO] Checking dependencies. This may take a minute...
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install cryptography

:: 6. Get Local IP Address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do set LOCAL_IP=%%a
set LOCAL_IP=%LOCAL_IP: =%

:: 7. Setup SSL Certificate
python generate_cert.py

:: 8. Start the Server
echo.
echo ==========================================
echo  Server is Ready!
echo ==========================================
echo.
echo [1] ** IMPORTANT INSTRUCTIONS **
echo     Because we use a secure connection (HTTPS) for the
echo     webcam, your browser will say "Your connection is not private"
echo.
echo     You MUST click: "Advanced" -^> "Proceed to %LOCAL_IP% (unsafe)"
echo.
echo [2] OPEN BROWSER ON ANY DEVICE TO THIS LINK:
if "%LOCAL_IP%"=="" (
    echo     https://[YOUR-IP-ADDRESS]:8000
) else (
    echo     https://%LOCAL_IP%:8000
)
echo.
echo Press CTRL+C to stop the server
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
pause
