# 🪟 Instalar Ghost Nexora Bot en Windows (CMD)

Guía para correr el bot en **Windows 10/11** usando el **Símbolo del sistema (CMD)**.

> [📖 Volver al README](../README.md) · [🐧 Instalación Linux/VPS](FIRST_INSTALL.md)

---

## 1. Requisitos

Instala esto **antes** (con instaladores oficiales):

| Herramienta | Para qué | Descarga |
|-------------|----------|----------|
| **Node.js 24 LTS** (o 20+) | Runtime | https://nodejs.org/ |
| **Git** | Clonar el repo | https://git-scm.com/download/win |
| **FFmpeg** | Stickers / audio / video | https://ffmpeg.org/download.html |
| **yt-dlp** (opcional) | Descargas | https://github.com/yt-dlp/yt-dlp |

En el instalador de Node marca la opción de agregar Node al **PATH**.

Comprueba en CMD:

```bat
node -v
npm -v
git --version
ffmpeg -version
```

Si `ffmpeg` no se reconoce, añade la carpeta `bin` de FFmpeg al PATH de Windows.

---

## 2. Clonar el proyecto

Abre **CMD** y ejecuta:

```bat
cd %USERPROFILE%\Documents
git clone https://github.com/Gh0stDeveloper/GhostNexoraBot.git
cd GhostNexoraBot
```

---

## 3. Configurar entorno

```bat
copy .env.example .env
notepad .env
```

Edita al menos:

```env
BOT_NAME=Ghost Nexora Bot
PREFIX=.
OWNER_NUMBERS=521XXXXXXXXXX
SESSION_DIR=.\data\session
DATA_DIR=.\data
BOT_HEALTH_PORT=3001
WEB_PORT=3000
LOG_LEVEL=info
```

`OWNER_NUMBERS` = tu número con código de país, solo dígitos.

Guarda el archivo y cierra el Bloc de notas.

---

## 4. Instalar dependencias y compilar

Desde la carpeta del repo:

```bat
npm install
npm run build
```

Si falla el build, revisa que la versión de Node sea 20+ (`node -v`).

---

## 5. Vincular WhatsApp (pairing)

```bat
npm run pair
```

1. Escribe tu número internacional (ej. `521234567890`).
2. En el teléfono: **WhatsApp → Dispositivos vinculados → Vincular con número**.
3. Introduce el código de 8 dígitos que muestra la terminal.
4. Espera el mensaje de conexión correcta.

---

## 6. Arrancar el bot

```bat
npm run bot
```

O desde el workspace raíz (según `package.json` del monorepo):

```bat
npm run start --workspace=@ghostnexora/bot
```

Si el script es `bot` en la raíz:

```bat
npm run bot
```

Deja esa ventana abierta. Para parar: `Ctrl+C`.

### Worker del Mini-LLM (opcional, otra ventana CMD)

```bat
cd %USERPROFILE%\Documents\GhostNexoraBot
npm run llm:worker --workspace=@ghostnexora/bot
```

Eso procesa documentos de la cola y el entrenamiento en segundo plano.

---

## 7. Probar en WhatsApp

```text
.ping
.menu
.llm status
.llm memory
```

`.llm memory` carga los textos seed (identidad, saludos, comida, anime, programación) a la memoria vectorial.

---

## 8. Actualizar el bot

```bat
cd %USERPROFILE%\Documents\GhostNexoraBot
git pull origin main
npm install
npm run build
```

Luego vuelve a ejecutar `npm run bot`.

**No borres** la carpeta `data\` (sesión, SQLite, LLM).

---

## 9. Problemas frecuentes en Windows

| Problema | Qué hacer |
|----------|-----------|
| `node` no se reconoce | Reinstala Node marcando PATH; cierra y abre CMD de nuevo |
| `ffmpeg` no se reconoce | Añade FFmpeg al PATH del sistema |
| Error de permisos en `data\` | Ejecuta CMD como administrador o mueve el repo a `Documents` |
| Pairing no conecta | Borra `data\session` solo si hace falta y vuelve a `npm run pair` |
| El LLM no usa textos | Ejecuta `.llm memory` y ten el worker activo |

---

## 10. Nota importante

- Windows es válido para **desarrollo y pruebas**.
- En producción se recomienda **Linux/VPS** (ver [FIRST_INSTALL.md](FIRST_INSTALL.md)).
- No subas a GitHub tu `.env`, `data\session` ni bases SQLite.

---

👻 Ghost Developer / Nexora
