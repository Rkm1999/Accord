@echo off
REM Local Development Helper Script for Chat App (Windows)

setlocal enabledelayedexpansion

:MENU
cls
echo ========================================
echo   Chat App - Local Dev Manager
echo ========================================
echo.
echo Available Commands:
echo 1) Start Servers
echo 2) Stop Servers
echo 3) Restart Servers
echo 4) Check Status
echo 5) View Worker Logs
echo 6) View Pages Logs
echo 7) Database Operations
echo 8) Reset Databases
echo 9) Open Application
echo 0) Exit
echo.
set /p choice="Enter command (0-9): "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" goto CHECK
if "%choice%"=="5" goto WORKER_LOGS
if "%choice%"=="6" goto PAGES_LOGS
if "%choice%"=="7" goto DB_MENU
if "%choice%"=="8" goto RESET
if "%choice%"=="9" goto OPEN
if "%choice%"=="0" goto EXIT

echo Invalid choice. Please try again.
timeout /t 2 >nul
goto MENU

:START
echo.
echo Starting development servers...
echo.

echo Starting Worker Server...
cd chat-app\worker
start "Worker Server" cmd /k "npx wrangler dev --port 8787"
timeout /t 3 >nul
echo [OK] Worker started on http://localhost:8787

echo Starting Pages Server...
cd ..
start "Pages Server" cmd /k "npx wrangler pages dev public --port 8788"
timeout /t 3 >nul
echo [OK] Pages started on http://localhost:8788

echo.
echo Waiting for servers to be ready...
timeout /t 5 >nul
echo.
goto CHECK

:STOP
echo.
echo Stopping development servers...
echo.

taskkill /F /FI "WINDOWTITLE eq Worker Server*" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Worker Server stopped
) else (
    echo [INFO] Worker Server was not running
)

taskkill /F /FI "WINDOWTITLE eq Pages Server*" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Pages Server stopped
) else (
    echo [INFO] Pages Server was not running
)

echo.
timeout /t 2 >nul
goto CHECK

:RESTART
call :STOP
timeout /t 2 >nul
call :START
goto MENU

:CHECK
echo Checking server status...
echo.

curl -s http://localhost:8787/api/history >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Worker Server: RUNNING (http://localhost:8787)
) else (
    echo [ERROR] Worker Server: STOPPED
)

curl -s http://localhost:8788 >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Pages Server: RUNNING (http://localhost:8788)
) else (
    echo [ERROR] Pages Server: STOPPED
)

echo.
echo Press any key to continue...
pause >nul
goto MENU

:WORKER_LOGS
echo.
echo Opening Worker Logs...
echo.
echo Note: Logs are displayed in Worker Server window.
echo To view file logs directly, check:
echo   C:\Users\%USERNAME%\.local\share\opencode\tool-output\tool_*.log
echo.
pause >nul
goto MENU

:PAGES_LOGS
echo.
echo Opening Pages Logs...
echo.
echo Note: Logs are displayed in Pages Server window.
echo To view file logs directly, check:
echo   C:\Users\%USERNAME%\.local\share\opencode\tool-output\tool_*.log
echo.
pause >nul
goto MENU

:DB_MENU
cls
echo Database Operations
echo.
echo 1) View Worker Messages
echo 2) View Pages Messages
echo 3) Add Test Message (Worker DB)
echo 4) Clear All Messages (Worker DB)
echo 0) Back to Main Menu
echo.
set /p db_choice="Enter choice (0-4): "

if "%db_choice%"=="1" goto DB_VIEW_WORKER
if "%db_choice%"=="2" goto DB_VIEW_PAGES
if "%db_choice%"=="3" goto DB_ADD
if "%db_choice%"=="4" goto DB_CLEAR
if "%db_choice%"=="0" goto MENU

echo Invalid choice.
pause >nul
goto DB_MENU

:DB_VIEW_WORKER
echo.
echo Worker Database Messages:
echo.
cd chat-app\worker
npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10"
echo.
pause >nul
goto DB_MENU

:DB_VIEW_PAGES
echo.
echo Pages Database Messages:
echo.
cd chat-app
npx wrangler d1 execute chat-history --local --command="SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10"
echo.
pause >nul
goto DB_MENU

:DB_ADD
echo.
set /p username="Enter username: "
set /p message="Enter message: "
cd chat-app\worker
npx wrangler d1 execute chat-history --local --command="INSERT INTO messages (username, message, timestamp) VALUES ('%username%', '%message%', (strftime('%%s', 'now') * 1000)"
echo [OK] Message added
echo.
pause >nul
goto DB_MENU

:DB_CLEAR
echo.
set /p confirm="Are you sure you want to clear ALL messages? (yes/no): "
if /i "%confirm%"=="yes" (
    cd chat-app\worker
    npx wrangler d1 execute chat-history --local --command="DELETE FROM messages"
    echo [OK] All messages cleared
) else (
    echo Operation cancelled
)
echo.
pause >nul
goto DB_MENU

:RESET
echo.
echo Resetting databases...
echo.
set /p confirm="Are you sure you want to reset ALL databases? (yes/no): "
if /i "%confirm%"=="yes" (
    echo Resetting Worker Database...
    cd chat-app\worker
    npx wrangler d1 execute chat-history --local --command="DROP TABLE IF EXISTS messages"
    npx wrangler d1 execute chat-history --local --file=..\database\migrations\0001_init.sql
    echo [OK] Worker Database reset

    echo.
    echo Resetting Pages Database...
    cd ..
    npx wrangler d1 execute chat-history --local --command="DROP TABLE IF EXISTS messages"
    npx wrangler d1 execute chat-history --local --file=.\database\migrations\0001_init.sql
    echo [OK] Pages Database reset

    echo.
    echo Databases reset successfully!
) else (
    echo Operation cancelled
)
echo.
pause >nul
goto MENU

:OPEN
echo.
echo Opening application in browser...
start http://localhost:8788
echo.
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo Goodbye!
timeout /t 2 >nul
exit
