# Ghost Nexora Bot · Instalación nativa en Windows

Ghost Nexora Bot dispone de instalación nativa para **Windows 10/11**, sin WSL. El flujo nuevo mantiene la misma terminal durante toda la instalación, no inicia el bot automáticamente y, al terminar, ofrece un menú explícito para completar owner, APIs, pairing y arranque.

> [README](../README.md) · [Linux/VPS](FIRST_INSTALL.md) · [Termux Lite](TERMUX_LITE.md)

---

## Instalación recomendada desde CMD

Abre **CMD** y ejecuta:

```bat
curl.exe -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.cmd -o "%TEMP%\ghostnexora-install.cmd" && call "%TEMP%\ghostnexora-install.cmd"
```

El wrapper `install-windows.cmd`:

- ejecuta PowerShell dentro de la misma ventana de CMD;
- no usa `start` ni crea una terminal desechable;
- conserva la ventana abierta tanto si termina bien como si ocurre un error;
- muestra el error antes de salir;
- deja el MainBot apagado al finalizar salvo que el usuario lo inicie manualmente desde el menú.

## Instalación directa desde PowerShell

```powershell
$installer = "$env:TEMP\ghostnexora-install.ps1"
Invoke-WebRequest https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 -OutFile $installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer
```

También se mantiene el atajo:

```powershell
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 | iex
```

---

## Qué instala

El instalador comprueba y prepara:

| Componente | WinGet ID | Uso |
|---|---|---|
| Git | `Git.Git` | Código y actualizaciones |
| Node.js LTS | `OpenJS.NodeJS.LTS` | Runtime Node 24+ |
| FFmpeg | `Gyan.FFmpeg` | Audio, vídeo y conversiones |
| yt-dlp | `yt-dlp.yt-dlp` | Proveedor multimedia |
| Ollama | `Ollama.Ollama` | Opcional; LLM local |

Después de cada instalación por WinGet, el script refresca el PATH de la **misma sesión** y también revisa `%LOCALAPPDATA%\Microsoft\WinGet\Links` y los paquetes de WinGet. Ya no pide cerrar PowerShell/CMD y volver a abrirlo.

La primera instalación:

1. instala/verifica herramientas;
2. clona `main`;
3. prepara datos persistentes y `.env`;
4. pregunta si deseas Web y Ollama;
5. instala dependencias;
6. compila;
7. instala el comando global `ghostnexora`;
8. abre el menú de configuración;
9. **no** hace pairing por sí solo;
10. **no** inicia MainBot ni Web por sí solo.

---

## Menú de configuración

Después de una primera instalación se abre:

```text
ghostnexora configure
```

Puedes volver a abrirlo en cualquier momento. Incluye:

| Opción | Variable / acción | Dónde se obtiene |
|---|---|---|
| Owner | `OWNER_NUMBERS` | Tu número internacional de WhatsApp |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | https://developer.spotify.com/dashboard |
| LemPi | `LEMPI_API_KEYS` | Proveedor LemPi usado por el proyecto / https://api.lempi.lat |
| OpenRouter | `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| Anime1v | `ANIME1V_API_URL` | Autoalojar https://github.com/FxxMorgan/anime1v-api |
| Telegram | `TELEGRAM_BOT_TOKEN` | https://t.me/BotFather |
| Discord | `DISCORD_BOT_TOKEN` | https://discord.com/developers/applications |
| WhatsApp | pairing code | `ghostnexora pair <numero>` |
| Arranque | MainBot/Web | solo cuando el usuario lo elige |

Las claves sensibles se solicitan con entrada oculta en PowerShell.

### Spotify

El comando `.spotify` usa la Web API oficial para búsqueda y metadatos. Crea una app en Spotify Developer Dashboard y copia el **Client ID** y **Client Secret**.

### Anime

Jikan se utiliza para metadatos y **no requiere API key**. `ANIME1V_API_URL` es opcional: apunta a una instancia autoalojada del proyecto Anime1v, por ejemplo:

```env
ANIME1V_API_URL=http://127.0.0.1:3101
```

No añadas `/api/v1` al final. Si Anime1v corre en la misma PC, usa un puerto distinto de `BOT_HEALTH_PORT=3001` para evitar conflictos.

Consumet público ya no se presupone. Si mantienes una instancia propia puedes usar:

```env
CONSUMET_API_URL=https://tu-consumet.example.com
```

---

## Componentes opcionales

En la primera instalación se puede elegir Web y Ollama:

```text
¿Instalar dashboard web + portal de subbots? [s/N]
¿Instalar Ollama + Qwen? [s/N]
```

Ejemplos no interactivos:

```powershell
# Solo bot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama No -SkipPair

# Bot + Web
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web Yes -Ollama No -SkipPair

# Bot + Ollama
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama Yes -OllamaModel "qwen2.5:1.5b" -SkipPair
```

`-SkipPair` se conserva por compatibilidad y en instalaciones automatizadas omite el menú interactivo posterior. El instalador ya no hace pairing automático.

`-NoStart` también se conserva para compatibilidad, aunque el comportamiento actual ya es **no iniciar automáticamente**.

---

## Gestor `ghostnexora`

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

`configure` es la vía recomendada para completar o cambiar APIs sin editar `.env` manualmente.

---

## Directorios

```text
%USERPROFILE%\GhostNexoraBot\
└── código fuente + builds

%LOCALAPPDATA%\GhostNexoraBot\
├── session\
├── data\
│   └── subbots\
├── logs\
└── run\
```

Código y datos quedan separados para que `ghostnexora update` no elimine sesión, economía, subbots ni configuración.

---

## Actualización

```powershell
ghostnexora update
```

El actualizador conserva `.env`, sesión y datos. Si MainBot/Web estaban encendidos antes de actualizar, restaura únicamente esos procesos.

---

## Diagnóstico

```powershell
ghostnexora doctor
ghostnexora status
```

Comprueba Node.js, npm, Git, FFmpeg, yt-dlp, Ollama y health local.

---

## Seguridad

No publiques:

```text
.env
creds.json
%LOCALAPPDATA%\GhostNexoraBot\data\
%LOCALAPPDATA%\GhostNexoraBot\session\
```

Las API keys y secretos deben permanecer únicamente en el `.env` local.

---

## CI

GitHub Actions valida la sintaxis de:

- `scripts/install-windows.ps1`;
- `scripts/windows/ghostnexora.ps1`;
- el gestor `ghostnexora help` sobre `windows-latest`.

También se valida que el instalador no vuelva a depender de cerrar/reabrir la terminal ni arranque el bot automáticamente.
