# 👻 Ghost Nexora Bot

Bot profesional y extensible para **WhatsApp Multi-Device**, desarrollado por **Ghost Developer / Nexora**.

> ⚠️ Proyecto no oficial. Ghost Nexora Bot no está afiliado con WhatsApp ni Meta. Úsalo de forma responsable, evita spam y respeta las condiciones y licencias de los servicios desde los que descargues contenido.

## ✨ Características de la V1

- 🔗 Vinculación **Multi-Device por código de emparejamiento**, usando tu número de WhatsApp, con QR como alternativa.
- 💾 Sesión persistente: no necesitas volver a vincular la cuenta después de cada reinicio.
- 👑 Los comandos enviados desde la propia cuenta vinculada se reconocen automáticamente como owner; también puedes configurar co-owners por número.
- ⚙️ Prefijo configurable y persistente. El prefijo por defecto es `.`.
- 📜 Menú completo con `.menu` y categorías.
- ❤️ Reacciones automáticas a comandos y, opcionalmente, a conversaciones comunes.
- 🖼️ Creación de stickers desde imágenes o videos.
- 🎞️ Conversión de sticker a imagen PNG.
- 🔎 Búsqueda de YouTube con `.yts` y reproducción/descarga por texto con `.play` y `.playvideo`.
- 📥 Descargas de YouTube en audio/video sin cookies configuradas por el bot.
- 🎚️ Consulta de calidades disponibles con `.ytformats` y selección de resolución con `.ytmp4`.
- 🎧 SoundCloud por URL o búsqueda.
- 📱 Descargas públicas compatibles con TikTok, Instagram, Facebook y X/Twitter mediante `yt-dlp`.
- ☁️ Descargas de MediaFire mediante resolución del enlace público.
- 👥 Herramientas de administración de grupos con comprobación PN/LID compatible con Baileys 7.
- 🌐 Web moderna en **Next.js 16 + Tailwind CSS 4**, con estado real del bot.
- ❤️ Endpoint de salud interno para mostrar conexión, uptime y prefijo actual.
- 🛡️ Límites de tamaño, validación de hosts y limpieza de archivos temporales.
- 🧪 GitHub Actions para TypeScript y build de producción.
- 🚀 Instalador para Ubuntu/VPS con Node.js, FFmpeg, pnpm, `yt-dlp` y servicios `systemd` endurecidos.

## 🚀 Instalación rápida en VPS Ubuntu

Con la versión publicada en `main`, ejecuta **un solo comando**:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador:

1. instala Node.js, FFmpeg, Git, pnpm y `yt-dlp`;
2. clona/actualiza Ghost Nexora Bot en `/opt/ghost-nexora-bot`;
3. instala dependencias y compila bot + web;
4. crea un usuario de servicio dedicado sin privilegios administrativos;
5. guarda sesión y datos persistentes fuera del repositorio;
6. solicita tu número de WhatsApp y genera el código de vinculación;
7. instala y activa `ghost-nexora-bot.service` y `ghost-nexora-web.service`.

Para actualizar después:

```bash
sudo /opt/ghost-nexora-bot/scripts/update.sh
```

## 🔗 Vincular WhatsApp manualmente

```bash
pnpm pair
```

Escribe el número con código de país, **solo dígitos**. Ejemplo para México: `521XXXXXXXXXX`.

En WhatsApp abre:

**Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono**

e introduce el código mostrado por Ghost Nexora Bot.

Si el código de emparejamiento no se puede usar, el proceso normal del bot mantiene **QR como respaldo**.

## 📜 Comandos principales

El prefijo por defecto es `.`.

| Categoría | Comandos |
|---|---|
| General | `.menu`, `.help`, `.ping`, `.info`, `.prefix` |
| Stickers | `.sticker`, `.s`, `.toimg` |
| Búsqueda/Play | `.yts`, `.play`, `.playvideo`, `.soundcloud` |
| YouTube | `.ytformats`, `.ytmp3`, `.yta`, `.ytmp4`, `.ytv` |
| Descargas | `.tiktok`, `.instagram`, `.facebook`, `.twitter`, `.mediafire` |
| Grupos | `.tagall`, `.hidetag`, `.link`, `.group`, `.kick`, `.promote`, `.demote` |
| Owner | `.setprefix`, `.restart`, `.status` |

