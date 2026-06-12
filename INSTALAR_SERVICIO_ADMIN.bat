@echo off
:: ============================================================
:: INSTALAR SERVICIO MYL FACTURACION - Ejecutar como Admin
:: ============================================================
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Necesita permisos de Administrador.
    echo Haz clic derecho ^> "Ejecutar como administrador"
    pause
    exit /b 1
)

set "DAEMON=C:\Users\Admin\Documents\MYL-FACTURACION copia\daemon\mylfacturacion.exe"
set "SERVICIO=mylfacturacion.exe"

echo ============================================================
echo   INSTALADOR SERVICIO MYL FACTURACION
echo ============================================================
echo.

echo [1/4] Deteniendo y eliminando servicio anterior (si existe)...
sc stop "%SERVICIO%" >nul 2>&1
timeout /t 3 /nobreak >nul
"%DAEMON%" uninstall >nul 2>&1
timeout /t 3 /nobreak >nul
sc delete "%SERVICIO%" >nul 2>&1
timeout /t 2 /nobreak >nul
echo     Limpieza completada.

echo [2/4] Instalando servicio...
"%DAEMON%" install
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo al instalar el servicio.
    pause
    exit /b 1
)
echo     Servicio instalado correctamente.

echo [3/4] Iniciando servicio...
sc start "%SERVICIO%"
timeout /t 5 /nobreak >nul

echo [4/4] Estado del servicio:
sc query "%SERVICIO%"

echo.
echo ============================================================
echo   INSTALACION COMPLETADA
echo ============================================================
echo.
echo  El servidor MYL arrancara AUTOMATICAMENTE con Windows
echo  sin necesidad de iniciar sesion en el PC.
echo.
echo  Los empleados acceden desde el navegador con:
echo    http://192.168.1.73:3000
echo.
echo  Puerto: 3000
echo  IP del servidor: 192.168.1.73
echo ============================================================
echo.
pause
