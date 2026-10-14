# Ghost Nexora — Aplicación Windows

## Estado actual

**Parcial.** El proyecto ya tiene soporte nativo de instalación y operación en Windows 10/11 mediante PowerShell:

```text
scripts/install-windows.ps1
scripts/windows/ghostnexora.ps1
docs/WINDOWS_INSTALL.md
```

El instalador puede preparar Git, Node.js, FFmpeg, yt-dlp, Web opcional y Ollama/Qwen opcional. CI valida sintaxis PowerShell y comandos básicos. Esto cumple una parte importante de la portabilidad, pero **todavía no es la aplicación `.exe` gráfica de un clic anunciada**.

## Objetivo V2

Entregar una aplicación de escritorio `.exe` que permita instalar y administrar Ghost Nexora sin PowerShell manual para operaciones normales, reutilizando el runtime y el gestor ya existentes.

## Stack propuesto

**Tauri 2 + React/TypeScript**.

Razones:

- binario significativamente más pequeño que empaquetar Chromium completo;
- permite compartir UI con la aplicación Linux/Kali;
- backend Rust adecuado para lifecycle, archivos, procesos y actualización;
- reutiliza contratos TypeScript/JSON de Control API;
- genera instalador NSIS/MSI según pipeline elegido.

Electron solo debe usarse si una dependencia imprescindible impide Tauri.

## Arquitectura

```text
Tauri/React UI
      ↓
Desktop Manager (Rust)
      ↓
Local Control API / process manager
      ↓
Ghost Nexora Node runtime
      ├─ WhatsApp
      ├─ Telegram
      └─ Discord
```

La UI no debe ejecutar comandos shell construidos con input del usuario.

## Flujo de primera instalación

1. detectar instalación previa;
2. elegir ubicación de datos;
3. comprobar runtime requerido;
4. instalar/descargar componentes firmados desde release oficial;
5. elegir perfil: Bot Only / Bot + Web / Bot + Ollama / Full;
6. configurar nombre/prefijo/owner;
7. generar token local de Control API;
8. pairing de WhatsApp opcional;
9. configurar Telegram/Discord opcionalmente;
10. iniciar health check;
11. crear acceso directo y entrada de desinstalación.

El instalador PowerShell actual debe mantenerse como alternativa técnica y herramienta de recuperación.

## Dependencias

Dos estrategias válidas:

### A. Runtime administrado por la app

La app descarga una versión Node compatible y herramientas requeridas a un directorio controlado por Ghost Nexora. Reduce errores de PATH y versiones globales.

### B. Runtime del sistema

Reutiliza Node/FFmpeg/yt-dlp ya instalados y corrige faltantes mediante WinGet.

Para usuarios no técnicos se recomienda A; para instalación avanzada puede mantenerse B.

## Directorios

```text
%LOCALAPPDATA%\GhostNexora\
  runtime\
  data\
  logs\
  updates\
  backups\

%PROGRAMFILES%\Ghost Nexora\  # binarios de UI si el instalador lo decide
```

No guardar sesiones dentro de `Program Files` ni del checkout Git.

## Funciones de la UI

```text
Inicio / health
Start / Stop / Restart
Pairing WhatsApp
Telegram / Discord
Subbots
Módulos y comandos
Idioma
Ollama
Web
Providers/descargas
Logs
Métricas
Actualizaciones
Backups / Restore
Doctor
Licencias
```

## Windows Service / inicio automático

Ofrecer como opción, no obligación.

El runtime puede:

- ejecutarse en sesión de usuario para instalación sencilla;
- instalar un servicio administrado si el usuario lo solicita y se dispone de permisos elevados.

La elevación UAC debe solicitarse únicamente para acciones que realmente la necesitan.

## Ollama

Mantener la política actual:

- opcional;
- primera instalación pregunta;
- si no existe, los comandos LLM locales no aparecen;
- la GUI muestra estado, modelo y consumo;
- no intentar instalarlo silenciosamente si el usuario lo rechazó.

## Actualizador

V2 desktop necesita un updater transaccional:

```text
check release manifest
→ validar firma/checksum
→ descargar
→ backup mínimo
→ detener runtime
→ actualizar
→ build/migración si corresponde
→ iniciar
→ health
→ commit o rollback
```

No hacer `git reset --hard` sobre datos del usuario.

## Firma y distribución

El release oficial debe generar:

- `.exe` installer;
- opcional `.msi`;
- SHA-256;
- SBOM;
- changelog;
- firma de código cuando esté disponible;
- provenance/attestation de GitHub Actions.

Microsoft Defender/SmartScreen debe tratarse mediante firma y reputación, no con instrucciones para desactivar seguridad.

## Compatibilidad

Matriz mínima:

```text
Windows 10 22H2 x64
Windows 11 actual x64
Windows 11 arm64 — evaluar/soportar solo si todas las dependencias están disponibles
```

## CI

Mantener el job PowerShell actual y añadir:

```text
windows-desktop-build
windows-installer-smoke
windows-control-api-contract
windows-update-fixture
windows-uninstall-preserves-data
windows-secret-redaction
```

El artefacto release debe salir exclusivamente de CI reproducible.

## Migración de instalaciones existentes

La app detecta las variables/rutas usadas por `install-windows.ps1`, adopta el estado existente y nunca obliga a volver a vincular WhatsApp salvo que la sesión sea inválida.

## Definition of Done V2

- instalador `.exe` generado por CI;
- instalación sin terminal para flujo normal;
- adopta instalaciones PowerShell existentes;
- start/stop/restart/status/logs;
- pairing y plataformas;
- Ollama/Web opcionales;
- actualización + rollback;
- desinstalación conserva o elimina datos según elección explícita;
- español/inglés;
- checksum y procedencia publicados.

Ver [arquitectura multiplataforma](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
