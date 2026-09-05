# Ghost Nexora Bot · Termux Lite

Ghost Nexora Bot incluye un perfil específico para Android/Termux pensado para ejecutar el bot con menos procesos, menos servicios externos y sin componentes de IA local.

## Qué incluye

- WhatsApp Multi-Device mediante Baileys.
- Menú generado únicamente con los comandos disponibles en Lite.
- Administración de grupos y seguridad.
- Economía, banco, RPG, colección y juegos.
- Descargas compatibles con las herramientas instaladas en Termux.
- YouTube/yt-dlp y FFmpeg.
- Subbots aislados por proceso, con vinculación por código o QR.
- Persistencia de sesión, economía y subbots fuera del árbol Git.
- Health local en `127.0.0.1:3001/health`.
- Gestor `ghostnexora` para iniciar, detener, actualizar y diagnosticar el bot sin systemd.

## Qué se elimina en Lite

El perfil `termux-lite` no inicia ni expone:

- Ollama.
- LLM local, Mini-LLM y entrenamiento.
- Chat automático basado en LLM.
- Respuestas de voz hacia LLM.
- Next.js / panel web.
- Dashboard administrativo web y portal web de subbots.
- Nginx y Certbot.
- systemd.
- Browser proxy / navegador basado en Playwright.
- Telegram bridge.
- Procesamiento avanzado de imágenes que dependa de Sharp cuando el módulo nativo no esté disponible.

Aunque un `.env` antiguo contenga `OLLAMA_ENABLED=true`, el perfil Termux Lite fuerza Ollama a `false` desde el runtime.

## Instalación rápida

En una instalación normal de Termux:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-termux.sh | bash
```

El instalador:

1. Instala Node.js, Git, FFmpeg, Python, curl, unzip y herramientas base.
2. Instala `yt-dlp` desde los repositorios de Termux o usa Python como fallback.
3. Clona/actualiza el repositorio en `$HOME/GhostNexoraBot`.
4. Guarda datos persistentes en `$HOME/.ghostnexora`.
5. Configura `NEXORA_RUNTIME_PROFILE=termux-lite` y desactiva Ollama/Telegram.
6. Instala únicamente el workspace necesario para el bot.
7. Instala el comando `ghostnexora` en `$PREFIX/bin`.
8. Permite vincular WhatsApp y arranca el bot.

## Directorios

```text
$HOME/GhostNexoraBot/       Código fuente
$HOME/.ghostnexora/session/ Sesión principal de WhatsApp
$HOME/.ghostnexora/data/    Base de datos y datos persistentes
$HOME/.ghostnexora/data/subbots/ Instancias de subbot
$HOME/.ghostnexora/logs/    Logs
$HOME/.ghostnexora/run/     PID del proceso principal
```

La actualización no elimina `session/`, `data/` ni las sesiones de los subbots.

## Comandos de Termux

```bash
ghostnexora start
ghostnexora stop
ghostnexora restart
ghostnexora status
ghostnexora logs
ghostnexora pair 52XXXXXXXXXX
ghostnexora foreground
ghostnexora update
ghostnexora doctor
ghostnexora wakelock on
ghostnexora wakelock off
```

### `ghostnexora start`

Inicia Ghost Nexora Lite en segundo plano y guarda el PID y los logs en `$HOME/.ghostnexora`.

### `ghostnexora pair <numero>`

Detiene temporalmente el bot si está activo, solicita un código de vinculación para WhatsApp y vuelve a iniciar el bot si corresponde.

Ejemplo México:

```bash
ghostnexora pair 521XXXXXXXXXX
```

### `ghostnexora update`

Actualiza `main`, sincroniza las dependencias Lite y reinstala el gestor. La sesión principal, la economía y los subbots se conservan.

### `ghostnexora doctor`

Comprueba Node.js, npm, FFmpeg, yt-dlp, el perfil activo y el health endpoint local.

## Mantener Termux activo

Android puede suspender procesos en segundo plano. Si se utiliza Termux:API y el paquete `termux-api`, puede activarse un wake lock:

```bash
pkg install termux-api
ghostnexora wakelock on
```

También conviene excluir Termux de la optimización agresiva de batería del fabricante cuando el teléfono se utilizará como host permanente.

## Subbots en Lite

Los subbots siguen habilitados. Se ejecutan como procesos aislados y utilizan el mismo perfil Lite que el MainBot:

- sin Ollama/LLM;
- sin dashboard web;
- sin portal web;
- con comandos compatibles con Lite;
- con sesión separada por instancia;
- con cierre automático del worker cuando termina el MainBot, para evitar procesos huérfanos.

Desde WhatsApp se mantienen las acciones:

```text
.subbot status
.subbot pair 52XXXXXXXXXX
.subbot qr
```

El comando `.subbot portal` no se ofrece en Termux Lite porque el panel web no forma parte de esta edición.

## Perfil completo vs. Termux Lite

| Componente | VPS / Full | Termux Lite |
|---|---:|---:|
| WhatsApp / Baileys | Sí | Sí |
| Subbots | Sí | Sí |
| Economía / juegos / grupos | Sí | Sí |
| Descargas | Sí | Sí, según herramientas compatibles |
| Ollama / LLM | Sí, configurable | No |
| Mini-LLM / auto-chat IA | Sí | No |
| Panel Next.js | Sí | No |
| Nginx / HTTPS | Sí | No |
| Browser proxy / Playwright | Sí | No |
| Telegram bridge | Sí | No |
| systemd | Sí | No |
| Gestor `ghostnexora` | No necesario | Sí |

## Desarrollo y CI

El CI ejecuta una prueba `termux-lite-smoke` después del build. La prueba verifica como mínimo que:

- el runtime se identifica como `termux-lite`;
- Ollama permanece forzado a `false`;
- los comandos LLM/IA/navegador/dashboard no aparecen en el registro Lite;
- el menú Lite existe;
- la administración de subbots sigue disponible;
- el comando de subbot no anuncia el portal web.

Los scripts de instalación, actualización y gestión de Termux también pasan `bash -n` en GitHub Actions.
