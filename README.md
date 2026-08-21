# 👻 Ghost Nexora Bot

Bot profesional y extensible para **WhatsApp Multi-Device**, desarrollado por **Ghost Developer / Nexora**.

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions)

> ⚠️ Proyecto no oficial. Ghost Nexora Bot no está afiliado con WhatsApp, Meta, YouTube ni las plataformas soportadas. Respeta las reglas de cada servicio y descarga únicamente contenido que tengas derecho a obtener.

## 📢 Canal oficial

**Ghost Nexora Bot — Noticias, actualizaciones y grupos oficiales**

https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i

Las noticias de nuevas versiones, mantenimiento, grupos oficiales del desarrollador y cambios importantes del bot se publicarán en ese canal.

---

## ✨ Funciones principales

### 🔗 WhatsApp Multi-Device

- Baileys 7 Multi-Device.
- Vinculación por **número + código de emparejamiento**.
- QR como respaldo.
- Sesión persistente.
- Reconexión automática después del reinicio que WhatsApp realiza al completar pairing.
- Compatibilidad con identificadores PN/LID actuales de WhatsApp.
- La cuenta principal vinculada se reconoce como owner.

### 📜 Sistema de comandos

- Prefijo predeterminado: `.`
- Cambio persistente con `.setprefix !`
- Reacciones al procesar comandos.
- Permisos owner/admin/bot-admin.
- Respuestas interactivas nativas de WhatsApp.
- `.yts` utiliza un **carrusel horizontal** con portada, título, duración, vistas, botones de audio, letra y relacionadas.

### 🎨 Stickers

- `.sticker` / `.s`
- `.toimg`
- `.stickereffects`
- Efectos: normal, espejo horizontal/vertical, 90/180/270°, zoom, círculo, cuadrado y escala de grises.
- Conversión con `sharp` y FFmpeg, evitando una dependencia antigua de stickers.

### 🎵 YouTube y audio

- `.yts <texto>`
- `.play <texto>`
- `.playvideo <texto>`
- `.lyrics <canción>`
- `.ytformats <url>`
- `.ytmp3 <url>`
- `.ytmp4 <url> 1080`
- `.soundcloud <url|texto>`

Las respuestas intentan mostrar:

- título;
- autor/canal;
- duración;
- vistas;
- likes cuando la plataforma los entrega;
- miniatura;
- tamaño final del archivo;
- descripción abreviada.

Las letras se consultan mediante **LRCLIB**, sin API de pago.

Ghost Nexora Bot no configura cookies de YouTube por defecto. Usa `yt-dlp`, FFmpeg y Node como runtime JavaScript para los challenges actuales de YouTube.

### 📱 TikTok, Instagram y Facebook

Para estas plataformas existe una cadena de fallback:

1. resolvedor web público sin cookies;
2. `yt-dlp` local si el proveedor público falla.

En TikTok se prioriza el enlace HD/sin marca de agua cuando el proveedor público lo ofrece.

Esto evita guardar una cuenta personal de Facebook dentro del bot únicamente para descargar videos públicos.

### ☁️ Archivos y recursos

- `.mediafire <url>`
- `.gdrive <url>` — archivo público de Google Drive.
- `.gitclone <url>` — repositorio público de GitHub como ZIP.
- `.apk <texto>` — búsqueda en **F-Droid**.
- `.apkdl <url-fdroid>` — descarga APK desde F-Droid.
- `.anime <texto>` — búsqueda mediante Jikan/MyAnimeList.
- `.manga <texto>` — búsqueda en MangaDex.

Ghost Nexora Bot **no automatiza catálogos de APK crackeadas/modificadas**. Para aplicaciones se priorizan F-Droid y releases/repositorios públicos, reduciendo riesgo de malware, firmas alteradas y paquetes redistribuidos sin autorización.

---

## 🪙 Nexora Economy

La moneda virtual interna se llama **Nexora Coins (`NXC`)**.

No es una criptomoneda blockchain ni representa dinero real; es una unidad virtual de la economía del bot para comprar funciones y suscripciones internas.

### Comandos

| Acción | Comandos |
|---|---|
| Saldo | `.balance`, `.bal` |
| Trabajar | `.work`, `.w`, `.trabajar` |
| Depositar al banco | `.deposit`, `.dep`, `.guardar` |
| Retirar | `.withdraw`, `.retirar` |
| Transferir | `.transfer @usuario 500`, `.pay` |
| Robar cartera | `.rob @usuario`, `.robar` |
| Ranking | `.top` |
| Tienda | `.shop`, `.store` |
| Comprar | `.buy <producto>` |

El dinero del **banco no puede ser robado**. `.rob` solo afecta saldo que el usuario lleva en cartera y tiene cooldown/penalización.

### Productos iniciales

- `private1d`
- `private7d`
- `subbot1d`
- `subbot7d`
- `subbot30d`

Comprar de nuevo tiempo de subbot **extiende la instancia existente** en lugar de crear otra innecesariamente.

El owner puede activar `.privatemode on` para exigir una suscripción de acceso privado en módulos que no sean esenciales. Economía, tienda, menú y administración de la propia suscripción siguen accesibles.

---

## 🤖 Subbots

