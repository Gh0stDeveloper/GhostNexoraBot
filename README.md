# 👻 Ghost Nexora Bot

Bot profesional, modular y extensible para **WhatsApp Multi-Device**, desarrollado por **Ghost Developer / Nexora**.

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

> ⚠️ Proyecto no oficial. Ghost Nexora Bot no está afiliado con WhatsApp, Meta, YouTube, MyAnimeList ni las plataformas soportadas. Usa cada módulo de forma responsable y respeta las condiciones, licencias y derechos aplicables.

## 🔗 Enlaces y documentación

[📢 **Canal oficial de WhatsApp**](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [📦 **Repositorio GitHub**](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [🧪 **GitHub Actions**](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions) · [🔀 **PR de desarrollo V1**](https://github.com/Gh0stDeveloper/GhostNexoraBot/pull/1)

### 📚 Guías

[🚀 **Primera instalación y activación**](docs/FIRST_INSTALL.md) · [🔄 **Actualizar Ghost Nexora Bot**](docs/UPDATING.md)

El canal oficial se utilizará para **noticias, releases, mantenimiento, cambios importantes, avisos del desarrollador y enlaces a grupos oficiales**.

---

## ⚡ Instalación rápida

### Rama estable `main`

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

### V1 Draft actual

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/feature/ghost-nexora-bot-v1/scripts/install.sh | sudo env BRANCH=feature/ghost-nexora-bot-v1 bash
```

Durante la primera instalación el script puede solicitar el número principal de WhatsApp y generar el **pairing code**.

Para todos los pasos, pairing, servicios, logs, firewall, dominio y HTTPS consulta [🚀 **Primera instalación y activación**](docs/FIRST_INSTALL.md).

### Actualización rápida

Estable:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

Draft:

```bash
sudo env BRANCH=feature/ghost-nexora-bot-v1 /opt/ghost-nexora-bot/scripts/update.sh
```

Antes de una actualización importante consulta [🔄 **la guía completa de actualización y rollback**](docs/UPDATING.md).

---

## ✨ Resumen de la V1

Ghost Nexora Bot incluye actualmente:

- 🔗 WhatsApp Multi-Device con **Baileys 7**;
- 🔐 vinculación mediante **número + pairing code**, con QR de respaldo;
- 💾 sesión persistente y reconexión automática;
- ⚙️ prefijo configurable, `.` por defecto;
- 📜 menú completo mediante `.menu`;
- ❤️ reacciones a comandos y reacciones conversacionales opcionales;
- 🎵 búsquedas y descargas multimedia;
- 🖼️ stickers y efectos;
- 🪙 economía propia con **Nexora Coins (NXC)**;
- 🌸 sistema coleccionable **Nexora Waifu Collection**;
- 🤖 subbots comprables con NXC y sesiones independientes;
- 👥 moderación y políticas persistentes por grupo;
- 🔞 módulo 18+ opt-in con allowlist por grupo;
- 📦 F-Droid, Google Drive, MediaFire y GitHub ZIP;
- 🎌 búsquedas de anime/manga;
- 🌐 dashboard Next.js + Tailwind CSS;
- 🔒 HTTPS opcional mediante nginx + Let's Encrypt;
- 🧪 CI para TypeScript, build, Bash y auditoría de dependencias de producción.

---

# 🤖 WhatsApp Multi-Device

La capa de WhatsApp utiliza Baileys 7 y contempla identificadores **PN/LID**.

### Características

- pairing mediante número de teléfono;
- QR como fallback;
- sesión persistente;
- reconexión posterior al `pair-success` de WhatsApp;
- compatibilidad PN/LID para owners, administración y economía;
- cuenta principal reconocida como owner;
- subbots con directorios de sesión independientes.

Prefijo predeterminado:

```text
.
```

Ejemplo:

```text
.menu
```

El owner puede cambiarlo sin recompilar:

```text
.setprefix !
```

---

# 🎵 Música, video y descargas

## YouTube

| Función | Comando |
|---|---|
| Buscar | `.yts <texto>` |
| Buscar + audio | `.play <texto>` |
| Buscar + video | `.playvideo <texto>` |
| Letras | `.lyrics <canción>` |
| Formatos | `.ytformats <url>` |
| MP3 | `.ytmp3 <url>` |
| MP4 | `.ytmp4 <url> [calidad]` |
| SoundCloud | `.soundcloud <url|texto>` |

`.yts` intenta responder mediante un **carrusel interactivo horizontal** con miniatura, título, autor/canal, duración, vistas, likes cuando están disponibles y botones de **Audio**, **Letra** y **Relacionadas**.

Las letras utilizan [**LRCLIB**](https://lrclib.net/) sin requerir una API de pago.

YouTube utiliza `yt-dlp + FFmpeg + Node` como runtime JavaScript. El bot no exige cookies por defecto.

## TikTok / Instagram / Facebook

La estrategia actual es:

1. resolvedor web público;
2. fallback local mediante `yt-dlp`.

En TikTok se prioriza un enlace **HD/sin marca de agua** cuando el proveedor lo entrega.

## Archivos y recursos

```text
.mediafire <url>
.gdrive <url>
.gitclone <url>
.apk <búsqueda>
.apkdl <url-fdroid>
```

Las APK se priorizan desde [**F-Droid**](https://f-droid.org/) y fuentes públicas legítimas.

---

# 🎨 Stickers

```text
.sticker
.s
.stickereffects
.toimg
```

Efectos disponibles:

- normal;
- espejo horizontal/vertical;
- rotación 90°/180°/270°;
- zoom in/out;
- circular;
- cuadrado;
- blanco y negro.

La conversión utiliza **Sharp + FFmpeg**.

---

# 🪙 Nexora Economy

La moneda interna es **Nexora Coins (`NXC`)**.

NXC **no representa dinero real ni una criptomoneda blockchain**. Es una unidad virtual interna para economía, colecciones, acceso privado y subbots.

## Obtener y administrar NXC

| Acción | Comando / alias |
|---|---|
| Saldo | `.balance`, `.bal` |
| Trabajar | `.work`, `.w`, `.trabajar` |
| Depositar | `.deposit`, `.dep` |
| Retirar | `.withdraw`, `.retirar` |
| Transferir | `.transfer`, `.pay` |
| Robar cartera | `.rob`, `.robar` |
| Ranking | `.top` |
| Tienda | `.shop` |
| Comprar | `.buy <producto>` |

`.work` entrega actualmente entre **45 y 200 NXC** y tiene cooldown de 15 minutos. El promedio teórico de actividad continua ronda 490 NXC/h, por lo que las suscripciones están deliberadamente por encima de unas pocas ejecuciones de `.work`.

El dinero guardado en el **banco no puede ser robado** mediante `.rob`.

## 💎 Suscripciones y precios

| Producto | Duración | Precio | Uso |
|---|---:|---:|---|
| `private1d` | 1 día | **2,000 NXC** | Uso privado del bot |
| `private7d` | 7 días | **10,000 NXC** | Uso privado del bot |
| `private30d` | 30 días | **30,000 NXC** | Uso privado del bot |
| `subbot1d` | 1 día | **6,000 NXC** | Sesión de subbot |
| `subbot7d` | 7 días | **30,000 NXC** | Sesión de subbot |
| `subbot30d` | 30 días | **100,000 NXC** | Sesión de subbot |

Los planes largos tienen **descuento por día**. Los subbots son más caros porque mantienen una sesión de WhatsApp independiente y consumen RAM, CPU, red y almacenamiento de la VPS durante toda la suscripción.

Ejemplo:

```text
.shop
.buy private7d
```

O:

```text
.buy subbot7d
.subbot pair 521234567890
```

Comprar más tiempo de subbot extiende la instancia existente.

---

# 🌸 Nexora Waifu Collection

Sistema coleccionable conectado con Nexora Economy.

Como referencia funcional se revisó el comportamiento de `.waifu` de TheMystic-Bot-MD, pero Ghost Nexora Bot utiliza un sistema propio y persistente basado en personajes identificables desde [**Jikan**](https://jikan.moe/) / [**MyAnimeList**](https://myanimelist.net/).

Cada personaje tiene ID estable, nombre, imagen, ficha, popularidad/favoritos, rareza, valor NXC, precio de claim, propietario global y estado disponible/reclamado.

## Rarezas

```text
⚪ Common
🟢 Uncommon
🔵 Rare
🟣 Epic
🟠 Legendary
🔴 Mythic
```

## Comandos

| Acción | Comando |
|---|---|
| Roll | `.waifu`, `.rw` |
| Reclamar | `.claim`, `.cw` |
| Ver colección | `.harem` |
| Ver colección ajena | `.harem @usuario` |
| Buscar personaje | `.wsearch <nombre>` |
| Información | `.winfo <id>` |
| Regalar personaje | `.wgive @usuario <id>` |
| Vender al sistema | `.wsell <id>` |
| Ranking | `.wtop` |

Flujo básico:

```text
.rw
.claim
.harem
```

Los claims consumen NXC de la **cartera**. `.wsell` devuelve una parte del valor y libera nuevamente el personaje.

---

# 🎌 Anime y manga

```text
.anime <título>
.manga <título>
```

- Anime: [**Jikan / MyAnimeList**](https://jikan.moe/)
- Manga: [**MangaDex**](https://mangadex.org/)

---

# 🤖 Subbots

Los usuarios pueden comprar tiempo de subbot usando NXC.

```text
.shop
.buy subbot7d
.subbot pair 521234567890
```

Cada subbot mantiene sesión independiente, owner asociado, teléfono, vencimiento, estado y métricas básicas de actividad.

### Usuario

```text
.subbot status
.subbot pair <numero>
.subbot portal
```

`.subbot portal` genera un token temporal que únicamente expone la información de **esa instancia**.

### Owner principal

```text
.subbots
.adminpanel
```

El panel owner puede consultar todas las instancias. `.adminpanel` solo entrega el enlace administrativo en chat privado.

---

# 👥 Administración de grupos

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

Protecciones:

```text
.enable welcome
.enable antilink
.enable antispam
.disable welcome
.disable antilink
.disable antispam
```

La bienvenida no necesita consultar ni compartir la fotografía de perfil del nuevo participante. Si `WELCOME_IMAGE_URL` está definido, se utiliza una imagen fija del bot.

---

# 🔞 Módulo 18+

El módulo está **apagado globalmente por defecto**.

Owner:

```text
.adultmode on
```

Allowlist por grupo:

```text
.adult allow
.adult deny
.adult status
```

Confirmación individual:

```text
.adult18 accept
```

Proveedores iniciales:

```text
.xvideos <búsqueda|url>
.xnxx <búsqueda|url>
.pornhub <búsqueda|url>
```

El módulo bloquea solicitudes que indiquen contenido sexual relacionado con menores.

---

# 📦 Límite de descarga

```env
MAX_DOWNLOAD_MB=1900
```

Los archivos grandes se manejan mediante almacenamiento temporal en disco para evitar cargar varios gigabytes completos en RAM. El límite real de envío depende también de WhatsApp.

---

# 🔒 HTTPS

La guía de primera instalación explica la configuración completa con dominio, DNS, nginx y Let's Encrypt:

[🔒 **Configurar instalación y HTTPS**](docs/FIRST_INSTALL.md#12-instalar-directamente-con-dominio-y-https-automático)

Ejemplo para `main`:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com bash
```

---

# ⚙️ Variables de entorno

```env
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=5210000000000
AUTO_REACT=true
MAX_DOWNLOAD_MB=1900
SESSION_DIR=./data/session
DATA_DIR=./data
BOT_HEALTH_PORT=3001
BOT_HEALTH_URL=http://127.0.0.1:3001/health
WEB_PORT=3000
PUBLIC_WEB_URL=https://bot.example.com
ADMIN_WEB_TOKEN=token-generado-automaticamente
ADULT_PRIVATE_ENABLED=true
WELCOME_IMAGE_URL=
OFFICIAL_CHANNEL_URL=https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
LOG_LEVEL=info
```

Nunca publiques `.env`, sesiones, SQLite ni tokens de portal.

---

# 🧱 Arquitectura

```text
GhostNexoraBot/
├── apps/
│   ├── bot/
│   │   └── src/
│   │       ├── commands/
│   │       │   ├── adult.ts
│   │       │   ├── downloads.ts
│   │       │   ├── economy.ts
│   │       │   ├── groups.ts
│   │       │   ├── lyrics.ts
│   │       │   ├── resources.ts
│   │       │   ├── security.ts
│   │       │   ├── stickers.ts
│   │       │   ├── subbots.ts
│   │       │   └── waifu.ts
│   │       ├── core/
│   │       ├── services/
│   │       └── utils/
│   └── web/
│       ├── app/admin/
│       └── app/subbot/[code]/
├── docs/
│   ├── FIRST_INSTALL.md
│   └── UPDATING.md
├── scripts/
│   ├── install.sh
│   └── update.sh
├── systemd/
├── .github/workflows/
├── .env.example
└── package.json
```

## Persistencia

La V1 guarda persistentemente economía, ledger, suscripciones, políticas de grupos, subbots, métricas, tokens de portal y colecciones en SQLite.

En la instalación VPS los datos importantes se mantienen fuera del repositorio, en `/var/lib/ghost-nexora-bot`.

---

# 💻 Desarrollo

Requisitos:

- Node.js 24+
- npm 11+
- FFmpeg
- `yt-dlp`

```bash
cp .env.example .env
npm install
npm run build
npm run pair
npm run bot
```

Web:

```bash
npm run web
```

---

# 🧪 Calidad y CI

GitHub Actions valida:

- instalación npm;
- auditoría de dependencias de producción para severidad alta/crítica;
- TypeScript;
- build del bot;
- build Next.js;
- sintaxis Bash.

Una versión no debe considerarse lista para producción únicamente porque compile: también se valida pairing, carruseles, descargas y subbots en una VPS real antes de cerrar el PR.

[🧪 **Ver ejecuciones de GitHub Actions**](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

---

# 🗺️ Roadmap recomendado

Próximas mejoras:

- rate limits por comando y por grupo;
- colas de descargas para evitar saturar CPU/disco;
- cuotas de recursos específicas por subbot;
- métricas de CPU/errores por instancia;
- edición de precios de Nexora Economy desde dashboard;
- roles administrativos configurables;
- logs del bot desde panel owner;
- proveedores de descarga intercambiables con health-check;
- instancia propia opcional de un backend de descargas como fallback, sin depender de cuentas personales;
- más efectos de stickers y filtros de video con FFmpeg;
- notificaciones automáticas al canal oficial para releases;
- backup cifrado de SQLite y configuración;
- Docker opcional para despliegues multi-instancia;
- migración opcional a PostgreSQL/Supabase cuando la cantidad de subbots lo justifique.

### Futuras ampliaciones de Nexora Waifu Collection

- wishlist;
- mercado entre usuarios;
- subastas;
- protección contra venta accidental;
- favoritos por usuario;
- filtros por rareza;
- eventos de colección;
- recompensas por completar series;
- dashboard web de colecciones.

---

# 📄 Licencia

MIT. Consulta [**LICENSE**](LICENSE).

---

## 👻 Ghost Developer / Nexora

Diseñado para empezar como un bot sencillo de instalar y poder evolucionar a un servicio multi-instancia con economía, colecciones, panel web y automatización operativa.
