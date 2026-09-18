@echo off
setlocal EnableExtensions
title Ghost Nexora Bot - Instalador Windows
color 0B
set "GHOST_NEXORA_INSTALLER_WRAPPER=1"

cls
echo.
echo ======================================================================
echo   GHOST NEXORA BOT - WINDOWS INSTALLER
echo   Bootstrap seguro para Windows 10/11
echo ======================================================================
echo.
echo   Esta ventana permanecera abierta al finalizar o si ocurre un error.
echo   El instalador mostrara exactamente en que etapa fallo.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  color 0C
  echo [ERROR] PowerShell no esta disponible en este sistema.
  goto :failed
)

set "GN_INSTALLER=%TEMP%\ghostnexora-install-%RANDOM%%RANDOM%.ps1"

echo [1/2] Descargando el instalador mas reciente desde GitHub...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1' -OutFile '%GN_INSTALLER%'"
if errorlevel 1 (
  color 0C
  echo.
  echo [ERROR] No se pudo descargar scripts/install-windows.ps1.
  echo         Comprueba Internet, GitHub y la configuracion de red.
  goto :cleanup_failed
)

echo [ OK ] Instalador descargado.
echo [2/2] Iniciando asistente interactivo en esta misma terminal...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GN_INSTALLER%" %*
set "GN_EXIT=%ERRORLEVEL%"

del /q "%GN_INSTALLER%" >nul 2>nul

echo.
if not "%GN_EXIT%"=="0" (
  color 0C
  echo ======================================================================
  echo   INSTALACION FINALIZADA CON ERROR
  echo ======================================================================
  echo   Codigo de salida: %GN_EXIT%
  echo   Revisa el bloque rojo mostrado por el instalador y su archivo log.
  echo   Esta ventana NO se cerrara automaticamente.
  echo.
  pause
  exit /b %GN_EXIT%
)

color 0A
echo ======================================================================
echo   INSTALADOR FINALIZADO CORRECTAMENTE
echo ======================================================================
echo   El MainBot no se inicia automaticamente.
echo   Configuracion: ghostnexora configure
echo   Estado:        ghostnexora status
echo.
echo   Esta ventana permanecera abierta hasta que presiones una tecla.
echo.
pause
exit /b 0

:cleanup_failed
del /q "%GN_INSTALLER%" >nul 2>nul

:failed
echo.
echo ======================================================================
echo   NO SE PUDO INICIAR EL INSTALADOR
echo ======================================================================
echo   La terminal permanecera abierta para que puedas leer el error.
echo.
pause
exit /b 1