Una suscripción de subbot se compra con Nexora Coins.

```text
.shop
.buy subbot7d
.subbot pair 5215512345678
```

El bot devuelve un código de vinculación para el número elegido. La sesión de cada subbot se guarda en un directorio independiente.

### Usuario del subbot

```text
.subbot status
.subbot pair <numero>
.subbot portal
```

`.subbot portal` genera un enlace aleatorio con caducidad. Ese portal **solo puede consultar la instancia asociada al token**.

### Owner

```text
.subbots
.adminpanel
```

`.adminpanel` solo entrega el enlace administrativo en chat privado para evitar filtrar el token owner en un grupo.

El dashboard owner muestra las instancias, estado, owner, número vinculado, vencimiento, mensajes procesados y tráfico de descargas. Las métricas se registran por instancia.

---

## 👥 Administración de grupos

Comandos base:

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

Protecciones configurables:

```text
.enable welcome
.enable antilink
.enable antispam

.disable welcome
.disable antilink
.disable antispam
```

La bienvenida **no consulta ni envía la foto de perfil del nuevo participante**. Si `WELCOME_IMAGE_URL` está configurado se utiliza una imagen fija del bot; si no, se envía texto.

---

## 🔞 Módulo 18+

El módulo existe como componente **opt-in** y está desactivado globalmente en una instalación nueva.

El owner lo habilita con:

```text
.adultmode on
```

En grupos además hace falta una allowlist:

```text
.adult allow
.adult deny
.adult status
```

Cada usuario debe confirmar acceso voluntario:

```text
.adult18 accept
```

Proveedores implementados:

```text
.xvideos <busqueda|url>
.xnxx <busqueda|url>
.pornhub <busqueda|url>
```

En privado depende de `ADULT_PRIVATE_ENABLED`. El módulo bloquea búsquedas que indiquen contenido relacionado con menores y nunca intenta eludir esa restricción.

---

## 📦 Tamaño máximo de descarga

La configuración inicial usa:

```env
MAX_DOWNLOAD_MB=1900
```

Se deja margen por debajo de archivos cercanos a 2 GB. El máximo real que WhatsApp acepte puede depender del tipo de mensaje, cliente y cambios del servicio.

Los archivos grandes se almacenan temporalmente en disco y se envían mediante ruta de archivo; no se cargan completos en RAM. MediaFire y los recursos también usan streaming a disco.

---

## 🚀 Instalación VPS

### Después de que la versión esté en `main`

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador hace lo siguiente:

1. instala Node.js 24, npm, FFmpeg, Git, nginx y `yt-dlp`;
2. clona/actualiza el repositorio;
3. ejecuta `npm install` y `npm run build`;
4. crea el usuario Linux `ghostbot`;
5. crea almacenamiento persistente para sesión, SQLite y subbots;
6. solicita el número principal;
7. usa ese número como owner si `OWNER_NUMBERS` todavía está vacío;
8. genera el pairing code;
9. instala servicios `systemd`;
10. genera un token administrativo web aleatorio.

El número puede escribirse con `+`, espacios o guiones. El instalador conserva los dígitos introducidos. Escribe el número en el formato internacional que tu cuenta de WhatsApp utiliza.

### Probar la rama Draft actual

Mientras PR #1 siga en Draft:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/feature/ghost-nexora-bot-v1/scripts/install.sh | sudo env BRANCH=feature/ghost-nexora-bot-v1 bash
```

---

## 🔒 HTTPS automático

Primero crea un registro DNS `A`/`AAAA` que apunte tu dominio a la VPS. Después instala pasando el dominio:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo env BOT_DOMAIN=bot.tudominio.com LETSENCRYPT_EMAIL=tu-correo@dominio.com bash
```

El instalador:

- configura nginx como reverse proxy;
- redirige al servidor Next.js local;
- solicita certificado Let's Encrypt mediante Certbot;
- activa redirección HTTP → HTTPS.

Si DNS todavía no propagó, la instalación del bot continúa y Certbot puede repetirse después.

---

## ⚙️ `.env`

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

Nunca publiques `.env`, `data/session`, la base SQLite ni los tokens de portal.

---

## 🧱 Arquitectura

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
│   │       │   └── subbots.ts
│   │       ├── core/
│   │       ├── services/
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

### Persistencia

La V1 utiliza `node:sqlite` de Node 24 para:

- economía;
- ledger de movimientos;
- suscripciones;
- políticas de grupo;
- subbots;
- métricas de subbots;
- tokens temporales de portal.

No necesitas instalar MySQL/PostgreSQL para comenzar a probar el bot.

---

## 💻 Desarrollo local

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

## 🧪 CI

GitHub Actions valida:

- instalación npm;
- TypeScript;
- build del bot;
- build de Next.js;
- sintaxis de scripts Bash.

No se debe considerar una versión lista para producción mientras CI no esté verde y no se haya hecho una prueba real de pairing/descarga en VPS.

---

## 🗺️ Roadmap

Próximas mejoras recomendadas:

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

---

## 📄 Licencia

MIT. Consulta `LICENSE`.

### 👻 Ghost Developer / Nexora

Proyecto diseñado para que una instalación pequeña pueda crecer a un servicio multi-instancia sin reescribir todo el bot.
