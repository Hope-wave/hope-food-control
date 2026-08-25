@echo off
cd /d "%~dp0"
echo Iniciando Hope Food Control...
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"
npm run dev
pause
