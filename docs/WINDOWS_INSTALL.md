# 🪟 Ghost Nexora Bot · Instalación nativa en Windows

Ghost Nexora Bot dispone de un instalador PowerShell específico para **Windows 10/11**. No necesita WSL y mantiene el código, las sesiones y las bases persistentes en ubicaciones separadas.

> [📖 README](../README.md) · [🐧 Linux/VPS](FIRST_INSTALL.md) · [📱 Termux Lite](TERMUX_LITE.md)

---

## ⚡ Instalación rápida

Abre **PowerShell** y ejecuta:

```powershell
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 | iex
```

El instalador utiliza **WinGet** para preparar automáticamente las herramientas necesarias.

### Requisitos del sistema

- Windows 10/11 x64.
- PowerShell 5.1 o PowerShell 7+.
- WinGet / App Installer.
- Conexión a Internet.
- Espacio suficiente para Node, dependencias y descargas.
- Si eliges Ollama, espacio adicional para el modelo Qwen.

---

# 📦 Qué instala

El instalador comprueba e instala cuando falta:

| Componente | WinGet ID | Uso |
|---|---|---|
| Git | `Git.Git` | Código y actualizaciones |
| Node.js LTS | `OpenJS.NodeJS.LTS` | Runtime Node 24+ |
| FFmpeg | `Gyan.FFmpeg` | Audio, video y conversiones |
| yt-dlp | `yt-dlp.yt-dlp` | Descargas multimedia |
| Ollama | `Ollama.Ollama` | Solo si el usuario acepta LLM local |

Después:

1. clona o actualiza `main`;
2. crea el almacenamiento persistente;
3. genera/configura `.env`;
4. pregunta si deseas instalar **Ollama + Qwen** durante la primera instalación;
5. ejecuta `npm install`;
6. compila bot + dashboard;
7. instala el gestor global `ghostnexora`;
8. permite vincular WhatsApp mediante pairing code;
9. inicia MainBot y, salvo que se omita, el dashboard local.

---

# 🧠 Ollama + Qwen es opcional

En una primera instalación aparece una pregunta similar a:

```text
Ollama NO es obligatorio.
Activa LLM local, RAG y conversación libre, pero consume RAM, CPU y almacenamiento.
Modelo recomendado: qwen2.5:1.5b
¿Instalar Ollama + Qwen? [s/N]
```

Si eliges **No**:

```env
OLLAMA_ENABLED=false
```

El bot sigue funcionando normalmente y **no registra ni muestra** los comandos locales relacionados con:

```text
.llm
.minillm
.localai
.corpus
.llmcorpus
.autochat
```

Tampoco se activa la conversación libre local basada en Ollama.

La IA HTTP `.ai` / `.investiga` es independiente y puede utilizarse si su proveedor está configurado.

Si aceptas Ollama, el instalador usa el modelo predeterminado:

```text
qwen2.5:1.5b
```

---

# ⚙️ Instalación con parámetros

Si necesitas controlar el instalador sin responder preguntas, descarga primero el script:

```powershell
$installer = "$env:TEMP\ghostnexora-install.ps1"
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 -OutFile $installer
```

### Instalar Ollama automáticamente

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -Ollama Yes
```

### No instalar Ollama

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -Ollama No
```

### Cambiar modelo

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -Ollama Yes -OllamaModel "qwen2.5:3b"
```

### Omitir pairing inicial

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -SkipPair
```

### Instalar sin arrancar procesos

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -NoStart
```

### No iniciar dashboard automáticamente

```powershell
powershell.exe -ExecutionPolicy Bypass -File $installer -SkipWeb
```

---

# 💾 Directorios

Por defecto:

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

Esto permite actualizar el checkout sin eliminar:

- sesión principal;
- economía SQLite;
- configuración persistente;
- subbots;
- logs;
- estado de runtime.

---

# 🛠️ Gestor `ghostnexora`

El instalador crea un comando global para Windows:

```powershell
ghostnexora help
```

Comandos disponibles:

| Comando | Acción |
|---|---|
| `ghostnexora start` | Inicia MainBot en segundo plano |
| `ghostnexora stop` | Detiene MainBot |
| `ghostnexora restart` | Reinicia MainBot |
| `ghostnexora status` | Estado de procesos, WhatsApp, LLM y subbots |
| `ghostnexora logs` | Sigue logs del MainBot |
| `ghostnexora pair <numero>` | Vincula WhatsApp por pairing code |
| `ghostnexora web-start` | Inicia dashboard local |
| `ghostnexora web-stop` | Detiene dashboard local |
| `ghostnexora update` | Actualiza `main`, dependencias y build |
| `ghostnexora doctor` | Diagnóstico del entorno |

Ejemplo México:

```powershell
ghostnexora pair 521XXXXXXXXXX
```

---

# 🔄 Actualizar

```powershell
ghostnexora update
```

El actualizador integrado:

1. detecta si MainBot/dashboard estaban activos;
2. detiene los procesos necesarios;
3. ejecuta `git fetch` + `git pull --ff-only`;
4. ejecuta `npm install`;
5. recompila el monorepo;
6. conserva `.env`, sesión, bases y subbots;
7. vuelve a iniciar únicamente lo que estaba activo.

---

# 🩺 Diagnóstico

```powershell
ghostnexora doctor
```

Comprueba:

- Node.js;
- npm;
- Git;
- FFmpeg;
- yt-dlp;
- Ollama;
- configuración `OLLAMA_ENABLED`;
- health endpoint del bot.

Estado rápido:

```powershell
ghostnexora status
```

Logs:

```powershell
ghostnexora logs
```

---

# 🌐 Servicios locales

Por defecto:

```text
MainBot health : http://127.0.0.1:3001/health
Dashboard      : http://127.0.0.1:3000
Ollama API     : http://127.0.0.1:11434   (solo si fue instalado/habilitado)
```

El instalador de Windows no configura Nginx, Certbot ni systemd. Esos componentes pertenecen al despliegue Linux/VPS.

---

# 🔐 Seguridad

No publiques ni sincronices accidentalmente:

```text
.env
creds.json
%LOCALAPPDATA%\GhostNexoraBot\data\
%LOCALAPPDATA%\GhostNexoraBot\session\
```

El instalador genera un token administrativo cuando el `.env` conserva el valor predeterminado.

---

# 🧪 CI

GitHub Actions incluye un job específico `windows-installer` que valida:

- sintaxis de `scripts/install-windows.ps1`;
- sintaxis de `scripts/windows/ghostnexora.ps1`;
- ejecución básica de `ghostnexora.ps1 help` sobre `windows-latest`.

El pipeline general también verifica que los comandos locales de LLM se registren únicamente cuando `OLLAMA_ENABLED=true`.

---

## Créditos

**Ghost Developer / Nexora** — Owner · Lead Developer · Maintainer  
**Lord-oscar** — Official Tester · Support