Ejemplos:

```text
.menu
.sticker
.yts Linkin Park Numb
.play Linkin Park Numb
.playvideo trailer oficial
.soundcloud https://soundcloud.com/...
.ytformats https://youtu.be/...
.ytmp4 https://youtu.be/... 720
.ytmp3 https://youtu.be/...
.mediafire https://www.mediafire.com/file/...
.setprefix !
```

Para `.sticker`, responde a una imagen/video con el comando o envía el comando como caption del archivo.

## 🎬 Descargas y cookies

Ghost Nexora Bot **no configura ni almacena cookies de YouTube**. La V1 usa `yt-dlp` como motor local para contenido público y FFmpeg para combinar/transcodificar cuando sea necesario.

Esto evita depender del HTML, publicidad y redirecciones de páginas convertidoras públicas que cambian constantemente. Los adaptadores están aislados en `apps/bot/src/services/`, por lo que se pueden añadir proveedores HTTP adicionales o fallbacks más adelante sin reescribir el router de comandos.

Descarga únicamente contenido que sea tuyo, de dominio público o para el que tengas permiso/licencia.

## 🧱 Arquitectura

```text
GhostNexoraBot/
├── apps/
│   ├── bot/
│   │   └── src/
│   │       ├── commands/     # Comandos y permisos
│   │       ├── core/         # Sesión, router, settings
│   │       ├── services/     # Descargas, MediaFire, stickers
│   │       └── utils/        # Mensajes, JID/LID, logging
│   └── web/                  # Next.js + Tailwind CSS
├── scripts/                  # Instalación y actualización VPS
├── systemd/                  # Servicios Linux endurecidos
├── .github/workflows/        # CI
├── .env.example
└── pnpm-workspace.yaml
```

## ⚙️ Configuración

Copia `.env.example` a `.env` para desarrollo local.

```env
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=5210000000000
AUTO_REACT=true
MAX_DOWNLOAD_MB=60
SESSION_DIR=./data/session
DATA_DIR=./data
BOT_HEALTH_PORT=3001
BOT_HEALTH_URL=http://127.0.0.1:3001/health
WEB_PORT=3000
LOG_LEVEL=info
```

`OWNER_NUMBERS` acepta varios números separados por coma y sin `+`. La propia cuenta vinculada se considera owner automáticamente cuando envía comandos; `OWNER_NUMBERS` sirve para autorizar números adicionales.

## 🛡️ Seguridad

- Nunca subas `data/session`, `.env` ni credenciales a GitHub.
- El instalador ejecuta bot y web con un usuario dedicado sin shell administrativo.
- Las credenciales persistentes se guardan en `/var/lib/ghost-nexora-bot` en VPS.
- Las descargas se limitan a dominios soportados y tienen tamaño máximo configurable.
- Los archivos temporales se eliminan después de enviarse.
- Los comandos de grupo comprueban permisos del usuario y del bot.
- La resolución de permisos contempla identificadores **PN y LID** de WhatsApp/Baileys 7.
- `.setprefix`, `.restart` y operaciones sensibles están restringidas a owner.
- `systemd` usa `NoNewPrivileges`, `PrivateTmp` y `ProtectSystem=strict`; la web solo puede escribir su caché de runtime.

## 💻 Desarrollo

Requisitos: Node.js 22+, pnpm, FFmpeg y `yt-dlp`.

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm pair
pnpm dev
```

Web: `http://localhost:3000`  
Health del bot: `http://localhost:3001/health`

## 🗺️ Próximas fases

- Panel autenticado para gestionar prefijo, owners, módulos y configuración.
- Sub-bots/sesiones secundarias estilo Jadibot.
- Persistencia PostgreSQL/Supabase opcional para datos de usuarios y configuración.
- Sistema de plugins con carga desacoplada.
- Antispam, bienvenida, antilink, anti-delete y moderación avanzada.
- Niveles/economía y módulos recreativos opcionales.
- Dashboard de métricas y logs.
- Más adaptadores de descarga: Google Drive, GitHub ZIP y otros proveedores públicos estables.
- Docker/Compose y despliegue multi-instancia.

## 📄 Licencia

MIT. Consulta `LICENSE`.

---

### 👻 Ghost Developer / Nexora

Hecho para ser fácil de instalar, mantener, extender y desplegar en producción.
