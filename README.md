<div align="center">

# 👻 Ghost Nexora Bot

### WhatsApp Multi-Device Bot · Linux VPS · Windows · Termux Lite

**Automatización · Comunidad · Economía · Juegos · RPG · Descargas · Subbots · Moderación · Web opcional · IA opcional**

<br>

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.1.0-8A2BE2?style=flat-square)](https://github.com/Gh0stDeveloper/GhostNexoraBot)
[![License](https://img.shields.io/badge/license-MIT-22C55E?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-11%2B-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=flat-square&logo=windows11&logoColor=white)](docs/WINDOWS_INSTALL.md)
[![Termux](https://img.shields.io/badge/Termux-Lite-000000?style=flat-square&logo=termux&logoColor=white)](https://termux.dev/)

[![GitHub stars](https://img.shields.io/github/stars/Gh0stDeveloper/GhostNexoraBot?style=flat-square&logo=github)](https://github.com/Gh0stDeveloper/GhostNexoraBot/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Gh0stDeveloper/GhostNexoraBot?style=flat-square&logo=github)](https://github.com/Gh0stDeveloper/GhostNexoraBot/forks)
[![GitHub last commit](https://img.shields.io/github/last-commit/Gh0stDeveloper/GhostNexoraBot?style=flat-square&logo=github)](https://github.com/Gh0stDeveloper/GhostNexoraBot/commits/main)
[![GitHub repo size](https://img.shields.io/github/repo-size/Gh0stDeveloper/GhostNexoraBot?style=flat-square&logo=github)](https://github.com/Gh0stDeveloper/GhostNexoraBot)

<br>

**Desarrollado y mantenido por [Ghost Developer](https://github.com/Gh0stDeveloper) / Nexora**  
**Official Tester & Support: [Lord-oscar](https://github.com/Lord-oscar)**

<br>

[![WhatsApp Channel](https://img.shields.io/badge/Canal_oficial-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i)
[![Repository](https://img.shields.io/badge/Código-GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Gh0stDeveloper/GhostNexoraBot)
[![Actions](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

</div>

---

## 📖 Acerca del proyecto

**Ghost Nexora Bot** es una plataforma modular de automatización para **WhatsApp Multi-Device** desarrollada con Node.js, TypeScript y Baileys. Combina mensajería, administración de grupos, economía, juegos, RPG, colecciones, descargas, subbots, automatización, un dashboard web opcional y un stack LLM local opcional.

El proyecto utiliza un único monorepo, pero no obliga a instalar todos sus componentes. En Linux y Windows puedes ejecutar desde un **MainBot mínimo** hasta el despliegue completo con **Web + Ollama/Qwen**.

> [!IMPORTANT]
> **Web y Ollama son independientes y opcionales.** Puedes instalar solo el bot, bot + web, bot + Ollama o el stack completo.

> [!IMPORTANT]
> Las actualizaciones preservan la configuración existente. Una VPS anterior que ya tenga `ghost-nexora-web.service` activo y Ollama configurado seguirá utilizando ambos componentes después de actualizar.

> [!WARNING]
> Ghost Nexora Bot es un proyecto independiente y no oficial. No está afiliado con WhatsApp, Meta ni con los servicios externos utilizados por algunos módulos.

---

## 🧭 Navegación

<details open>
<summary><strong>Índice</strong></summary>

- [Stack visual](#-stack-visual)
- [Características](#-características-principales)
- [Perfiles de instalación](#-perfiles-de-instalación)
- [Web opcional](#-dashboard-web-opcional)
- [Ollama opcional](#-ollama--qwen-opcional)
- [Instalación VPS](#-instalación-linux-vps)
- [Instalación Windows](#-instalación-windows-1011)
- [Instalación Termux](#-instalación-termux-lite)
- [Actualizaciones](#-actualizaciones-seguras)
- [WhatsApp / Baileys](#-whatsapp-multi-device)
- [Módulos](#-módulos-principales)
- [Subbots](#-subbots)
- [Librerías](#-librerías-frameworks-y-herramientas)
- [Arquitectura](#-arquitectura)
- [Persistencia](#-persistencia-y-seguridad)
- [Variables](#-variables-de-entorno)
- [CI/CD](#-cicd)
- [Equipo](#-equipo-y-créditos)
- [Licencia](#-licencia)

</details>

---

# 🧰 Stack visual

<div align="center">

### Core

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-Workspaces-CB3837?style=for-the-badge&logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)
[![Baileys](https://img.shields.io/badge/Baileys-WhatsApp_MD-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

### Web opcional

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Lucide](https://img.shields.io/badge/Lucide-React-F56565?style=for-the-badge&logo=lucide&logoColor=white)](https://lucide.dev/)

### Multimedia e IA

[![FFmpeg](https://img.shields.io/badge/FFmpeg-Multimedia-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-Downloader-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![Playwright](https://img.shields.io/badge/Playwright-Optional-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Sharp](https://img.shields.io/badge/Sharp-Optional-99CC00?style=for-the-badge&logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Qwen_optional-000000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)

### Infraestructura

[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![Linux](https://img.shields.io/badge/Linux-VPS-FCC624?style=for-the-badge&logo=linux&logoColor=111111)](https://www.kernel.org/)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](docs/WINDOWS_INSTALL.md)
[![PowerShell](https://img.shields.io/badge/PowerShell-Native-5391FE?style=for-the-badge&logo=powershell&logoColor=white)](https://learn.microsoft.com/powershell/)
[![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-009639?style=for-the-badge&logo=nginx&logoColor=white)](https://nginx.org/)
[![Termux](https://img.shields.io/badge/Termux-Android-000000?style=for-the-badge&logo=termux&logoColor=white)](https://termux.dev/)

</div>

---

# ✨ Características principales

<table>
<tr>
<td width="50%" valign="top">

### 🔗 WhatsApp

- Multi-Device mediante Baileys 7
- Pairing code y QR fallback
- PN/LID
- Reconexión automática
- Sesión persistente
- MainBot y subbots

</td>
<td width="50%" valign="top">

### 👥 Comunidad

- Administración de grupos
- Antilink y antispam
- Bienvenida y despedida
- Staff global
- Roles y permisos
- Automatizaciones

</td>
</tr>
<tr>
<td valign="top">

### 🪙 Economía

- Nexora Coins `NXC`
- Wallet y banco
- Trabajo y profesiones
- Créditos y score
- Tiendas y mercado
- Rankings y propiedades

</td>
<td valign="top">

### 🎮 Entretenimiento

- Juegos clásicos y PvP
- Casino NXC
- RPG y crafting
- Mascotas, quests y raids
- Waifu Collection

</td>
</tr>
<tr>
<td valign="top">

### 📲 Multimedia

- YouTube
- Audio y video
- Letras
- Redes sociales
- MediaFire / Drive / GitHub
- APK y recursos
- FFmpeg + yt-dlp

</td>
<td valign="top">

### ⚙️ Plataforma

- Subbots aislados por proceso
- Dashboard opcional
- Ollama/Qwen opcional
- Health local
- Instaladores automáticos
- Actualizadores compatibles
- GitHub Actions CI/CD

</td>
</tr>
</table>

---

# 🧩 Perfiles de instalación

| Perfil | Bot | Web | Ollama/Qwen | Uso recomendado |
|---|:---:|:---:|:---:|---|
| **Bot Only** | ✅ | ❌ | ❌ | VPS/PC ligero, solo funciones WhatsApp |
| **Bot + Web** | ✅ | ✅ | ❌ | Dashboard y portal sin LLM local |
| **Bot + Ollama** | ✅ | ❌ | ✅ | IA local sin dashboard |
| **Full** | ✅ | ✅ | ✅ | Todas las funciones del despliegue Full |
| **Termux Lite** | ✅ | ❌ | ❌ | Android, consumo reducido |

### Compatibilidad por sistema

| Componente | 🖥️ Linux VPS | 🪟 Windows | 📱 Termux Lite |
|---|:---:|:---:|:---:|
| WhatsApp / Baileys | ✅ | ✅ | ✅ |
| Economía / banco | ✅ | ✅ | ✅ |
| Juegos / RPG / Waifus | ✅ | ✅ | ✅ |
| Grupos y moderación | ✅ | ✅ | ✅ |
| Descargas compatibles | ✅ | ✅ | ✅ |
| Subbots | ✅ | ✅ | ✅ |
| Dashboard Next.js | ✅ Opcional | ✅ Opcional | ❌ |
| Portal web de subbots | ✅ Con Web | ✅ Con Web | ❌ |
| Ollama / Qwen | ✅ Opcional | ✅ Opcional | ❌ |
| Mini-LLM / RAG / free-chat | ✅ Con Ollama | ✅ Con Ollama | ❌ |
| IA HTTP `.ai` / `.investiga` | ✅ Configurable | ✅ Configurable | ❌ Lite |
| Nginx / HTTPS | ✅ | — | ❌ |
| systemd | ✅ | — | ❌ |
| Gestor `ghostnexora` | — | ✅ | ✅ |
| Build principal | `dist/` | `dist/` | `dist-termux/` |

---

# 🌐 Dashboard web opcional

El dashboard se controla mediante:

```env
WEB_ENABLED=true
```

o:

```env
WEB_ENABLED=false
```

Cuando está **deshabilitado**:

- el MainBot sigue funcionando;
- no se necesita Next.js en ejecución;
- el instalador puede omitir dependencias y build web;
- Linux no habilita `ghost-nexora-web.service`;
- Windows no inicia el proceso del dashboard;
- `.adminpanel` / `.dashboard` no se registran;
- `.subbot portal` deja de anunciar enlaces inexistentes;
- subbots siguen disponibles mediante `status`, `pair` y `qr`.

Cuando está **habilitado**:

- se compila `apps/web`;
- se habilita el dashboard;
- se habilita el portal de subbots;
- `.adminpanel` aparece para el owner.

> [!IMPORTANT]
> Las instalaciones antiguas no tenían `WEB_ENABLED`. El actualizador detecta automáticamente un `ghost-nexora-web.service` activo/habilitado o un build `.next` existente y guarda `WEB_ENABLED=true`. Esto evita apagar accidentalmente una web que ya estaba en producción.

---

# 🧠 Ollama + Qwen opcional

[![Ollama](https://img.shields.io/badge/Ollama-Optional-000000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)
[![Qwen](https://img.shields.io/badge/Qwen-qwen2.5%3A1.5b-615CED?style=for-the-badge)](https://ollama.com/library/qwen2.5)

El LLM local requiere:

```text
OLLAMA_ENABLED=true
          +
ejecutable ollama disponible
```

Si falta alguna condición, el runtime deshabilita el stack local y no registra:

```text
.llm
.minillm
.localai
.corpus
.llmcorpus
.autochat
```

`.ai` e `.investiga` pertenecen a la IA HTTP externa y son independientes de Ollama.

Documentación: [`docs/OLLAMA.md`](docs/OLLAMA.md).

---

# 🚀 Instalación Linux VPS

### Sistemas recomendados

[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%2F24.04-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com/)
[![Debian](https://img.shields.io/badge/Debian-Compatible-A81D33?style=flat-square&logo=debian&logoColor=white)](https://www.debian.org/)

## Instalación interactiva recomendada

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

En una primera instalación pregunta por separado:

```text
¿Instalar y activar dashboard web + portal de subbots? [s/N]:
¿Instalar Ollama + Qwen para LLM local? [s/N]:
```

Ambos son opcionales y la opción predeterminada es **No**.

## Solo Bot

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env INSTALL_WEB=no INSTALL_OLLAMA=no bash
```

## Bot + Web

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env INSTALL_WEB=yes INSTALL_OLLAMA=no bash
```

## Bot + Ollama/Qwen

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env INSTALL_WEB=no INSTALL_OLLAMA=yes OLLAMA_MODEL=qwen2.5:1.5b bash
```

## Full: Bot + Web + Ollama/Qwen

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env INSTALL_WEB=yes INSTALL_OLLAMA=yes OLLAMA_MODEL=qwen2.5:1.5b bash
```

## Web + dominio + HTTPS

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env \
    INSTALL_WEB=yes \
    INSTALL_OLLAMA=no \
    BOT_DOMAIN=bot.example.com \
    LETSENCRYPT_EMAIL=admin@example.com \
    bash
```

## Estado

```bash
sudo systemctl status ghost-nexora-bot --no-pager
```

Si Web está habilitada:

```bash
sudo systemctl status ghost-nexora-web --no-pager
```

Si Ollama está habilitado:

```bash
sudo systemctl status ollama ghost-nexora-llm --no-pager
ollama list
```

## Logs

```bash
sudo journalctl -u ghost-nexora-bot -f
```

---

# 🪟 Instalación Windows 10/11

<div align="center">

[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows/)
[![PowerShell](https://img.shields.io/badge/PowerShell-Native-5391FE?style=for-the-badge&logo=powershell&logoColor=white)](https://learn.microsoft.com/powershell/)
[![WinGet](https://img.shields.io/badge/WinGet-Automatic-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://learn.microsoft.com/windows/package-manager/winget/)

</div>

Ghost Nexora Bot funciona de forma **nativa, sin WSL**.

## Instalación interactiva recomendada

```powershell
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 | iex
```

La primera instalación pregunta por separado:

```text
¿Instalar dashboard web + portal de subbots? [s/N]
¿Instalar Ollama + Qwen? [s/N]
```

## Instalación parametrizada

Descarga el instalador:

```powershell
$installer = "$env:TEMP\ghostnexora-install.ps1"
irm https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-windows.ps1 -OutFile $installer
```

### Solo Bot

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama No
```

### Bot + Web

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web Yes -Ollama No
```

### Bot + Ollama/Qwen

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama Yes -OllamaModel "qwen2.5:1.5b"
```

### Full

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web Yes -Ollama Yes -OllamaModel "qwen2.5:1.5b"
```

### Sin pairing inicial

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama No -SkipPair
```

### Instalar sin arrancar automáticamente

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Web No -Ollama No -NoStart
```

`-SkipWeb` se conserva como alias de compatibilidad para una primera instalación sin dashboard.

## Gestor Windows

```powershell
ghostnexora start
ghostnexora stop
ghostnexora restart
ghostnexora status
ghostnexora logs
ghostnexora pair 521XXXXXXXXXX
ghostnexora update
ghostnexora doctor
```

Con Web habilitada:

```powershell
ghostnexora web-start
ghostnexora web-stop
```

Si `WEB_ENABLED=false`, `ghostnexora web-start` no provoca un fallo del bot: informa que el dashboard está deshabilitado y termina limpiamente.

### Datos Windows

```text
%USERPROFILE%\GhostNexoraBot\
└── código y builds

%LOCALAPPDATA%\GhostNexoraBot\
├── session\
├── data\
│   └── subbots\
├── logs\
└── run\
```

Guía: [`docs/WINDOWS_INSTALL.md`](docs/WINDOWS_INSTALL.md).

---

# 📱 Instalación Termux Lite

Termux Lite siempre utiliza:

```env
NEXORA_RUNTIME_PROFILE=termux-lite
WEB_ENABLED=false
OLLAMA_ENABLED=false
```

Instalación:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-termux.sh | bash
```

Gestor:

```bash
ghostnexora start
ghostnexora stop
ghostnexora restart
ghostnexora status
ghostnexora logs
ghostnexora pair 521XXXXXXXXXX
ghostnexora foreground
ghostnexora update
ghostnexora doctor
ghostnexora wakelock on
ghostnexora wakelock off
```

Termux Lite omite Ollama, LLM local, dashboard, portal web, Playwright/browser pesado, Sharp opcional, Nginx y systemd.

Guía: [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md).

---

# 🔄 Actualizaciones seguras

## Linux VPS

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

El actualizador detecta y conserva:

- sesión de WhatsApp;
- SQLite/economía;
- subbots;
- `WEB_ENABLED`;
- `OLLAMA_ENABLED`;
- entrenamiento LLM en progreso;
- servicios existentes.

### Compatibilidad con una VPS antigua

Si `.env` todavía no contiene `WEB_ENABLED`, se comprueba:

```text
ghost-nexora-web.service activo
        o
ghost-nexora-web.service habilitado
        o
apps/web/.next existente
```

Si se detecta cualquiera de ellos:

```env
WEB_ENABLED=true
```

se guarda automáticamente antes del build y reinicio. Por tanto, una VPS que ya tiene **Bot + Ollama + Web** no pierde ninguna de esas funciones al usar el nuevo actualizador.

## Windows

```powershell
ghostnexora update
```

El gestor lee `WEB_ENABLED` y solo instala/compila Next.js cuando corresponde. Las instalaciones Windows heredadas con `.next` existente se consideran Web habilitada.

## Termux

```bash
ghostnexora update
```

---

# 🔗 WhatsApp Multi-Device

[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)

Capacidades principales:

- pairing code por número;
- QR fallback;
- sesiones persistentes;
- reconexión automática;
- PN/LID;
- resolución de identidad;
- owner/staff/admin;
- workers independientes para subbots;
- timeouts y errores públicos controlados.

Prefijo predeterminado:

```text
.
```

Menú:

```text
.menu
```

El menú se genera desde el **registro efectivo de comandos**, por lo que no muestra funciones pertenecientes a componentes deshabilitados.

---

# 🧩 Módulos principales

<details open>
<summary><strong>🌐 General</strong></summary>

```text
.menu
.ping
.info
.channel
.profile
.credits
```

</details>

<details>
<summary><strong>🪙 Nexora Economy</strong></summary>

```text
.balance
.daily
.work
.job
.deposit
.withdraw
.pay
.rob
.shop
.buy
.bank
.creditscore
```

Incluye wallet, banco, score crediticio, profesiones, minería, tienda, préstamos, inversiones, propiedades y progresión.

</details>

<details>
<summary><strong>🎮 Juegos, RPG y colección</strong></summary>

Incluye Dino, Snake, Doom-style, Ninja, Space Dodge, gato, damas, PVZ2-style, PvP, casino NXC, crafting, mascotas, quests, raids y Waifu Collection.

</details>

<details>
<summary><strong>🎵 Descargas y multimedia</strong></summary>

```text
.yts <texto>
.play <texto|url>
.playvideo <texto>
.ytmp3 <url>
.ytmp4 <url> [calidad]
.ytformats <url>
.lyrics <canción>
.soundcloud <url|texto>
.mediafire <url>
.gdrive <url>
.gitclone <url>
.apk <app>
```

</details>

<details>
<summary><strong>👥 Grupos y seguridad</strong></summary>

```text
.tagall
.hidetag
.link
.group open
.group close
.kick
.promote
.demote
.enable welcome
.enable antilink
.enable antispam
```

</details>

---

# 🤖 Subbots

Los subbots mantienen sesiones independientes y se ejecutan en procesos Node aislados.

```text
.subbot status
.subbot pair 521XXXXXXXXXX
.subbot qr
```

Con Web habilitada:

```text
.subbot portal
.adminpanel
```

Con Web deshabilitada, `portal/adminpanel` no se anuncian y la gestión continúa desde WhatsApp.

```text
MainBot
   │
   └── SubbotManager
         ├── Worker #1 ── Session #1
         ├── Worker #2 ── Session #2
         └── Worker #N ── Session #N
```

---

# 📚 Librerías, frameworks y herramientas

## Core del bot

| Tecnología | Uso |
|---|---|
| [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) | Lenguaje principal |
| [![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/) | Runtime |
| [![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys) | WhatsApp Multi-Device |
| [![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/) | Persistencia |
| [![Zod](https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white)](https://zod.dev/) | Validación |
| [![Pino](https://img.shields.io/badge/Pino-9-687634?logo=nodedotjs&logoColor=white)](https://getpino.io/) | Logging |
| [![Cheerio](https://img.shields.io/badge/Cheerio-1-E88C1F?logo=javascript&logoColor=white)](https://cheerio.js.org/) | Parsing HTML |
| [![Execa](https://img.shields.io/badge/Execa-9-5A29E4?logo=gnubash&logoColor=white)](https://github.com/sindresorhus/execa) | Procesos externos |
| [![QRCode](https://img.shields.io/badge/QRCode-1.5-111111?logo=qrcode&logoColor=white)](https://www.npmjs.com/package/qrcode) | QR |
| [![Mammoth](https://img.shields.io/badge/Mammoth-DOCX-2B579A?logo=microsoftword&logoColor=white)](https://www.npmjs.com/package/mammoth) | DOCX |
| [![pdf-parse](https://img.shields.io/badge/pdf--parse-PDF-B30B00?logo=adobeacrobatreader&logoColor=white)](https://www.npmjs.com/package/pdf-parse) | PDF |

## Multimedia

| Tecnología | Uso |
|---|---|
| [![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/) | Audio/video |
| [![yt-dlp](https://img.shields.io/badge/yt--dlp-FF0000?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp) | Descargas |
| [![Sharp](https://img.shields.io/badge/Sharp-optional-99CC00?logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com/) | Imágenes/stickers |
| [![Playwright](https://img.shields.io/badge/Playwright-optional-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/) | Automatización navegador |

## Web opcional

| Tecnología | Uso |
|---|---|
| [![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/) | Dashboard |
| [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/) | UI |
| [![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) | Estilos |
| [![Lucide](https://img.shields.io/badge/Lucide_React-icons-F56565?logo=lucide&logoColor=white)](https://lucide.dev/) | Iconos |

---

# 🏗️ Arquitectura

```text
GhostNexoraBot/
├── apps/
│   ├── bot/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── core/
│   │   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── termux-lite.ts
│   │   │   ├── subbot-worker.ts
│   │   │   └── subbot-worker-termux.ts
│   │   ├── dist/
│   │   └── dist-termux/
│   └── web/                     opcional
│       ├── app/
│       └── lib/
├── docs/
├── scripts/
│   ├── install.sh
│   ├── update.sh
│   ├── install-windows.ps1
│   ├── windows/ghostnexora.ps1
│   ├── install-termux.sh
│   ├── update-termux.sh
│   └── *-smoke.mjs
├── systemd/
├── .github/workflows/
├── .env.example
└── README.md
```

### Flujo del bot

```text
WhatsApp
   │
   ▼
Baileys Socket
   │
   ▼
Identity / Security / Moderation
   │
   ▼
Command Router
   │
   ├── permisos
   ├── aliases
   ├── componentes opcionales
   └── errores públicos
   │
   ▼
Servicios
   ├── SQLite / Economy
   ├── Downloads / FFmpeg / yt-dlp
   ├── Groups / Community
   ├── Games / RPG
   ├── Subbots
   ├── Web [opcional]
   └── Ollama [opcional]
```

---

# 💾 Persistencia y seguridad

### Linux VPS

```text
/var/lib/ghost-nexora-bot/
├── session/
└── data/
```

### Windows

```text
%LOCALAPPDATA%\GhostNexoraBot\
├── session\
├── data\
├── logs\
└── run\
```

### Termux

```text
$HOME/.ghostnexora/
├── session/
├── data/
├── logs/
└── run/
```

> [!CAUTION]
> Nunca publiques `.env`, `creds.json`, bases SQLite, cookies, API keys, tokens administrativos ni credenciales de WhatsApp.

---

# ⚙️ Variables de entorno

```env
NEXORA_RUNTIME_PROFILE=full
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=5210000000000

SESSION_DIR=./data/session
DATA_DIR=./data
BOT_HEALTH_PORT=3001

# Web opcional
WEB_ENABLED=true
WEB_PORT=3000
PUBLIC_WEB_URL=https://bot.example.com
ADMIN_WEB_TOKEN=

# Ollama opcional
OLLAMA_ENABLED=false
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434

OFFICIAL_CHANNEL_URL=https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
LOG_LEVEL=info
```

Referencia completa: [`.env.example`](.env.example).

> [!NOTE]
> Para compatibilidad, una instalación Full antigua sin `WEB_ENABLED` se interpreta como Web habilitada en runtime; los instaladores/actualizadores además migran explícitamente el valor cuando detectan una web previa.

---

# 🧪 CI/CD

El workflow de GitHub Actions valida:

- `npm audit`;
- TypeScript typecheck;
- build completo;
- Ollama ON/OFF;
- Web ON/OFF;
- ocultamiento de `.adminpanel/.dashboard` sin Web;
- `subbot portal` solo con Web;
- Termux Lite;
- economía y banco;
- assets;
- descargas;
- LLM;
- sintaxis Bash;
- sintaxis PowerShell en `windows-latest`;
- gestor Windows.

[![Open Actions](https://img.shields.io/badge/Ver_ejecuciones-Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

---

# 📚 Documentación

| Documento | Contenido |
|---|---|
| [`docs/FIRST_INSTALL.md`](docs/FIRST_INSTALL.md) | Instalación Linux/VPS |
| [`docs/UPDATING.md`](docs/UPDATING.md) | Actualización y mantenimiento |
| [`docs/OLLAMA.md`](docs/OLLAMA.md) | Ollama/Qwen opcional |
| [`docs/WINDOWS_INSTALL.md`](docs/WINDOWS_INSTALL.md) | Windows 10/11 |
| [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md) | Android / Termux Lite |
| [`README-LLM.md`](README-LLM.md) | Arquitectura LLM |
| [`.env.example`](.env.example) | Variables configurables |

---

# 👥 Equipo y créditos

<div align="center">

<table>
<tr>
<td align="center" width="240">
<a href="https://github.com/Gh0stDeveloper">
<img src="https://github.com/Gh0stDeveloper.png?size=128" width="110" height="110" alt="Ghost Developer" />
</a>
<br><br>
<strong>Ghost Developer</strong>
<br>
<sub>Owner · Lead Developer · Maintainer</sub>
<br><br>
<a href="https://github.com/Gh0stDeveloper">GitHub</a>
</td>
<td align="center" width="240">
<a href="https://github.com/Lord-oscar">
<img src="https://github.com/Lord-oscar.png?size=128" width="110" height="110" alt="Lord-oscar" />
</a>
<br><br>
<strong>Lord-oscar</strong>
<br>
<sub>Official Tester · Support</sub>
<br><br>
<a href="https://github.com/Lord-oscar">GitHub</a>
</td>
</tr>
</table>

### Créditos dentro del bot

```text
.credits
.creditos
.colaboradores
.team
```

</div>

---

# ⚠️ Uso responsable

El operador de cada instancia es responsable de proteger credenciales, evitar spam/abuso, respetar privacidad, derechos de autor y condiciones de las plataformas utilizadas.

WhatsApp, Meta y las demás marcas mencionadas pertenecen a sus respectivos propietarios.

---

# 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**.

[![MIT License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

---

<div align="center">

## 👻 Ghost Nexora Bot

**TypeScript · Node.js · Baileys · SQLite · Next.js opcional · Ollama opcional · Linux · Windows · Termux**

[![Ghost Developer](https://img.shields.io/badge/Developer-Ghost_Developer-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Gh0stDeveloper)
[![Lord-oscar](https://img.shields.io/badge/Tester_%26_Support-Lord--oscar-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Lord-oscar)

[Canal oficial](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [Repositorio](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [Actions](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

**⭐ Si Ghost Nexora Bot te resulta útil, puedes marcar el repositorio con una estrella.**

</div>

<!--
SEO / discoverability:
Ghost Nexora Bot, WhatsApp bot, WhatsApp Multi-Device bot, Baileys bot, Baileys 7,
Node.js WhatsApp bot, TypeScript WhatsApp bot, Windows WhatsApp bot, PowerShell WhatsApp bot,
Termux WhatsApp bot, WhatsApp subbots, WhatsApp economy bot, WhatsApp games bot,
WhatsApp downloader, optional Next.js dashboard, Ollama Qwen WhatsApp bot,
Ghost Developer, Lord-oscar, Nexora, GhostNexoraBot.
-->
