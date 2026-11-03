@echo off
REM 0xFLUX - build the Windows installer (0xFLUX_x.y.z_x64-setup.exe).
REM Needs once on the BUILD machine: Python 3.11+, Node.js 18+, Rust (rustup.rs)
REM with "Desktop development with C++" (Visual Studio Build Tools).
REM The resulting installer needs none of these on the machine you install it on.
setlocal
cd /d "%~dp0"

where python >nul 2>nul || (echo Python missing: python.org & goto :fail)
where npm    >nul 2>nul || (echo Node.js missing: nodejs.org & goto :fail)
where cargo  >nul 2>nul || (echo Rust missing: rustup.rs & goto :fail)

echo.
echo  [1/4] Python build environment
if not exist backend\.venv python -m venv backend\.venv || goto :fail
backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt pyinstaller==6.11.1 || goto :fail

echo.
echo  [2/4] Freezing the engine (0xflux-engine.exe)
pushd backend
.venv\Scripts\python.exe -m PyInstaller flux_engine.spec --noconfirm --clean || (popd & goto :fail)
popd
if not exist src-tauri\binaries mkdir src-tauri\binaries
copy /y backend\dist\0xflux-engine.exe src-tauri\binaries\0xflux-engine-x86_64-pc-windows-msvc.exe >nul || goto :fail

echo.
echo  [3/4] Interface + desktop shell dependencies
call npm install --prefix frontend || goto :fail
call npm install || goto :fail

echo.
echo  [4/4] Building the installer
call npx tauri build --config src-tauri\tauri.release.conf.json || goto :fail

echo.
echo  Done. Your installer:
dir /b src-tauri\target\release\bundle\nsis\*.exe
explorer src-tauri\target\release\bundle\nsis
exit /b 0

:fail
echo.
echo  Build failed - see the message above.
pause
exit /b 1
