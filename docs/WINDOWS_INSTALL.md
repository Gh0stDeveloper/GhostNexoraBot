# Ghost Nexora Bot · Instalador nativo para Windows

Ghost Nexora Bot dispone de un instalador interactivo para **Windows 10/11**, sin WSL. El instalador mantiene la misma consola abierta, muestra cada etapa con colores, permite elegir componentes opcionales y deja un registro detallado si algo falla.

> [README](../README.md) · [Linux/VPS](FIRST_INSTALL.md) · [Termux Lite](TERMUX_LITE.md)

---

## Instalación recomendada desde CMD

Abre **CMD** y ejecuta:

```bat
curl.exe -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.cmd -o "%TEMP%\ghostnexora-install.cmd" && call "%TEMP%\ghostnexora-install.cmd"
```

El wrapper CMD:

- descarga siempre el instalador PowerShell actual desde `main`;
- ejecuta todo dentro de la misma ventana;
- no usa `start` ni crea una consola desechable;
- conserva visible toda la salida de Git, WinGet, npm, build y configuración;
- cambia visualmente a rojo cuando el proceso termina con error;
- muestra el código de salida;
- hace `pause` tanto en éxito como en error;
- no inicia MainBot automáticamente.

---

## Aspecto y flujo del asistente

El instalador presenta una terminal organizada por secciones y pasos:

```text
======================================================================
   GHOST NEXORA BOT · WINDOWS INSTALLER
   ASISTENTE DE PRIMERA INSTALACIÓN
======================================================================

  RESUMEN INICIAL
  Repositorio : ...
  Rama        : main
  Código      : ...
  Datos       : ...

┌─ PASO 1/10 Herramientas del sistema
┌─ PASO 2/10 Código fuente
┌─ PASO 3/10 Persistencia y configuración base
┌─ PASO 4/10 Dashboard Web
┌─ PASO 5/10 Ollama + Qwen
┌─ PASO 6/10 Dependencias Node.js
┌─ PASO 7/10 Build de producción
┌─ PASO 8/10 Gestor de Windows
┌─ PASO 9/10 Configuración del bot
┌─ PASO 10/10 Resumen final
```

Los estados se distinguen por color:

- verde: operación correcta;
- cian: etapa o información;
- amarillo: advertencia o decisión pendiente;
- rojo: error que detuvo la instalación;
- gris: información secundaria.

---

## Herramientas que instala o verifica

| Componente | WinGet ID | Uso |
|---|---|---|
| Git | `Git.Git` | Código y actualizaciones |
| Node.js LTS | `OpenJS.NodeJS.LTS` | Runtime Node 24+ |
| FFmpeg | `Gyan.FFmpeg` | Audio, vídeo y conversiones |
| yt-dlp | `yt-dlp.yt-dlp` | Descargas multimedia |
| Ollama | `Ollama.Ollama` | Opcional; LLM local |

Después de una instalación con WinGet, el script repara/refresca el `PATH` en la misma sesión. No requiere cerrar CMD o PowerShell y volver a abrirlo.

---

## Configuración del Dashboard Web

En una primera instalación el asistente pregunta:

```text
¿Deseas instalar/configurar la Web? [s/N]
```

### Web desactivada

Si respondes **No**:

```env
WEB_ENABLED=false
WEB_EXPOSURE=disabled
```

El bot sigue funcionando con WhatsApp, economía, juegos, descargas y subbots. Next.js no se instala ni compila para producción.

### Web local

Si respondes **Sí**, puedes elegir:

```text
[1] LOCAL    · Solo esta PC
[2] PÚBLICA  · Dominio HTTPS
```

En modo local el instalador pregunta el puerto. Por defecto:

```text
Puerto interno del Dashboard [3000]
```

y configura, por ejemplo:

```env
WEB_ENABLED=true
WEB_EXPOSURE=local
WEB_PORT=3000
PUBLIC_WEB_URL=http://127.0.0.1:3000
```

Al finalizar muestra exactamente la URL local que debe abrirse.

El puerto `3001` no puede usarse para la Web porque está reservado para el health del bot.

### Web pública

Si eliges **Pública**, el instalador solicita un dominio o URL HTTPS:

```text
Dominio o URL HTTPS: panel.midominio.com
```

El instalador normaliza el valor como:

```env
WEB_ENABLED=true
WEB_EXPOSURE=public
WEB_PORT=3000
PUBLIC_WEB_URL=https://panel.midominio.com
```

La URL pública debe usar **HTTPS** y no puede ser `localhost`.

El instalador deja claro que configurar `PUBLIC_WEB_URL` no crea mágicamente la exposición pública. Para que el dominio sea accesible desde Internet, el usuario debe tener:

1. DNS apuntando al equipo o al servicio de túnel/proxy;
2. HTTPS válido;
3. reverse proxy o túnel que envíe el tráfico al `WEB_PORT` interno.

Esto evita mostrar un dominio como operativo cuando la capa de red todavía no está configurada.

---

## Ollama + Qwen

El instalador también pregunta:

```text
¿Deseas instalar Ollama + Qwen? [s/N]
```

