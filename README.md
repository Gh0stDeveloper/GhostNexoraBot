<div align="center">

# 👻 Ghost Nexora Bot

### WhatsApp Multi-Device Bot · Full VPS + Termux Lite

**Automatización · Comunidad · Economía · Juegos · RPG · Descargas · Subbots · Moderación · IA opcional**

<br>

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.1.0-8A2BE2?style=flat-square)](https://github.com/Gh0stDeveloper/GhostNexoraBot)
[![License](https://img.shields.io/badge/license-MIT-22C55E?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-11%2B-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
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

**Ghost Nexora Bot** es una plataforma modular de automatización para **WhatsApp Multi-Device** desarrollada con Node.js, TypeScript y Baileys. El proyecto está organizado como un monorepo y combina bot, dashboard, persistencia, herramientas multimedia, economía, juegos, RPG, subbots y automatización de comunidades.

No es únicamente un bot de comandos. Su arquitectura separa el transporte de WhatsApp, el router de comandos, persistencia, workers de subbots, servicios multimedia, seguridad, web y los perfiles de ejecución.

Actualmente existen dos ediciones oficiales dentro del mismo repositorio:

| Edición | Objetivo | Entorno recomendado |
|---|---|---|
| 🖥️ **VPS / Full** | Todas las capacidades del proyecto, dashboard y servicios avanzados | Ubuntu / Debian VPS |
| 📱 **Termux Lite** | Runtime ligero sin LLM/Ollama, navegador pesado ni panel web | Android + Termux |

> [!IMPORTANT]
> **Termux Lite no es un fork.** Utiliza el mismo código fuente y un build dedicado mediante `NEXORA_RUNTIME_PROFILE=termux-lite`, reduciendo dependencias y procesos sin duplicar el proyecto.

> [!WARNING]
> Ghost Nexora Bot es un proyecto independiente y no oficial. No está afiliado con WhatsApp, Meta ni con los servicios externos utilizados por algunos módulos.

---

## 🧭 Navegación

<details open>
<summary><strong>Índice del README</strong></summary>

- [Stack visual](#-stack-visual)
- [Características](#-características-principales)
- [Full vs Termux Lite](#-vps--full-vs-termux-lite)
- [Instalación VPS](#-instalación-vps--full)
- [Instalación Termux](#-instalación-termux-lite)
- [Gestor de Termux](#-gestor-ghostnexora)
- [WhatsApp y Baileys](#-whatsapp-multi-device)
- [Comandos y módulos](#-módulos-y-comandos)
- [Subbots](#-subbots)
- [Stack detallado](#-librerías-frameworks-y-herramientas)
- [Arquitectura](#-arquitectura)
- [Persistencia y seguridad](#-persistencia-y-seguridad)
- [Variables de entorno](#-variables-de-entorno)
- [CI/CD](#-cicd)
- [Desarrollo](#-desarrollo)
- [Equipo y créditos](#-equipo-y-créditos)
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

### Web

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Lucide](https://img.shields.io/badge/Lucide-React-F56565?style=for-the-badge&logo=lucide&logoColor=white)](https://lucide.dev/)

### Multimedia y automatización

[![FFmpeg](https://img.shields.io/badge/FFmpeg-Multimedia-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-Downloader-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![Playwright](https://img.shields.io/badge/Playwright-Optional-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Sharp](https://img.shields.io/badge/Sharp-Optional-99CC00?style=for-the-badge&logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com/)

### Infraestructura

[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![Linux](https://img.shields.io/badge/Linux-VPS-FCC624?style=for-the-badge&logo=linux&logoColor=111111)](https://www.kernel.org/)
[![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-009639?style=for-the-badge&logo=nginx&logoColor=white)](https://nginx.org/)
[![Let's Encrypt](https://img.shields.io/badge/Let's_Encrypt-HTTPS-003A70?style=for-the-badge&logo=letsencrypt&logoColor=white)](https://letsencrypt.org/)
[![Termux](https://img.shields.io/badge/Termux-Android-000000?style=for-the-badge&logo=termux&logoColor=white)](https://termux.dev/)

</div>

---

# ✨ Características principales

<table>
<tr>
<td width="50%" valign="top">

### 🔗 WhatsApp

- Multi-Device mediante Baileys 7
- Pairing code por número
- QR como fallback
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
- Actividad y automatizaciones

</td>
</tr>
<tr>
<td valign="top">

### 🪙 Economía y progreso

- Nexora Coins `NXC`
- Wallet y banco
- Trabajo y profesiones
- Créditos y score
- Tiendas y mercado
- Rankings
- Propiedades y progresión

</td>
<td valign="top">

### 🎮 Entretenimiento

- Juegos clásicos
- PvP
- Casino/apuestas NXC
- RPG y crafting
- Mascotas
- Quests y raids
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

### 🤖 Plataforma

- Subbots aislados por proceso
- Dashboard web en Full
- Health local
- Instaladores automáticos
- Actualizadores seguros
- Termux Lite
- GitHub Actions CI/CD

</td>
</tr>
</table>

---

# ⚖️ VPS / Full vs Termux Lite

| Componente | 🖥️ VPS / Full | 📱 Termux Lite |
|---|:---:|:---:|
| WhatsApp / Baileys | ✅ | ✅ |
| Pairing code + QR | ✅ | ✅ |
| Economía / banco | ✅ | ✅ |
| Juegos / RPG / Waifus | ✅ | ✅ |
| Grupos y moderación | ✅ | ✅ |
| Descargas compatibles | ✅ | ✅ |
| Subbots | ✅ | ✅ |
| Health local | ✅ | ✅ |
| Ollama / LLM | ✅ Opcional | ❌ |
| Mini-LLM / entrenamiento | ✅ | ❌ |
| Auto-chat IA | ✅ | ❌ |
| Playwright / navegador | ✅ Opcional | ❌ |
| Sharp avanzado | ✅ Opcional | ❌ Omitido |
| Dashboard Next.js | ✅ | ❌ |
| Portal web de subbots | ✅ | ❌ |
| Telegram bridge | ✅ Opcional | ❌ |
| Nginx / HTTPS | ✅ | ❌ |
| systemd | ✅ | ❌ |
| Gestor `ghostnexora` | — | ✅ |
| Build | `dist/` | `dist-termux/` |

---

# 🚀 Instalación VPS / Full

### Sistemas recomendados

[![Ubuntu](https://img.shields.io/badge/Ubuntu-22.04%2F24.04-E95420?style=flat-square&logo=ubuntu&logoColor=white)](https://ubuntu.com/)
[![Debian](https://img.shields.io/badge/Debian-Compatible-A81D33?style=flat-square&logo=debian&logoColor=white)](https://www.debian.org/)

Ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador prepara el runtime, dependencias, build, almacenamiento persistente y servicios de producción.

### VPS con dominio + HTTPS

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env BOT_DOMAIN=bot.example.com LETSENCRYPT_EMAIL=admin@example.com bash
```

### Actualizar

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Estado

```bash
sudo systemctl status ghost-nexora-bot --no-pager
```

### Logs

```bash
sudo journalctl -u ghost-nexora-bot -f
```

> [!TIP]
> Consulta [`docs/FIRST_INSTALL.md`](docs/FIRST_INSTALL.md) y [`docs/UPDATING.md`](docs/UPDATING.md) para instalación, pairing, firewall, HTTPS, mantenimiento y rollback.

---

# 📱 Instalación Termux Lite

<div align="center">

[![Android](https://img.shields.io/badge/Android-Termux_Lite-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://www.android.com/)
[![Termux](https://img.shields.io/badge/Termux-No_Root-000000?style=for-the-badge&logo=termux&logoColor=white)](https://termux.dev/)

</div>

Termux Lite está diseñado para ejecutar Ghost Nexora Bot directamente desde Android con menor consumo de almacenamiento, RAM y procesos.

> [!IMPORTANT]
> Ejecuta el instalador dentro de **Termux**, sin `root` y sin `sudo`.

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-termux.sh | bash
```

### El instalador Lite configura

1. Git, Node.js, FFmpeg, Python, curl y utilidades base.
2. `yt-dlp` con fallback mediante Python.
3. Clonado/actualización del repositorio.
4. Datos persistentes en `$HOME/.ghostnexora`.
5. `NEXORA_RUNTIME_PROFILE=termux-lite`.
6. Ollama y LLM forzados a `false`.
7. Instalación sin dependencias opcionales pesadas.
8. Build dedicado `dist-termux/`.
9. Pairing de WhatsApp.
10. Gestor global `ghostnexora`.

### No se carga en Lite

- Ollama
- LLM / Mini-LLM
- entrenamiento local
- auto-chat IA
- Playwright / Chromium
- browser proxy
- Sharp opcional
- dashboard Next.js
- portal web de subbots
- Telegram bridge
- Nginx / Certbot
- systemd

### Datos persistentes

```text
$HOME/GhostNexoraBot/          código y runtime

$HOME/.ghostnexora/
├── session/                   sesión principal
├── data/                      persistencia y SQLite
│   └── subbots/               datos/sesiones de subbots
├── logs/                      logs
└── run/                       PID
```

Guía completa: [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md).

---

# 🛠️ Gestor `ghostnexora`

| Comando | Acción |
|---|---|
| `ghostnexora start` | Inicia el bot en segundo plano |
| `ghostnexora stop` | Detiene el MainBot |
| `ghostnexora restart` | Reinicia MainBot y workers |
| `ghostnexora status` | Estado + health local |
| `ghostnexora logs` | Logs en tiempo real |
| `ghostnexora pair <numero>` | Nuevo pairing code |
| `ghostnexora foreground` | Runtime en primer plano |
| `ghostnexora update` | Actualiza preservando datos |
| `ghostnexora doctor` | Diagnóstico de dependencias |
| `ghostnexora wakelock on` | Mantiene Android despierto |
| `ghostnexora wakelock off` | Libera wake lock |
| `ghostnexora help` | Ayuda |

Ejemplo:

```bash
ghostnexora pair 521XXXXXXXXXX
```

Para Termux:API:

```bash
pkg install termux-api
ghostnexora wakelock on
```

---

# 🔗 WhatsApp Multi-Device

[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)

La conexión utiliza **Baileys 7** y soporta la arquitectura Multi-Device moderna.

### Capacidades

- pairing por número;
- QR fallback;
- sesiones persistentes;
- reconexión automática;
- PN/LID;
- resolución de identidad;
- owner/staff/admin;
- workers independientes para subbots;
- timeout y errores públicos controlados.

Prefijo predeterminado:

```text
.
```

Menú:

```text
.menu
```

El menú moderno se genera a partir del **registro efectivo de comandos**, por lo que Full y Lite muestran únicamente lo que realmente está habilitado.

---

# 🧩 Módulos y comandos

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

`.credits`, `.creditos`, `.colaboradores` y `.team` muestran el equipo oficial del proyecto.

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

> NXC es una moneda virtual interna; no representa dinero real ni criptomoneda.

</details>

<details>
<summary><strong>🎮 Juegos y RPG</strong></summary>

El proyecto incorpora juegos y experiencias como Dino, Snake, Doom-style, Ninja, Space Dodge, gato/tres en raya, damas, PVZ2-style, PvP y juegos económicos.

El RPG incorpora inventario, gathering, crafting, mascotas, quests y raids.

</details>

<details>
<summary><strong>🌸 Nexora Waifu Collection</strong></summary>

```text
.waifu
.rw
.claim
.harem
.wsearch
.winfo
.wgive
.wsell
.wtop
```

Colección persistente con personajes, rareza, propiedad, mercado y economía NXC.

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

El stack puede utilizar `yt-dlp`, FFmpeg, resolvers HTTP y carruseles interactivos.

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

El router distingue owner, staff, administradores, owners de subbot y usuarios normales.

</details>

<details>
<summary><strong>🔞 Módulos opt-in</strong></summary>

El repositorio incluye módulos para adultos que requieren configuración y controles de acceso. Estos módulos deben utilizarse únicamente de forma legal por adultos y rechazan solicitudes que indiquen contenido sexual relacionado con menores.

</details>

---

# 🤖 Subbots

Los subbots mantienen sesiones de WhatsApp independientes y se ejecutan en workers Node separados.

### Usuario

```text
.subbot status
.subbot pair 521XXXXXXXXXX
.subbot qr
```

### Full

Puede habilitar portal web y administración desde dashboard.

### Termux Lite

Los subbots siguen disponibles, pero heredan el perfil Lite:

- sin Ollama/LLM;
- sin dashboard;
- sin portal web;
- sin Playwright;
- con comandos compatibles con Lite;
- cierre del worker cuando desaparece el proceso padre.

```text
MainBot
   │
   └── SubbotManager
         │
         ├── Worker #1 ── Session #1
         ├── Worker #2 ── Session #2
         └── Worker #N ── Session #N
```

---

# 📚 Librerías, frameworks y herramientas

## Core del bot

| Tecnología | Uso |
|---|---|
| [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) | Lenguaje principal y tipado estático |
| [![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/) | Runtime principal |
| [![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys) | WhatsApp Multi-Device |
| [![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/) | Persistencia integrada |
| [![Zod](https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white)](https://zod.dev/) | Validación de datos/configuración |
| [![Pino](https://img.shields.io/badge/Pino-9-687634?logo=nodedotjs&logoColor=white)](https://getpino.io/) | Logging estructurado |
| [![Cheerio](https://img.shields.io/badge/Cheerio-1-E88C1F?logo=javascript&logoColor=white)](https://cheerio.js.org/) | Parsing HTML |
| [![Execa](https://img.shields.io/badge/Execa-9-5A29E4?logo=gnubash&logoColor=white)](https://github.com/sindresorhus/execa) | Ejecución segura de procesos externos |
| [![QRCode](https://img.shields.io/badge/QRCode-1.5-111111?logo=qrcode&logoColor=white)](https://www.npmjs.com/package/qrcode) | QR de vinculación y utilidades |
| [![yt-search](https://img.shields.io/badge/yt--search-2.13-FF0000?logo=youtube&logoColor=white)](https://www.npmjs.com/package/yt-search) | Búsqueda de contenido YouTube |
| [![Mammoth](https://img.shields.io/badge/Mammoth-DOCX-2B579A?logo=microsoftword&logoColor=white)](https://www.npmjs.com/package/mammoth) | Extracción de documentos DOCX |
| [![pdf-parse](https://img.shields.io/badge/pdf--parse-PDF-B30B00?logo=adobeacrobatreader&logoColor=white)](https://www.npmjs.com/package/pdf-parse) | Procesamiento de PDF |

## Multimedia

| Tecnología | Uso |
|---|---|
| [![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/) | Audio, video y conversiones |
| [![yt-dlp](https://img.shields.io/badge/yt--dlp-FF0000?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp) | Descargas multimedia |
| [![Sharp](https://img.shields.io/badge/Sharp-optional-99CC00?logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com/) | Imágenes y stickers en Full |
| [![Playwright](https://img.shields.io/badge/Playwright-optional-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/) | Navegador automatizado en Full |

## Web

| Tecnología | Uso |
|---|---|
| [![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/) | Dashboard y App Router |
| [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/) | UI del dashboard |
| [![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) | Diseño web |
| [![Lucide](https://img.shields.io/badge/Lucide_React-icons-F56565?logo=lucide&logoColor=white)](https://lucide.dev/) | Iconografía |
| [![Highlight.js](https://img.shields.io/badge/Highlight.js-11-F7DF1E?logo=javascript&logoColor=111)](https://highlightjs.org/) | Resaltado de código |

## Infraestructura

| Tecnología | Uso |
|---|---|
| [![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions) | CI/CD y smoke tests |
| [![Nginx](https://img.shields.io/badge/Nginx-009639?logo=nginx&logoColor=white)](https://nginx.org/) | Reverse proxy en Full |
| [![Let's Encrypt](https://img.shields.io/badge/Let's_Encrypt-003A70?logo=letsencrypt&logoColor=white)](https://letsencrypt.org/) | TLS/HTTPS |
| [![systemd](https://img.shields.io/badge/systemd-services-111111?logo=linux&logoColor=white)](https://systemd.io/) | Servicios persistentes en VPS |
| [![Termux](https://img.shields.io/badge/Termux-Lite-000000?logo=termux&logoColor=white)](https://termux.dev/) | Runtime Android |
| [![Ollama](https://img.shields.io/badge/Ollama-optional-000000?logo=ollama&logoColor=white)](https://ollama.com/) | LLM local opcional en Full |

> [!NOTE]
> `sharp` y `playwright` son `optionalDependencies`. La instalación de Termux Lite usa `--omit=optional`, por lo que no arrastra esos componentes.

---

# 🏗️ Arquitectura

Ghost Nexora Bot utiliza **npm Workspaces** para separar bot y web manteniendo un único repositorio.

```text
GhostNexoraBot/
├── apps/
│   ├── bot/
│   │   ├── src/
│   │   │   ├── commands/               comandos por dominio
│   │   │   ├── core/                   router, sesiones y subbots
│   │   │   ├── services/               economía, grupos, multimedia, IA
│   │   │   ├── utils/                  utilidades
│   │   │   ├── index.ts                MainBot Full
│   │   │   ├── termux-lite.ts          MainBot Lite
│   │   │   ├── subbot-worker.ts        worker Full
│   │   │   └── subbot-worker-termux.ts worker Lite
│   │   ├── dist/                        build Full
│   │   ├── dist-termux/                 build Lite
│   │   └── package.json
│   │
│   └── web/
│       ├── app/                         Next.js App Router
│       ├── lib/
│       └── package.json
│
├── docs/
│   ├── FIRST_INSTALL.md
│   ├── UPDATING.md
│   ├── TERMUX_LITE.md
│   └── WINDOWS_INSTALL.md
│
├── scripts/
│   ├── install.sh
│   ├── update.sh
│   ├── install-termux.sh
│   ├── update-termux.sh
│   ├── termux/ghostnexora
│   └── *-smoke.mjs
│
├── systemd/
├── .github/workflows/
├── .env.example
├── README-LLM.md
├── README.md
├── LICENSE
└── package.json
```

### Flujo principal

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
   ├── contexto
   ├── timeouts
   └── errores públicos
   │
   ▼
Command Handler
   │
   ├── SQLite / Economy
   ├── Downloads / FFmpeg / yt-dlp
   ├── Groups / Community
   ├── Games / RPG
   ├── Collections
   ├── External APIs
   └── Subbot Manager
```

---

# 💾 Persistencia y seguridad

### VPS

```text
/var/lib/ghost-nexora-bot/
├── session/
└── data/
```

### Termux

```text
$HOME/.ghostnexora/
├── session/
├── data/
├── logs/
└── run/
```

### Principios

- sesiones fuera del repositorio;
- `.env` excluido de Git;
- aislamiento de subbots;
- permisos owner/staff/admin;
- SQLite persistente;
- actualizadores que conservan estado;
- errores internos sensibles no expuestos al chat;
- tokens aleatorios para componentes administrativos;
- CI con validaciones de producción.

> [!CAUTION]
> Nunca publiques `.env`, `creds.json`, bases SQLite, cookies, API keys, tokens de administración o credenciales de WhatsApp.

---

# ⚙️ Variables de entorno

Ejemplo base:

```env
NEXORA_RUNTIME_PROFILE=full
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=5210000000000
AUTO_REACT=true

SESSION_DIR=./data/session
DATA_DIR=./data
MAX_DOWNLOAD_MB=1900

BOT_HEALTH_PORT=3001
BOT_HEALTH_URL=http://127.0.0.1:3001/health

WEB_PORT=3000
PUBLIC_WEB_URL=https://bot.example.com
ADMIN_WEB_TOKEN=

OLLAMA_ENABLED=false
OFFICIAL_CHANNEL_URL=https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
LOG_LEVEL=info
```

Referencia completa: [`.env.example`](.env.example).

### Termux Lite

El instalador configura automáticamente:

```env
NEXORA_RUNTIME_PROFILE=termux-lite
OLLAMA_ENABLED=false
```

---

# ❤️ Health y observabilidad

Endpoint local:

```text
http://127.0.0.1:3001/health
```

Termux:

```bash
ghostnexora status
ghostnexora doctor
```

VPS:

```bash
curl http://127.0.0.1:3001/health
```

---

# 🧪 CI/CD

<div align="center">

[![GitHub Actions](https://img.shields.io/badge/Continuous_Integration-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

</div>

El workflow principal valida:

- instalación de dependencias;
- `npm audit` de producción;
- TypeScript typecheck;
- build completo;
- build dedicado Termux Lite;
- smoke test `termux-lite`;
- economía y migraciones;
- banco;
- colecciones/assets;
- YouTube;
- LLM Full;
- scripts Bash;
- instaladores y actualizadores.

La prueba Lite verifica además que Ollama permanezca deshabilitado y que comandos de IA/browser/dashboard no entren al registro de Termux.

[![Open Actions](https://img.shields.io/badge/Ver_ejecuciones-Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

---

# 🔄 Actualización

### VPS

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Termux

```bash
ghostnexora update
```

Ambos flujos están diseñados para preservar el estado persistente. El actualizador Lite conserva sesión principal, economía y subbots.

---

# 💻 Desarrollo

### Requisitos

[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-11%2B-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-required-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![Git](https://img.shields.io/badge/Git-required-F05032?logo=git&logoColor=white)](https://git-scm.com/)

### Clonar

```bash
git clone https://github.com/Gh0stDeveloper/GhostNexoraBot.git
cd GhostNexoraBot
npm install
```

### Typecheck

```bash
npm run typecheck
```

### Build Full

```bash
npm run build
```

### Build Termux Lite

```bash
npm run build:termux --workspace=@ghostnexora/bot
```

### Desarrollo del bot

```bash
npm run dev --workspace=@ghostnexora/bot
```

### Desarrollo web

```bash
npm run dev --workspace=@ghostnexora/web
```

---

# 📚 Documentación

| Documento | Contenido |
|---|---|
| [`docs/FIRST_INSTALL.md`](docs/FIRST_INSTALL.md) | Instalación inicial en VPS |
| [`docs/UPDATING.md`](docs/UPDATING.md) | Actualización y mantenimiento |
| [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md) | Android / Termux Lite |
| [`docs/WINDOWS_INSTALL.md`](docs/WINDOWS_INSTALL.md) | Desarrollo/pruebas en Windows |
| [`README-LLM.md`](README-LLM.md) | IA/LLM de la edición Full |
| [`.env.example`](.env.example) | Variables configurables |

---

# 🧰 Diagnóstico rápido

<details>
<summary><strong>Termux</strong></summary>

```bash
ghostnexora doctor
ghostnexora status
ghostnexora logs
```

Reiniciar:

```bash
ghostnexora restart
```

Actualizar/reparar:

```bash
ghostnexora update
```

</details>

<details>
<summary><strong>VPS</strong></summary>

```bash
sudo systemctl status ghost-nexora-bot --no-pager -l
sudo journalctl -u ghost-nexora-bot -n 120 --no-pager
```

</details>

---

# 🤝 Contribución

Antes de enviar cambios:

```bash
npm run typecheck
npm run build
```

Para Termux:

```bash
npm run build:termux --workspace=@ghostnexora/bot
node scripts/termux-lite-smoke.mjs
```

Convención recomendada:

```text
feat: nueva función
fix: corrección
perf: optimización
docs: documentación
test: pruebas
refactor: reorganización
```

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

El comando muestra los créditos oficiales de **Ghost Nexora Bot** tanto en **Full** como en **Termux Lite**.

</div>

---

# ⚠️ Uso responsable

El operador de cada instancia es responsable de:

- respetar las condiciones de las plataformas utilizadas;
- evitar spam, abuso y acoso;
- proteger credenciales y sesiones;
- respetar privacidad y derechos de autor;
- configurar adecuadamente grupos y permisos;
- utilizar módulos restringidos únicamente cuando sea legal y apropiado.

WhatsApp, Meta y las demás marcas mencionadas pertenecen a sus respectivos propietarios.

---

# 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**.

[![MIT License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

---

<div align="center">

## 👻 Ghost Nexora Bot

**Construido con TypeScript · Node.js · Baileys · SQLite · Next.js · React · Termux**

[![Ghost Developer](https://img.shields.io/badge/Developer-Ghost_Developer-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Gh0stDeveloper)
[![Lord-oscar](https://img.shields.io/badge/Tester_%26_Support-Lord--oscar-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Lord-oscar)

[Canal oficial](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [Repositorio](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [Actions](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

**⭐ Si Ghost Nexora Bot te resulta útil, puedes marcar el repositorio con una estrella.**

</div>

<!--
SEO / discoverability:
Ghost Nexora Bot, WhatsApp bot, WhatsApp Multi-Device bot, Baileys bot, Baileys 7,
Node.js WhatsApp bot, TypeScript WhatsApp bot, Termux WhatsApp bot, Android Termux bot,
WhatsApp subbots, WhatsApp economy bot, WhatsApp games bot, WhatsApp downloader,
Next.js bot dashboard, Ghost Developer, Lord-oscar, Nexora, GhostNexoraBot.
-->