@echo off
REM 0xFLUX — run backend + web interface (browser) for development.
REM Right-click > "Run as administrator" to enable packet capture / OS detection.
cd /d "%~dp0"
if not exist backend\.venv\Scripts\python.exe (echo Run setup.bat first. & pause & exit /b 1)
start "0xFLUX engine" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe run.py"
timeout /t 2 >nul
start "" http://localhost:1420
call npm --prefix frontend run dev
