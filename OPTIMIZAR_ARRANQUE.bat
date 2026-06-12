@echo off
:: ============================================================
:: OPTIMIZAR ARRANQUE - MYL FACTURACION
:: Ejecutar como Administrador
:: ============================================================

NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Este script necesita permisos de Administrador.
    echo Haz clic derecho sobre este archivo y selecciona
    echo "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   OPTIMIZANDO ARRANQUE DE MYL FACTURACION
echo ============================================================
echo.

echo [1/4] Deteniendo el servicio actual...
sc stop "mylfacturacion.exe"
timeout /t 3 /nobreak >nul
echo     OK
echo.

echo [2/4] Cambiando inicio a "Automatico (Inicio retrasado)"...
:: El inicio retrasado arranca el servicio DESPUES de que Windows
:: haya iniciado completamente (incluyendo red), evitando fallos
:: en cascada que causaban los 2 minutos de espera.
sc config "mylfacturacion.exe" start= delayed-auto
if %ERRORLEVEL% EQU 0 (
    echo     OK - Inicio retrasado configurado correctamente
) else (
    echo     ERROR al configurar inicio retrasado
    pause
    exit /b 1
)
echo.

echo [3/4] Configurando dependencia de red (Tcpip)...
:: Garantiza que la red este disponible antes de arrancar el servidor
sc config "mylfacturacion.exe" depend= Tcpip
if %ERRORLEVEL% EQU 0 (
    echo     OK - Dependencia de red configurada
) else (
    echo     AVISO: No se pudo configurar dependencia de red (no critico)
)
echo.

echo [4/4] Iniciando el servicio...
sc start "mylfacturacion.exe"
timeout /t 5 /nobreak >nul
sc query "mylfacturacion.exe" | findstr "STATE"
echo.

echo ============================================================
echo   RESULTADO FINAL
echo ============================================================
sc qc "mylfacturacion.exe" | findstr /i "TIPO_INICIO\|START_TYPE\|DEPENDENCIAS\|DEPENDENCIES"
echo.
echo LISTO. La proxima vez que reinicies el PC, el servidor
echo deberia arrancar en menos de 60 segundos.
echo.
echo NOTA: El "Inicio retrasado" hace que Windows espere a que
echo todos sus servicios esten listos antes de arrancar este.
echo Esto evita los errores de puerto que causaban los fallos
echo y los tiempos de espera acumulados (10s x reintentos).
echo.
pause
