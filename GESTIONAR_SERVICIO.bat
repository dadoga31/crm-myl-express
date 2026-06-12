@echo off
:: Requiere ejecutarse como Administrador
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Este script necesita permisos de Administrador.
    echo Haz clic derecho y selecciona "Ejecutar como administrador"
    pause
    exit /b 1
)

echo ============================================
echo   GESTION DEL SERVICIO MYL FACTURACION
echo ============================================
echo.
echo Estado actual:
sc query "mylfacturacion.exe" | findstr "STATE"
echo.
echo Opciones:
echo   1. Ver estado del servicio
echo   2. Iniciar servicio (si esta parado)
echo   3. Detener servicio
echo   4. Reiniciar servicio
echo   5. Salir
echo.
set /p opcion="Selecciona una opcion (1-5): "

if "%opcion%"=="1" goto STATUS
if "%opcion%"=="2" goto START
if "%opcion%"=="3" goto STOP
if "%opcion%"=="4" goto RESTART
if "%opcion%"=="5" goto END

:STATUS
echo.
sc query "mylfacturacion.exe"
goto END

:START
echo.
echo Iniciando servicio...
sc start "mylfacturacion.exe"
timeout /t 3 /nobreak >nul
sc query "mylfacturacion.exe" | findstr "STATE"
goto END

:STOP
echo.
echo Deteniendo servicio...
sc stop "mylfacturacion.exe"
timeout /t 3 /nobreak >nul
sc query "mylfacturacion.exe" | findstr "STATE"
goto END

:RESTART
echo.
echo Reiniciando servicio...
sc stop "mylfacturacion.exe"
timeout /t 5 /nobreak >nul
sc start "mylfacturacion.exe"
timeout /t 3 /nobreak >nul
sc query "mylfacturacion.exe" | findstr "STATE"
goto END

:END
echo.
pause
