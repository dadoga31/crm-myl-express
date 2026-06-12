@echo off
:: Necesita ejecutarse como Administrador
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Solicitando permisos de Administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Reiniciando servicio MYL Facturacion...
sc stop "mylfacturacion.exe"
timeout /t 5 /nobreak >nul
sc start "mylfacturacion.exe"
timeout /t 4 /nobreak >nul
sc query "mylfacturacion.exe" | findstr "STATE"
echo.
echo Servicio reiniciado. El servidor cargara el nuevo codigo.
timeout /t 3 /nobreak >nul
