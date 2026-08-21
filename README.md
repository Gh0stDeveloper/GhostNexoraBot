# 👻 Ghost Nexora Bot

Bot profesional y extensible para **WhatsApp Multi-Device**, desarrollado por **Ghost Developer**.

> ⚠️ Proyecto no oficial. Ghost Nexora Bot no está afiliado con WhatsApp ni Meta. Usa el bot de forma responsable, evita spam y respeta las condiciones de los servicios desde los que descargues contenido.

## ✨ Características de la V1

- 🔗 Vinculación **Multi-Device por código de emparejamiento**, usando tu número de WhatsApp, con QR como alternativa.
- 💾 Sesión persistente: no necesitas volver a vincular la cuenta después de cada reinicio.
- ⚙️ Prefijo configurable. El prefijo por defecto es `.`.
- 📜 Menú completo con `.menu` y categorías.
- ❤️ Reacciones automáticas a comandos y, opcionalmente, a conversaciones comunes.
- 🖼️ Creación de stickers desde imágenes o videos.
- 🎞️ Conversión de sticker a imagen.
- 📥 Descargas de YouTube en audio/video sin cookies configuradas por el bot.
- 🎚️ Consulta de calidades disponibles con `.ytformats`.
- 📱 Descargas compatibles con TikTok, Instagram, Facebook y X/Twitter mediante `yt-dlp` cuando el contenido es público y soportado.
- ☁️ Descargas de MediaFire mediante resolución del enlace público.
- 👥 Herramientas de administración de grupos.
- 👑 Comandos de propietario, incluido cambio de prefijo en caliente.
- 🌐 Web moderna en **Next.js 16 + Tailwind CSS 4**.
- ❤️ Endpoint de salud del bot para mostrar su estado en la web.
- 🛡️ Límites de tamaño, validación de hosts y limpieza de archivos temporales.
- 🧪 GitHub Actions para validar TypeScript y producción web.
- 🚀 Instalador para Ubuntu/VPS con Node.js, FFmpeg, pnpm, yt-dlp y servicios systemd.

## 🚀 Instalación rápida en VPS Ubuntu

Con el repositorio ya publicado en `main`, ejecuta **un solo comando**:

```bash
curl -fsSL https://raw.githubusercontent.com/Gh0stDeveloper/GhostNexoraBot/main/scripts/install.sh | sudo bash
```

El instalador:

1. instala Node.js, FFmpeg, Git, pnpm y `yt-dlp`;
2. clona/actualiza Ghost Nexora Bot en `/opt/ghost-nexora-bot`;
3. instala dependencias y compila bot + web;
4. crea un usuario de servicio sin privilegios;
5. solicita tu número de WhatsApp y genera el código de vinculación;
6. instala y activa `ghost-nexora-bot.service` y `ghost-nexora-web.service`.

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

## 📜 Comandos principales

El prefijo por defecto es `.`.

| Categoría | Comandos |
|---|---|
| General | `.menu`, `.help`, `.ping`, `.info`, `.prefix` |
| Stickers | `.sticker`, `.s`, `.toimg` |
| YouTube | `.ytformats`, `.ytmp3`, `.yta`, `.ytmp4`, `.ytv` |
| Descargas | `.tiktok`, `.instagram`, `.facebook`, `.twitter`, `.mediafire` |
| Grupos | `.tagall`, `.hidetag`, `.link`, `.group`, `.kick`, `.promote`, `.demote` |
| Owner | `.setprefix`, `.restart`, `.status` |

Ejemplos:

```text
.sticker
.ytformats https://youtu.be/...
.ytmp4 https://youtu.be/... 720
.ytmp3 https://youtu.be/...
.mediafire https://www.mediafire.com/file/...
.setprefix !
```

Para `.sticker`, responde a una imagen/video con el comando o envía el comando como caption del archivo.

## 🎬 Descargas y cookies

Ghost Nexora Bot **no configura ni almacena cookies de YouTube**. La V1 usa `yt-dlp` como motor local para contenido público y FFmpeg para combinar/transcodificar cuando sea necesario. Esto evita depender de páginas de conversión aleatorias que cambian constantemente o introducen publicidad y redirecciones inseguras.

Los adaptadores están aislados en `apps/bot/src/services/`, por lo que se pueden añadir proveedores HTTP públicos o privados más adelante sin modificar los comandos.

Descarga únicamente contenido que sea tuyo, de dominio público o para el que tengas permiso/licencia.

## 🧱 Arquitectura

```text
GhostNexoraBot/
├── apps/
│   ├── bot/                  # WhatsApp/Baileys + comandos + servicios
│   │   └── src/
│   │       ├── commands/
│   │       ├── core/
│   │       ├── services/
│   │       └── utils/
│   └── web/                  # Next.js + Tailwind CSS
├── scripts/                  # Instalación y actualización VPS
├── systemd/                  # Servicios Linux
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
```

`OWNER_NUMBERS` acepta varios números separados por coma y sin `+`.

## 🛡️ Seguridad

- Nunca subas `data/session`, `.env` ni credenciales a GitHub.
- El instalador ejecuta el bot con un usuario dedicado sin shell administrativo.
- Las descargas se limitan a dominios soportados y tienen tamaño máximo configurable.
- Los archivos temporales se eliminan después de enviarse.
- Los comandos administrativos validan permisos del grupo.
- `.setprefix`, `.restart` y operaciones sensibles están limitadas a los números configurados como owner.

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

- Panel autenticado para gestionar prefijo, owners y módulos.
- Sub-bots/sesiones secundarias.
- Persistencia PostgreSQL/Supabase opcional.
- Sistema de plugins con hot reload.
- Antispam, niveles, economía y moderación avanzada.
- Dashboard de métricas y logs.
- Adaptadores de descarga adicionales con fallback configurable.
- Docker/Compose y despliegue multi-instancia.

## 📄 Licencia

MIT. Consulta `LICENSE`.

---

### 👻 Ghost Developer / Nexora

Hecho para ser fácil de instalar, mantener, extender y desplegar en producción.
