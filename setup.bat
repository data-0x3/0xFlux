@echo off
REM 0xFLUX — one-time setup on Windows. Developed by 0x3.
setlocal
cd /d "%~dp0"

echo.
echo  [0xFLUX] 1/3  Python environment
where python >nul 2>nul || (echo  Python not found. Install Python 3.11+ from python.org ^(tick "Add to PATH"^). & goto :fail)
if not exist backend\.venv python -m venv backend\.venv || goto :fail
backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt || goto :fail

echo.
echo  [0xFLUX] 2/3  Interface dependencies
where npm >nul 2>nul || (echo  Node.js not found. Install Node 18+ from nodejs.org. & goto :fail)
call npm install --prefix frontend || goto :fail

echo.
echo  [0xFLUX] 3/3  Desktop shell (Tauri CLI)
call npm install || goto :fail

echo.
echo  Setup complete.
echo    start-dev.bat  - backend + interface in your browser
echo    start-app.bat  - desktop app (needs Rust: rustup.rs)
echo.
echo  Optional: install Nmap (nmap.org) and Npcap (npcap.com) for service/OS
echo  detection and packet capture.
exit /b 0

:fail
echo.
echo  Setup failed - see the message above.
exit /b 1
