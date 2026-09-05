<div align="center">

# 👻 Ghost Nexora Bot

### Bot modular y extensible para WhatsApp Multi-Device

**Baileys 7 · Node.js 24 · TypeScript · SQLite · Next.js · Termux Lite · Subbots · Economía · Juegos · Descargas · Moderación**

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc14-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Desarrollado por Ghost Developer / Nexora**

[📢 Canal oficial](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [📦 Repositorio](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [🧪 GitHub Actions](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions) · [📚 Documentación](docs/)

</div>

---

## 📖 Acerca de Ghost Nexora Bot

**Ghost Nexora Bot** es una plataforma de automatización para **WhatsApp Multi-Device** construida sobre Baileys y diseñada como un monorepo modular. No se limita a responder comandos: incorpora administración de grupos, economía persistente, banco, juegos, RPG, colecciones, subbots aislados, descargas multimedia, personalización, herramientas para comunidades y una edición ligera especialmente preparada para **Android + Termux**.

El proyecto dispone actualmente de dos perfiles de ejecución:

- 🖥️ **VPS / Full** — edición completa para servidores Linux, con servicios persistentes, panel web, proxy, automatización e integraciones avanzadas.
- 📱 **Termux Lite** — edición optimizada para Android, sin Ollama/LLM, navegador pesado, panel web, Nginx ni systemd, pero conservando WhatsApp, economía, juegos, grupos, descargas compatibles y **subbots**.

El menú del bot se genera desde el registro real de comandos activos, por lo que cada edición muestra únicamente las funciones disponibles en ese entorno.

> [!IMPORTANT]
> Ghost Nexora Bot es un proyecto no oficial y no está afiliado con WhatsApp, Meta ni las plataformas externas compatibles. Utiliza cada módulo respetando las condiciones de uso, licencias, derechos de autor y legislación aplicable.

---

## 🧭 Contenido

- [Características principales](#-características-principales)
- [VPS Full vs Termux Lite](#-vps--full-vs-termux-lite)
- [Instalación rápida](#-instalación-rápida)
- [Instalación en Termux](#-ghost-nexora-bot--termux-lite)
- [Comandos de administración de Termux](#-gestor-ghostnexora-para-termux)
- [WhatsApp Multi-Device](#-whatsapp-multi-device)
- [Sistema de comandos](#-ecosistema-de-comandos)
- [Economía y banco](#-nexora-economy--banco)
- [Juegos y RPG](#-juegos-rpg-y-colecciones)
- [Subbots](#-subbots)
- [Administración de grupos](#-grupos-seguridad-y-moderación)
- [Descargas](#-descargas-y-multimedia)
- [IA y automatización](#-ia-automatización-y-servicios-full)
- [Stack tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura-del-proyecto)
- [Persistencia y seguridad](#-persistencia-y-seguridad)
- [Variables de entorno](#-configuración-por-variables-de-entorno)
- [CI/CD](#-cicd-y-validación)
- [Desarrollo](#-desarrollo-local)
- [Documentación](#-documentación)
- [Licencia](#-licencia)

---

# ✨ Características principales

| Área | Capacidades |
|---|---|
| 🔗 WhatsApp | Multi-Device, pairing code, QR fallback, PN/LID, reconexión automática |
| 🧩 Comandos | Registro modular, aliases, categorías, permisos, menú dinámico |
| 👥 Grupos | Moderación, administración, bienvenida/despedida, controles y seguridad |
| 🪙 Economía | Nexora Coins, wallet, banco, trabajos, transferencias, tienda y mercado |
| 🏆 Progreso | XP, reputación, temporadas, títulos, logros y rankings |
| 📖 RPG | Inventario, recursos, crafting, profesiones, mascotas, quests y raids |
| 🎮 Juegos | Juegos clásicos, PvP, apuestas NXC y minijuegos interactivos |
| 🌸 Colecciones | Waifus, rarezas, claims, harem, mercado y personalización visual |
| 🤖 Subbots | Instancias independientes, pairing/QR, owner por instancia y expiración |
| 🎵 Multimedia | YouTube, audio, video, letras y SoundCloud |
| 📲 Descargas | Redes, archivos, APK, MediaFire, Google Drive, GitHub y fuentes compatibles |
| ⛏️ Minecraft | Herramientas y consultas para Java/Bedrock |
| 🎨 Stickers | Creación, conversión, efectos y administración de stickers |
| 🔍 Búsqueda | Web, wiki, anime, manga y recursos externos |
| 🧠 IA | Integraciones AI/LLM configurables en edición Full |
| 🌐 Web | Dashboard Next.js y APIs de control en edición Full |
| 📱 Termux | Runtime Lite compilado, gestor propio y almacenamiento persistente |
| 🧪 Calidad | Typecheck, builds, smoke tests, auditoría y validación Bash en Actions |

---

# ⚖️ VPS / Full vs Termux Lite

| Componente | 🖥️ VPS / Full | 📱 Termux Lite |
|---|:---:|:---:|
| WhatsApp / Baileys | ✅ | ✅ |
| Pairing code + QR | ✅ | ✅ |
| Reconexión automática | ✅ | ✅ |
| Economía / banco | ✅ | ✅ |
| Juegos / RPG / colecciones | ✅ | ✅ |
| Administración de grupos | ✅ | ✅ |
| Descargas compatibles | ✅ | ✅ |
| Subbots aislados | ✅ | ✅ |
| Health local | ✅ | ✅ |
| Ollama / LLM | ✅ Configurable | ❌ |
| Mini-LLM / entrenamiento | ✅ | ❌ |
| Auto-chat basado en IA | ✅ | ❌ |
| Browser / Playwright | ✅ | ❌ |
| Sharp avanzado | ✅ Opcional | ❌ Omitido |
| Dashboard Next.js | ✅ | ❌ |
| Portal web de subbots | ✅ | ❌ |
| Telegram bridge | ✅ | ❌ |
| Nginx / HTTPS | ✅ | ❌ |
| systemd | ✅ | ❌ |
| Gestor `ghostnexora` | No necesario | ✅ |
| Runtime específico compilado | `dist/` | `dist-termux/` |

La edición Lite no es un fork. Forma parte del mismo código fuente y utiliza `NEXORA_RUNTIME_PROFILE=termux-lite`, evitando que ambas ediciones diverjan con el tiempo.

---

# 🚀 Instalación rápida

## 🖥️ Ubuntu / Debian VPS — edición Full

Ejecuta como usuario con privilegios `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador prepara las dependencias, Node.js, `yt-dlp`, almacenamiento persistente, build de producción, servicios systemd, vinculación de WhatsApp y componentes de servidor necesarios.

### Con dominio y HTTPS

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | \
  sudo env BOT_DOMAIN=bot.example.com LETSENCRYPT_EMAIL=admin@example.com bash
```

> [!TIP]
> Si no necesitas panel web, Nginx ni componentes pesados y quieres ejecutar el bot desde Android, utiliza directamente **Termux Lite**.

### Actualizar VPS / Full

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

### Estado y logs en VPS

```bash
sudo systemctl status ghost-nexora-bot --no-pager
sudo journalctl -u ghost-nexora-bot -f
```

Consulta [`docs/FIRST_INSTALL.md`](docs/FIRST_INSTALL.md) y [`docs/UPDATING.md`](docs/UPDATING.md) para el procedimiento completo.

---

# 📱 Ghost Nexora Bot · Termux Lite

Termux Lite está diseñado para utilizar un teléfono Android como host del bot con una huella más pequeña. El runtime mantiene las funciones sociales y de comunidad importantes, pero elimina procesos y dependencias que no son apropiados para un dispositivo móvil.

## ⚡ Instalación de Termux en un comando

Ejecuta dentro de **Termux normal, sin root y sin `sudo`**:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install-termux.sh | bash
```

El instalador realiza automáticamente:

1. 📦 instalación de Git, Node.js, FFmpeg, Python, curl y herramientas base;
2. 🎬 instalación de `yt-dlp`, con fallback mediante Python;
3. 📥 clonación/actualización del repositorio;
4. 💾 creación del almacenamiento persistente en `$HOME/.ghostnexora`;
5. ⚙️ activación de `NEXORA_RUNTIME_PROFILE=termux-lite`;
6. 🚫 desactivación forzada de Ollama/LLM y servicios Full;
7. 🪶 instalación del workspace del bot omitiendo dependencias opcionales pesadas;
8. 🏗️ compilación del target `apps/bot/dist-termux`;
9. 🔐 vinculación opcional con WhatsApp;
10. ▶️ instalación del gestor `ghostnexora` y arranque del bot.

## 🪶 Qué se elimina de Termux Lite

Termux Lite no carga ni ofrece:

- Ollama;
- LLM local;
- Mini-LLM y entrenamiento;
- chat automático basado en LLM;
- procesamiento de voz hacia LLM;
- Playwright / Chromium;
- browser proxy;
- Sharp como dependencia nativa opcional;
- dashboard Next.js;
- portal web de subbots;
- Telegram bridge;
- Nginx;
- Certbot;
- systemd.

Aunque un `.env` antiguo contenga `OLLAMA_ENABLED=true`, el perfil Lite fuerza esa función a `false` desde el runtime.

## 💾 Directorios de Termux

```text
$HOME/GhostNexoraBot/
└── código fuente y runtime compilado

$HOME/.ghostnexora/
├── session/              sesión principal de WhatsApp
├── data/                 economía y persistencia
│   └── subbots/          datos y sesiones de subbots
├── logs/                 logs del runtime
└── run/                  PID del proceso principal
```

La sesión y los datos quedan fuera del árbol Git. Una actualización no elimina la cuenta vinculada, economía, configuraciones ni sesiones de subbot.

---

# 🛠️ Gestor `ghostnexora` para Termux

Después de instalar la edición Lite se dispone de un comando global:

```bash
ghostnexora help
```

| Comando | Función |
|---|---|
| `ghostnexora start` | Inicia el MainBot en segundo plano |
| `ghostnexora stop` | Detiene el proceso Node real |
| `ghostnexora restart` | Reinicia MainBot y workers asociados |
| `ghostnexora status` | Muestra PID y health local |
| `ghostnexora logs` | Sigue el log en tiempo real |
| `ghostnexora pair <numero>` | Vincula WhatsApp con pairing code |
| `ghostnexora foreground` | Ejecuta el runtime en primer plano |
| `ghostnexora update` | Actualiza sin borrar sesiones/datos |
| `ghostnexora doctor` | Comprueba Node, npm, FFmpeg, yt-dlp y perfil |
| `ghostnexora wakelock on` | Evita suspensión con Termux:API |
| `ghostnexora wakelock off` | Libera el wake lock |

Ejemplo para México:

```bash
ghostnexora pair 521XXXXXXXXXX
```

### Mantener el proceso activo en Android

Android puede suspender procesos de fondo. Si tienes Termux:API:

```bash
pkg install termux-api
ghostnexora wakelock on
```

También es recomendable excluir Termux de la optimización agresiva de batería del fabricante cuando el teléfono vaya a funcionar como host permanente.

Guía específica: [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md).

---

# 🔗 WhatsApp Multi-Device

La capa de conexión utiliza **Baileys 7** y contempla identificadores modernos **PN/LID**.

### Capacidades de sesión

- 🔐 pairing mediante número de teléfono;
- 📷 QR como fallback cuando el código numérico no está disponible;
- 💾 credenciales persistentes;
- 🔄 reconexión automática;
- 👑 reconocimiento del owner principal;
- 🆔 resolución PN/LID para usuarios y administradores;
- 🤖 sesiones separadas para subbots;
- ⚡ routing con timeout para impedir mensajes colgados;
- ❤️ reacciones de estado durante ejecución de comandos.

Prefijo predeterminado:

```text
.
```

Ejemplo:

```text
.menu
```

El menú se construye a partir del catálogo de comandos realmente registrado por la instancia.

---

# 🧩 Ecosistema de comandos

Ghost Nexora Bot organiza sus comandos por dominios funcionales. El catálogo evoluciona continuamente y `.menu` es la fuente definitiva para la instancia que se está ejecutando.

## 🌐 General y perfil

```text
.menu
.help
.profile
.bot
.channel
.version
```

Incluye perfil del usuario, información de instancia, acceso privado, estado y utilidades generales.

## 🔍 Búsqueda y conocimiento

En edición Full pueden existir comandos para:

```text
.google
.wiki
.anime
.manga
.mangachapters
.mangadl
.investiga
```

También existen integraciones de búsqueda multimedia y recursos externos.

## ⛏️ Minecraft

El bot mantiene módulos dedicados a **Minecraft Java y Bedrock**, consultas de servidor y herramientas relacionadas. Los comandos disponibles se muestran en la sección Minecraft de `.menu`.

## 🎨 Personalización

El sistema admite personalización persistente de identidad y apariencia, incluyendo nombre del bot, recursos visuales, banners y estilos según el perfil de ejecución.

---

# 🪙 Nexora Economy + Banco

La economía utiliza **Nexora Coins (`NXC`)** como moneda virtual interna.

> [!NOTE]
> NXC no representa dinero real, criptomoneda ni activo financiero. Es una unidad de economía interna del bot.

## 💰 Operaciones principales

```text
.balance
.work
.deposit
.withdraw
.transfer
.rob
.top
.shop
.buy
```

El sistema incluye:

- 👛 wallet persistente;
- 🏦 banco separado de la cartera;
- 💸 transferencias;
- 👷 trabajo y profesiones;
- 🛒 tienda;
- ⛏️ tienda de minería;
- 📊 rankings;
- 🏷️ mercado/listados;
- 🏠 propiedades;
- 🚗 vehículos;
- 🎁 recompensas y progresión;
- 🔐 suscripciones de acceso privado;
- 🤖 compra/extensión de subbots.

Los fondos almacenados en el banco están separados de las mecánicas que afectan la cartera.

## 💎 Planes de acceso

Los productos de economía incluyen planes temporales para chat privado y subbots. Consulta siempre:

```text
.shop
```

para ver la configuración efectiva del servidor.

---

# 🎮 Juegos, RPG y colecciones

Ghost Nexora Bot dispone de una sección amplia de entretenimiento conectada con economía y progresión.

## 🕹️ Juegos

Entre los módulos actuales se encuentran juegos y minijuegos como:

- 🦖 Dino;
- 🐍 Snake;
- 👾 Doom-style;
- 🥷 Ninja;
- 🚀 Space Dodge;
- 🐱 Gato / tres en raya;
- ⚫ Damas;
- 🌱 PVZ2-style;
- ⚔️ juegos PvP;
- 🎰 juegos y apuestas con NXC.

Algunos juegos utilizan experiencias interactivas compatibles con las capacidades de WhatsApp disponibles en la instancia.

## 📖 RPG

```text
.inventory
.pet
.gather
.craft
.quests
.quest
.raid
```

El ecosistema RPG contempla recursos, inventario, crafting, profesiones, mascotas, misiones y raids.

## 🌸 Nexora Waifu Collection

Sistema coleccionable persistente con personajes, rareza, propiedad y economía.

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

Rarezas utilizadas por el sistema:

```text
⚪ Common
🟢 Uncommon
🔵 Rare
🟣 Epic
🟠 Legendary
🔴 Mythic
```

La colección se integra con NXC, mercado, perfil y personalización visual del bot.

---

# 🤖 Subbots

Los subbots son instancias aisladas de WhatsApp asociadas a un owner y una suscripción activa.

Cada instancia mantiene:

- 🔐 sesión propia;
- 📱 número independiente;
- 👤 owner asociado;
- ⏳ fecha de expiración;
- 🟢 estado online/offline/pairing;
- 📊 métricas básicas;
- 💾 directorio de datos aislado;
- ⚙️ personalización propia;
- 🧩 catálogo de comandos permitido para esa instancia.

## Usuario

```text
.subbot status
.subbot pair 521XXXXXXXXXX
.subbot qr
```

### En VPS / Full

La edición completa también puede ofrecer portal web de subbot, según la configuración desplegada.

### En Termux Lite

Los subbots **sí están habilitados**, pero utilizan el mismo perfil Lite del MainBot:

- sin Ollama/LLM;
- sin dashboard;
- sin portal web;
- sin browser pesado;
- con comandos compatibles con Lite;
- con cierre automático de workers cuando termina el MainBot.

Esto evita procesos huérfanos durante `ghostnexora stop`, `restart` y `update`.

---

# 👥 Grupos, seguridad y moderación

Ghost Nexora Bot incorpora controles persistentes por grupo y un router con permisos diferenciados.

### Administración

```text
.tagall
.hidetag
.link
.group open
.group close
.kick
.promote
.demote
```

### Protecciones y automatización

```text
.enable welcome
.enable antilink
.enable antispam
.disable welcome
.disable antilink
.disable antispam
```

El sistema distingue entre:

- 👑 owner principal;
- 🛡️ staff global;
- 👥 administradores de grupo;
- 🤖 owner de una instancia de subbot;
- 👤 usuarios normales.

El router valida restricciones `ownerOnly`, `staffOnly`, `groupOnly`, `adminOnly` y permisos del propio bot antes de ejecutar operaciones sensibles.

También existen módulos de controles avanzados, anti-view-once, moderación de mensajes, actividad de comunidad, reputación, anuncios, encuestas y automatizaciones.

---

# 📲 Descargas y multimedia

El bot implementa múltiples estrategias y fallbacks para resolver contenido multimedia.

## 🎵 YouTube y audio

```text
.yts <búsqueda>
.play <búsqueda>
.playvideo <búsqueda>
.ytmp3 <url>
.ytmp4 <url> [calidad]
.ytformats <url>
.lyrics <canción>
.soundcloud <url|búsqueda>
```

El stack de descarga puede combinar:

- `yt-dlp`;
- FFmpeg;
- proveedores HTTP configurables;
- resolvers externos;
- carruseles y selectores interactivos.

Cuando un error interno de YouTube no es apropiado para mostrarse al usuario, el router evita filtrar logs o detalles internos y responde con un mensaje público genérico.

## 📦 Archivos, aplicaciones y recursos

El proyecto contiene soporte y resolvers para diferentes fuentes, entre ellas:

```text
.mediafire
.gdrive
.gitclone
.apk
.apkdl
```

También existen módulos para redes sociales, archivos, recursos Android, anime/manga y otras fuentes compatibles con el servidor.

> [!WARNING]
> La disponibilidad de un proveedor puede cambiar externamente. Un comando presente no implica que un servicio de terceros vaya a permanecer disponible permanentemente.

## 📏 Límites

La edición Full utiliza un límite configurable mediante:

```env
MAX_DOWNLOAD_MB=1900
```

Termux Lite utiliza por defecto un límite inferior para evitar consumo excesivo de RAM, almacenamiento y batería en Android.

---

# 🎨 Stickers y herramientas multimedia

Comandos típicos:

```text
.sticker
.s
.stickereffects
.toimg
```

La edición Full puede utilizar **Sharp + FFmpeg** para efectos y conversiones avanzadas. Sharp se mantiene como dependencia opcional y se omite en la instalación Termux Lite para reducir tamaño y problemas con módulos nativos.

El bot también contiene una biblioteca global de stickers y acciones administrables por staff.

---

# 🧠 IA, automatización y servicios Full

La edición VPS / Full puede habilitar componentes adicionales de IA y automatización.

Dependiendo de la configuración:

- 🧠 proveedores AI HTTP;
- 🤖 Ollama;
- 🧪 Mini-LLM;
- 📚 corpus y entrenamiento;
- 💬 chat libre basado en LLM;
- 🎙️ transcripción/entrada de audio;
- 🔍 investigación y búsqueda;
- 🌐 navegador automatizado mediante Playwright;
- 📣 Telegram bridge;
- 📊 scheduler y automatizaciones.

Estas funciones **no forman parte de Termux Lite** y tampoco aparecen en su menú.

Documentación LLM: [`README-LLM.md`](README-LLM.md).

---

# 🔞 Módulos opt-in para adultos

El proyecto incluye módulos de contenido adulto que deben permanecer sujetos a configuración, permisos y controles de grupo/usuario.

La administración dispone de mecanismos de activación, allowlist y aceptación individual. Los módulos deben utilizarse únicamente por adultos y respetando legislación, condiciones de servicio y derechos de terceros.

El bot rechaza solicitudes que indiquen contenido sexual relacionado con menores.

---

# 🌐 Dashboard Web — edición Full

La interfaz web es un workspace independiente construido con:

- ⚫ Next.js 16;
- ⚛️ React 19;
- 🎨 Tailwind CSS 4;
- 🧩 Lucide React;
- 📝 Highlight.js;
- 🗃️ acceso al estado persistente mediante SQLite nativo de Node.

En despliegues Full puede utilizarse para administración y flujos web asociados a las instancias. Termux Lite no inicia ni instala este servicio como runtime.

---

# 🧱 Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 24+ |
| Package manager | npm 11+ / workspaces |
| Lenguaje | TypeScript 5.9 |
| WhatsApp | Baileys 7 |
| Persistencia | `node:sqlite` / SQLite |
| Logging | Pino |
| Validación | Zod |
| Procesos | Node child processes / IPC |
| Multimedia | FFmpeg, yt-dlp, Execa |
| Imágenes Full | Sharp opcional |
| Browser Full | Playwright opcional |
| Web | Next.js 16 |
| UI web | React 19 + Tailwind CSS 4 |
| CI/CD | GitHub Actions |
| VPS | systemd + Nginx + Certbot |
| Android | Termux + runtime `dist-termux` |

---

# 🏗️ Arquitectura del proyecto

Ghost Nexora utiliza un **monorepo npm Workspaces** con separación clara entre bot, web, infraestructura, documentación y pruebas.

```text
GhostNexoraBot/
├── apps/
│   ├── bot/
│   │   ├── src/
│   │   │   ├── commands/           comandos por dominio
│   │   │   ├── core/               router, sesiones y subbots
│   │   │   ├── services/           economía, grupos, multimedia, IA, etc.
│   │   │   ├── utils/              utilidades compartidas
│   │   │   ├── index.ts            MainBot Full
│   │   │   ├── termux-lite.ts      MainBot Termux Lite
│   │   │   ├── subbot-worker.ts    worker Full
│   │   │   └── subbot-worker-termux.ts
│   │   ├── dist/                    build Full
│   │   ├── dist-termux/             build Lite
│   │   ├── tsconfig.json
│   │   └── tsconfig.termux.json
│   │
│   └── web/
│       ├── app/                     Next.js App Router
│       ├── lib/
│       └── package.json
│
├── docs/
│   ├── FIRST_INSTALL.md
│   ├── UPDATING.md
│   └── TERMUX_LITE.md
│
├── scripts/
│   ├── install.sh                   instalador VPS
│   ├── update.sh                    actualizador VPS
│   ├── install-termux.sh            instalador Android/Termux
│   ├── update-termux.sh             actualizador Termux
│   ├── termux/
│   │   └── ghostnexora              gestor Termux
│   └── *-smoke.mjs                  validaciones de integración
│
├── systemd/                         servicios VPS
├── .github/workflows/               CI/CD
├── .env.example
├── README-LLM.md
├── README.md
├── LICENSE
└── package.json
```

## 🔄 Flujo de mensajes

```text
WhatsApp
   │
   ▼
Baileys Socket
   │
   ▼
Identity / Moderation / Security
   │
   ▼
CommandRouter
   │
   ├── permisos
   ├── aliases
   ├── contexto de grupo
   ├── acceso privado
   └── timeout / error público
   │
   ▼
Command Handler
   │
   ├── Economy / SQLite
   ├── Downloads / FFmpeg / yt-dlp
   ├── Groups / Community
   ├── Games / RPG
   ├── Collections
   ├── External APIs
   └── Subbot Manager
```

## 🤖 Arquitectura de subbots

```text
MainBot
   │
   └── SubbotManager
         │
         ├── Worker #1 ── Session #1
         ├── Worker #2 ── Session #2
         └── Worker #N ── Session #N
```

La comunicación entre el MainBot y los workers utiliza procesos Node independientes e IPC. Cada subbot tiene un directorio de sesión separado.

---

# 💾 Persistencia y seguridad

## VPS / Full

Los datos persistentes se separan del checkout del repositorio:

```text
/var/lib/ghost-nexora-bot/
├── session/
└── data/
```

## Termux Lite

```text
$HOME/.ghostnexora/
├── session/
├── data/
├── logs/
└── run/
```

### 🔐 Principios aplicados

- sesiones fuera del repositorio;
- `.env` protegido y excluido de Git;
- tokens administrativos generados aleatoriamente cuando corresponde;
- control granular owner/staff/admin/subbot-owner;
- aislamiento de sesiones de subbot;
- errores internos sensibles no expuestos al usuario;
- APIs locales protegidas cuando requieren token;
- datos de economía persistentes en SQLite;
- actualizaciones que preservan estado y credenciales;
- CI con auditoría de dependencias de producción.

> [!CAUTION]
> Nunca publiques `creds.json`, `.env`, bases SQLite, cookies de descarga, tokens administrativos, claves API ni tokens de portal.

---

# ⚙️ Configuración por variables de entorno

Base mínima:

```env
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

OFFICIAL_CHANNEL_URL=https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
LOG_LEVEL=info
```

## 📱 Perfil Termux

El instalador configura automáticamente:

```env
NEXORA_RUNTIME_PROFILE=termux-lite
OLLAMA_ENABLED=false
```

y redefine `SESSION_DIR`, `DATA_DIR` y límites para almacenamiento privado de Termux.

## 🌐 Proveedores opcionales

`.env.example` documenta integraciones configurables como:

- proveedores de descargas;
- Lempi API;
- Cobalt;
- cookies de `yt-dlp`;
- proveedores de IA;
- Telegram;
- servicios externos de contenido.

Utiliza siempre [`.env.example`](.env.example) como referencia actual.

---

# ❤️ Health y observabilidad

El MainBot expone un endpoint de health local:

```text
http://127.0.0.1:3001/health
```

Incluye información como:

- conexión del bot;
- uptime;
- instancia activa;
- JID conectado;
- cantidad de subbots;
- subbots online.

En Termux:

```bash
ghostnexora status
ghostnexora doctor
```

En VPS:

```bash
curl http://127.0.0.1:3001/health
```

---

# 🧪 CI/CD y validación

GitHub Actions valida continuamente el proyecto.

El pipeline incluye, entre otras comprobaciones:

- 📦 instalación de dependencias;
- 🔐 `npm audit --omit=dev --audit-level=high`;
- 🧠 TypeScript typecheck;
- 🏗️ build completo del monorepo;
- 📱 build dedicado de Termux Lite;
- 🧪 `termux-lite-smoke`;
- 🌸 smoke tests de assets/colecciones;
- 🪙 pruebas de migración de wallet/economía;
- 🏦 smoke tests del banco;
- 🎵 pruebas de flujos YouTube;
- 🤖 pruebas LLM de la edición Full;
- 🐚 validación `bash -n` de instaladores y actualizadores.

La prueba específica de Termux comprueba que:

- el runtime se identifique como `termux-lite`;
- Ollama quede forzado a `false`;
- comandos AI/LLM/browser/dashboard no se filtren al menú Lite;
- `.menu` continúe disponible;
- los comandos de subbot continúen disponibles;
- el portal web no sea anunciado en Lite;
- exista el output compilado dedicado.

[🧪 Ver ejecuciones de GitHub Actions](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

---

# 🔄 Actualización

## VPS / Full

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

El actualizador preserva el estado persistente y gestiona los servicios correspondientes.

## Termux Lite

```bash
ghostnexora update
```

El actualizador Lite:

1. detecta si el bot estaba ejecutándose;
2. lo detiene de forma controlada;
3. actualiza `main` mediante Git;
4. mantiene el perfil Lite;
5. sincroniza dependencias sin opcionales pesados;
6. recompila `dist-termux`;
7. actualiza `yt-dlp`;
8. reinstala el gestor `ghostnexora`;
9. restaura el estado de ejecución anterior;
10. conserva sesión, economía y subbots.

---

# 💻 Desarrollo local

## Requisitos

- Node.js **24+**;
- npm **11+**;
- FFmpeg;
- `yt-dlp` para funcionalidades de descarga;
- Git.

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

### Build completo

```bash
npm run build
```

### Build específico de Termux

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
| [`docs/TERMUX_LITE.md`](docs/TERMUX_LITE.md) | Instalación y operación en Android/Termux |
| [`README-LLM.md`](README-LLM.md) | Componentes LLM de la edición Full |
| [`.env.example`](.env.example) | Variables y proveedores configurables |

---

# 🧰 Solución rápida de problemas

## Termux

```bash
ghostnexora doctor
ghostnexora status
ghostnexora logs
```

Reiniciar:

```bash
ghostnexora restart
```

Reparar runtime/dependencias mediante actualización:

```bash
ghostnexora update
```

## VPS

```bash
sudo systemctl status ghost-nexora-bot --no-pager -l
sudo journalctl -u ghost-nexora-bot -n 120 --no-pager
```

Si la sesión dejó de estar vinculada, utiliza nuevamente el flujo de pairing documentado para el entorno correspondiente.

---

# 🤝 Contribución

Las contribuciones deben mantener la arquitectura modular del proyecto y evitar introducir secretos o dependencias innecesarias.

Antes de enviar cambios:

```bash
npm run typecheck
npm run build
```

Para cambios relacionados con Termux, verifica también:

```bash
npm run build:termux --workspace=@ghostnexora/bot
node scripts/termux-lite-smoke.mjs
```

Se recomienda utilizar commits descriptivos, por ejemplo:

```text
feat: add new command
fix: repair downloader fallback
perf: reduce Termux runtime overhead
docs: update installation guide
test: add smoke coverage
```

---

# ⚠️ Aviso legal y uso responsable

Ghost Nexora Bot es software independiente para automatización y experimentación con WhatsApp Multi-Device.

El usuario que despliega una instancia es responsable de:

- cumplir las condiciones de las plataformas utilizadas;
- no utilizar el bot para spam, acoso o abuso;
- respetar privacidad y derechos de autor;
- proteger credenciales y sesiones;
- aplicar controles apropiados en grupos;
- utilizar módulos para adultos únicamente de forma legal y apropiada;
- revisar las políticas de WhatsApp/Meta antes de operar una instancia pública.

WhatsApp y otras marcas mencionadas pertenecen a sus respectivos propietarios.

---

# 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta [`LICENSE`](LICENSE).

---

<div align="center">

## 👻 Ghost Developer / Nexora

**Ghost Nexora Bot** — WhatsApp Bot · Baileys · Node.js · TypeScript · Termux · Subbots · Next.js

[📢 Canal oficial de WhatsApp](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [📦 Código fuente](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [🧪 CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

Si el proyecto te resulta útil, puedes marcar el repositorio con una ⭐ para seguir su evolución.

</div>

<!--
SEO / discoverability:
Ghost Nexora Bot, WhatsApp bot, WhatsApp Multi-Device bot, Baileys bot, Node.js WhatsApp bot,
TypeScript WhatsApp bot, Termux WhatsApp bot, Android Termux bot, WhatsApp subbots,
WhatsApp economy bot, WhatsApp games bot, WhatsApp downloader, Next.js bot dashboard,
Baileys 7, Ghost Developer, Nexora, GhostNexoraBot.
-->
