@echo off
echo.
echo =======================================
echo   MYL Express - Actualizacion de App
echo =======================================
echo.

cd /d "%~dp0"

echo [1/4] Deteniendo servicio...
net stop "mylfacturacion" 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Descargando actualizaciones desde GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo ERROR: No se pudo actualizar el codigo. Reiniciando servicio...
    net start "mylfacturacion"
    pause
    exit /b 1
)

echo [3/4] Actualizando dependencias...
npm install --production --silent

echo [4/4] Iniciando servicio...
net start "mylfacturacion"

echo.
echo Actualizacion completada correctamente.
echo.
pause
