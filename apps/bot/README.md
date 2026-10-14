# `@ghostnexora/bot`

Workspace del runtime de Ghost Nexora Bot.

## Estado actual

Este workspace contiene el MainBot de WhatsApp, subbots, Termux Lite, comandos, servicios, economía, juegos, descargas, i18n y LLM opcional. En V2 será migrado gradualmente para consumir un Core neutral de plataforma.

Documentación detallada:

- [Core / MainBot](../../docs/software/core/README.md)
- [WhatsApp](../../docs/software/whatsapp/README.md)
- [Termux Lite](../../docs/software/termux-lite/README.md)
- [Telegram V2](../../docs/software/telegram/README.md)
- [Discord V2](../../docs/software/discord/README.md)
- [Arquitectura V2](../../docs/v2/ARCHITECTURE_MULTIPLATFORM.md)

## Requisitos

```text
Node.js >= 24
npm >= 11
```

Dependencias operativas según funciones:

```text
FFmpeg             multimedia
yt-dlp             descargadores compatibles
Ollama             opcional, LLM local
Playwright         opcional, browser providers
Sharp              opcional, procesamiento de imágenes
```

## Scripts

Desde la raíz del monorepo:

```bash
npm run build --workspace=@ghostnexora/bot
npm run typecheck --workspace=@ghostnexora/bot
npm run start --workspace=@ghostnexora/bot
npm run pair --workspace=@ghostnexora/bot
npm run build:termux --workspace=@ghostnexora/bot
```

Desde este workspace:

```bash
npm run dev
npm run build
npm run typecheck
npm run start
npm run pair
npm run build:termux
npm run termux:start
npm run termux:pair
```

## Entradas

```text
src/index.ts                  runtime Full
src/pair.ts                   pairing WhatsApp
src/termux-lite.ts            runtime Termux Lite
src/subbot-worker.ts          worker subbot Full
src/subbot-worker-termux.ts   worker subbot Lite
```

## Carpetas

```text
src/commands/   comandos registrados
src/core/       router, settings, subbots y control común actual
src/services/   integraciones y lógica de servicios
src/i18n/       catálogos y resolución de idioma
src/llm/        Ollama/RAG/worker LLM
assets/         recursos locales
data/           seed/versionados, no datos runtime del usuario
```

## Persistencia

Los datos runtime deben apuntar a los directorios configurados por `.env`/instalador y permanecer fuera del checkout cuando sea posible. Nunca versionar:

```text
sesiones WhatsApp
credenciales
.env real
tokens Telegram/Discord
cookies
bases del usuario
logs con secretos
```

## Perfiles

### Full

Puede habilitar Web y Ollama de forma independiente.

### Termux Lite

Fuerza un conjunto reducido y no debe cargar Web/Ollama ni dependencias pesadas no compatibles con el perfil.

## Regla V2

Código nuevo destinado a funcionar en las tres plataformas no debe depender directamente de Baileys. Las operaciones de transporte irán detrás de `PlatformAdapter`.

Hasta que la extracción finalice, cualquier migración debe conservar los entrypoints anteriores y todos los smoke tests existentes.

## Testing

La raíz contiene una suite amplia de smokes ejecutada por GitHub Actions. Antes de integrar cambios del workspace:

```bash
npm install
npm run typecheck
npm run build
```

Y ejecutar los smokes relacionados con el módulo tocado.

## V2

El estado, fases y gates están en [docs/v2/README.md](../../docs/v2/README.md). No cambiar el package a `2.0.0` hasta completar el release checklist de V2.
