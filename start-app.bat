@echo off
REM 0xFLUX — desktop app (Tauri). The shell starts the backend by itself.
REM Right-click > "Run as administrator" to enable packet capture / OS detection.
cd /d "%~dp0"
where cargo >nul 2>nul || (echo Rust is required for the desktop app: https://rustup.rs & pause & exit /b 1)
if not exist node_modules (echo Run setup.bat first. & pause & exit /b 1)
call npm run app
