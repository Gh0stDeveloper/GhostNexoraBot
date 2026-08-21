# 👻 Ghost Nexora Bot

Bot profesional, modular y extensible para **WhatsApp Multi-Device**, desarrollado por **Ghost Developer / Nexora**.

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

> ⚠️ Proyecto no oficial. Ghost Nexora Bot no está afiliado con WhatsApp, Meta, YouTube, MyAnimeList ni las plataformas soportadas. Usa cada módulo de forma responsable y respeta las condiciones, licencias y derechos aplicables.

## 🔗 Enlaces oficiales

[📢 **Canal oficial de WhatsApp**](https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i) · [📦 **Repositorio GitHub**](https://github.com/Gh0stDeveloper/GhostNexoraBot) · [🧪 **GitHub Actions**](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions) · [🔀 **PR de desarrollo V1**](https://github.com/Gh0stDeveloper/GhostNexoraBot/pull/1)

El canal oficial se utilizará para **noticias, releases, mantenimiento, cambios importantes, avisos del desarrollador y enlaces a grupos oficiales**.

---

## ✨ Resumen de la V1

Ghost Nexora Bot incluye actualmente:

- 🔗 WhatsApp Multi-Device con **Baileys 7**.
- 🔐 Vinculación mediante **número + pairing code**, con QR de respaldo.
- 💾 Sesión persistente y reconexión automática.
- ⚙️ Prefijo configurable; `.` por defecto.
- 📜 Menú completo mediante `.menu`.
- ❤️ Reacciones a comandos y reacciones conversacionales opcionales.
- 🎵 búsqueda y descarga multimedia.
- 🖼️ stickers y efectos.
- 🪙 economía propia con **Nexora Coins (NXC)**.
- 🌸 sistema coleccionable **Nexora Waifu Collection**.
- 🤖 subbots comprables con NXC y sesiones independientes.
- 👥 moderación y políticas persistentes por grupo.
- 🔞 módulo 18+ opt-in con allowlist por grupo.
- 📦 F-Droid, Google Drive, MediaFire y GitHub ZIP.
- 🎌 búsqueda de anime/manga.
- 🌐 dashboard Next.js + Tailwind CSS.
- 🔒 instalación HTTPS opcional mediante nginx + Let's Encrypt.
- 🧪 CI para TypeScript, build, Bash y auditoría de dependencias de producción.

---

# 🤖 WhatsApp Multi-Device

La capa de WhatsApp utiliza Baileys 7 y contempla el modelo actual de identificadores **PN/LID**.

### Características

- pairing mediante número de teléfono;
- QR como fallback;
- sesión persistente;
- reconexión posterior al `pair-success` de WhatsApp;
- compatibilidad PN/LID para owners, administración y economía;
- cuenta principal reconocida como owner;
- subbots con directorios de sesión independientes.

El prefijo predeterminado es:

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

`.yts` intenta responder mediante un **carrusel interactivo horizontal** con:

- miniatura;
- título;
- autor/canal;
- duración;
- vistas;
- likes cuando están disponibles;
- botones de **Audio**, **Letra** y **Relacionadas**.

Las letras utilizan [**LRCLIB**](https://lrclib.net/) sin requerir una API de pago.

YouTube utiliza `yt-dlp + FFmpeg + Node` como runtime JS. El bot no exige cookies por defecto.

## TikTok / Instagram / Facebook

La estrategia es:

1. resolvedor web público;
2. fallback local mediante `yt-dlp`.

En TikTok se prioriza un enlace **HD/sin marca de agua** cuando el proveedor lo entrega.

No es necesario guardar una cuenta personal de Facebook únicamente para intentar descargar contenido público.

## Archivos y recursos

```text
.mediafire <url>
.gdrive <url>
.gitclone <url>
.apk <búsqueda>
.apkdl <url-fdroid>
```

Las APK se priorizan desde [**F-Droid**](https://f-droid.org/) y fuentes públicas legítimas. El bot no automatiza catálogos de APK crackeadas/modificadas de procedencia dudosa.

---

# 🎨 Stickers

Comandos principales:

```text
.sticker
.s
.stickereffects
.toimg
```

Efectos disponibles actualmente:

- normal;
- espejo horizontal;
- espejo vertical;
- rotación 90°;
- rotación 180°;
- rotación 270°;
- zoom in;
- zoom out;
- circular;
- cuadrado;
- blanco y negro.

La conversión utiliza **Sharp + FFmpeg**.

---

# 🪙 Nexora Economy

La moneda interna es **Nexora Coins (`NXC`)**.

NXC **no representa dinero real ni una criptomoneda blockchain**. Es una unidad virtual interna para economía, colecciones, acceso privado y subbots.

## Comandos

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

El dinero guardado en el **banco no puede ser robado** mediante `.rob`.

### Productos iniciales

```text
private1d
private7d
subbot1d
subbot7d
subbot30d
```

Comprar más tiempo de subbot extiende la instancia existente.

---

# 🌸 Nexora Waifu Collection

Sistema coleccionable conectado directamente con Nexora Economy.

Como referencia funcional se revisó el comportamiento de `.waifu` de TheMystic-Bot-MD, pero Ghost Nexora Bot utiliza un sistema propio y persistente basado en personajes identificables desde [**Jikan**](https://jikan.moe/) / [**MyAnimeList**](https://myanimelist.net/).

Cada personaje tiene:

- ID estable de MyAnimeList;
- nombre;
- imagen;
- enlace a su ficha;
- favoritos/popularidad;
- rareza;
- valor NXC;
- precio de claim;
- propietario global;
- estado **disponible / reclamado**.

## Rarezas

```text
⚪ Common
🟢 Uncommon
🔵 Rare
🟣 Epic
🟠 Legendary
🔴 Mythic
```

La rareza se deriva de la popularidad del personaje en la fuente pública, por lo que no depende de una lista cerrada incluida manualmente en el bot.

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
| Ranking de colecciones | `.wtop` |

### Flujo

```text
.rw
.claim
.harem
```

Un roll tiene un tiempo limitado para ser reclamado. Si otro usuario ya posee ese personaje, el resultado muestra que **ya está reclamado** y no puede duplicarse globalmente.

Los claims consumen NXC de la **cartera**. Si el usuario tiene las monedas guardadas en el banco debe retirarlas antes con `.withdraw`.

`.wsell` devuelve al usuario una parte del valor del personaje y lo deja nuevamente disponible para futuros rolls.

El harem utiliza carruseles interactivos y admite paginación.

---

# 🎌 Anime y manga

```text
.anime <título>
.manga <título>
```

- Anime: [**Jikan / MyAnimeList**](https://jikan.moe/)
- Manga: [**MangaDex**](https://mangadex.org/)

No se requiere una API comercial para estas búsquedas.

---

# 🤖 Subbots

Los usuarios pueden comprar tiempo de subbot usando NXC.

```text
.shop
.buy subbot7d
.subbot pair 5215512345678
```

Cada subbot mantiene:

- sesión Baileys independiente;
- owner asociado;
- teléfono vinculado;
- fecha de vencimiento;
- estado;
- mensajes procesados;
- bytes descargados.

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

El panel owner puede consultar todas las instancias.

`.adminpanel` solo entrega el enlace administrativo en chat privado.

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

La bienvenida no necesita consultar ni compartir la fotografía de perfil del nuevo participante.

Si `WELCOME_IMAGE_URL` está definido, se utiliza una imagen fija del bot.

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

# 📦 Límites de descarga

Configuración inicial:

```env
MAX_DOWNLOAD_MB=1900
```

Los archivos grandes se manejan mediante almacenamiento temporal en disco para evitar cargar varios gigabytes completos en RAM.

El límite real de envío depende también de los límites que WhatsApp aplique al tipo de mensaje y cliente.

---

# 🚀 Instalación en VPS

## Versión publicada en `main`

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador prepara:

1. Node.js 24;
2. npm;
3. FFmpeg;
4. Git;
5. `yt-dlp`;
6. nginx;
7. usuario Linux dedicado;
8. sesión persistente;
9. SQLite;
10. subbots;
11. pairing code;
12. servicios `systemd`;
13. web Next.js;
14. token owner para dashboard.

## Probar el PR Draft actual

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/feature/ghost-nexora-bot-v1/scripts/install.sh | sudo env BRANCH=feature/ghost-nexora-bot-v1 bash
```

El instalador acepta el número con `+`, espacios o guiones y conserva únicamente los dígitos para el pairing.

---

# 🔒 HTTPS automático

Con un dominio ya apuntando a la VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com bash
```

Se configura:

- nginx reverse proxy;
- certificado Let's Encrypt;
- renovación mediante Certbot;
- redirección HTTP → HTTPS.

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
│   │       │   └── waifu.ts
│   │       └── utils/
│   └── web/
│       ├── app/admin/
│       └── app/subbot/[code]/
├── scripts/
├── systemd/
├── .github/workflows/
├── .env.example
└── package.json
```

## Persistencia SQLite

La V1 guarda persistentemente:

- usuarios de economía;
- cartera/banco;
- ledger;
- suscripciones;
- políticas de grupos;
- subbots;
- métricas;
- tokens de portal;
- rolls de colección;
- personajes reclamados y propietarios.

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
- protección temporal contra venta accidental;
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
