@echo off
setlocal EnableExtensions
title Ghost Nexora Bot - Instalador Windows

echo.
echo ============================================================
echo  Ghost Nexora Bot - Instalador Windows CMD
echo ============================================================
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [FAIL] PowerShell no esta disponible en este sistema.
  goto :failed
)

set "GN_INSTALLER=%TEMP%\ghostnexora-install-%RANDOM%%RANDOM%.ps1"
echo [1/2] Descargando instalador actualizado...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1' -OutFile '%GN_INSTALLER%'"
if errorlevel 1 (
  echo [FAIL] No se pudo descargar el instalador.
  goto :cleanup_failed
)

echo [2/2] Ejecutando instalacion en esta misma terminal...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GN_INSTALLER%" %*
set "GN_EXIT=%ERRORLEVEL%"

del /q "%GN_INSTALLER%" >nul 2>nul
echo.
if not "%GN_EXIT%"=="0" (
  echo [FAIL] La instalacion termino con codigo %GN_EXIT%.
  echo La ventana permanecera abierta para que puedas leer el error.
  pause
  exit /b %GN_EXIT%
)

echo [ OK ] Instalador finalizado.
echo El bot no se inicia automaticamente.
echo Puedes abrir la configuracion con: ghostnexora configure
echo.
echo La ventana permanecera abierta hasta que presiones una tecla.
pause
exit /b 0

:cleanup_failed
del /q "%GN_INSTALLER%" >nul 2>nul
:failed
echo.
echo La ventana permanecera abierta para que puedas leer el error.
pause
exit /b 1