Si respondes **Sí**:

- instala Ollama si no está presente;
- inicia su API local si hace falta;
- verifica `http://127.0.0.1:11434`;
- descarga/verifica el modelo configurado, por defecto `qwen2.5:1.5b`;
- activa `OLLAMA_ENABLED=true`.

Si respondes **No**:

```env
OLLAMA_ENABLED=false
```

Los comandos LLM locales permanecen ocultos y el resto del bot funciona normalmente.

---

## Persistencia

El código y los datos están separados:

```text
%USERPROFILE%\GhostNexoraBot\
└── código fuente + builds

%LOCALAPPDATA%\GhostNexoraBot\
├── session\
├── data\
│   └── subbots\
├── logs\
│   └── install-error.log
└── run\
```

Esto permite actualizar el código sin borrar sesión, economía, configuración o subbots.

---

## Manejo de errores

Si cualquier etapa falla, el instalador muestra un bloque rojo similar a:

```text
======================================================================
   INSTALACIÓN DETENIDA POR UN ERROR
======================================================================
   Paso   : 6/10
   Etapa  : Dependencias Node.js
   Error  : npm install falló. Código: 1.
   Código : ...
   Log    : ...\GhostNexoraBot\logs\install-error.log
======================================================================
```

El archivo `install-error.log` conserva:

- fecha y hora;
- número de paso;
- etapa;
- mensaje de excepción;
- tipo de excepción;
- línea/comando que estaba ejecutándose;
- posición del error;
- stack de PowerShell.

La salida original del comando también permanece visible en la terminal. Por ejemplo, si falla `npm install`, Git, WinGet o el build, se muestran sus mensajes normales y después el resumen rojo del instalador.

La consola CMD no se cierra automáticamente después del fallo.

---

## Configuración posterior

Después de compilar, una primera instalación abre:

```text
ghostnexora configure
```

Desde ahí se puede configurar:

| Opción | Variable / acción |
|---|---|
| Owner | `OWNER_NUMBERS` |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| LemPi | `LEMPI_API_KEYS` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Anime1v | `ANIME1V_API_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Discord | `DISCORD_BOT_TOKEN` |
| WhatsApp | pairing code |
| MainBot | arranque manual |
| Dashboard | arranque manual |

El bot **no se inicia automáticamente**. El pairing tampoco se ejecuta sin que el usuario lo elija.

---

## Comandos del gestor

Durante la instalación se crea el gestor real en:

```text
%LOCALAPPDATA%\GhostNexora\bin\ghostnexora.cmd
```

y, cuando Windows dispone del directorio estándar de alias de usuario, también se crea un shim en:

```text
%LOCALAPPDATA%\Microsoft\WindowsApps\ghostnexora.cmd
```

`WindowsApps` ya forma parte del `PATH` normal de Windows 10/11, por lo que `ghostnexora` queda disponible incluso en la terminal que estaba abierta antes de ejecutar el instalador. El instalador también conserva `%LOCALAPPDATA%\GhostNexora\bin` en el `PATH` de usuario como respaldo para terminales futuras.

No hace falta ejecutar `npm start` ni cambiar la `ExecutionPolicy` de PowerShell. El gestor llama internamente a `node.exe` y `npm.cmd`, evitando el `npm.ps1` que Windows puede bloquear cuando la política de scripts está restringida.

```text
ghostnexora configure
ghostnexora start
ghostnexora stop
ghostnexora restart
ghostnexora status
ghostnexora logs
ghostnexora pair 521XXXXXXXXXX
ghostnexora update
ghostnexora doctor
ghostnexora web-start
ghostnexora web-stop
```

---

## Instalación no interactiva

Los parámetros anteriores siguen disponibles y se amplían para la Web.

### Solo bot

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama No -SkipPair
```

### Web local

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web Yes -WebMode Local -WebPort 3000 -Ollama No -SkipPair
```

### Web pública

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web Yes -WebMode Public -WebPort 3000 -PublicWebUrl "https://panel.midominio.com" -Ollama No -SkipPair
```

### Bot + Ollama

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama Yes -OllamaModel "qwen2.5:1.5b" -SkipPair
```

---

## Actualización

Después de instalar una vez:

```powershell
ghostnexora update
```

El actualizador conserva `.env`, sesión y datos. Si MainBot o Web estaban activos antes de la actualización, restaura únicamente esos procesos.

---

## Diagnóstico

```powershell
ghostnexora doctor
ghostnexora status
```

`doctor` revisa Node.js, npm, Git, FFmpeg, yt-dlp, Ollama y health local.

---

## CI

GitHub Actions valida:

- sintaxis de `scripts/install-windows.ps1`;
- sintaxis de `scripts/windows/ghostnexora.ps1`;
- ejecución de `ghostnexora help` en `windows-latest`;
- que el instalador no cierre/reabra la terminal;
- que no inicie automáticamente MainBot;
- que mantenga el asistente decorativo;
- que existan los modos Web local/público/desactivado;
- que la Web pública exija HTTPS;
- que los errores registren paso y etapa.
