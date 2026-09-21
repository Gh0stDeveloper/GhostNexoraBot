# Ghost Nexora Core / MainBot

## Estado

**Existente y funcional, todavía centrado en WhatsApp.** El workspace actual es `@ghostnexora/bot`, usa Node.js 24+, TypeScript 5.9 y Baileys 7.0.0-rc14. Incluye runtime Full, pairing, subbots, Termux Lite, economía, juegos, descargas, moderación, IA opcional, i18n y servicios auxiliares.

## Responsabilidad en V2

El Core será la lógica compartida de Ghost Nexora. Debe dejar de equivaler a “el bot de WhatsApp” y convertirse en el motor que utilizan todos los transports.

Incluye:

- command registry y router;
- permisos y políticas;
- settings;
- economía/banco;
- juegos/RPG/colecciones;
- descargas;
- moderación;
- IA y Ollama opcional;
- i18n;
- subbots/instancias;
- métricas y health;
- persistencia.

No debe incluir directamente:

- payloads específicos de WhatsApp;
- JIDs como modelo universal de identidad;
- `discord.js` o Telegram Bot API en dominio;
- UI específica de una plataforma.

## Runtime actual

```text
apps/bot/src/index.ts             Full
apps/bot/src/termux-lite.ts       Lite
apps/bot/src/pair.ts              pairing WhatsApp
apps/bot/src/subbot-worker.ts     subbot Full
apps/bot/src/subbot-worker-termux.ts
apps/bot/src/commands/            comandos
apps/bot/src/services/            servicios
apps/bot/src/core/                router/settings/subbots
apps/bot/src/i18n/                español/inglés
apps/bot/src/llm/                 Ollama/RAG/LLM
```

## Refactor requerido

Crear contratos compartidos antes de mover funcionalidad:

```text
packages/platform-contracts
packages/core
packages/runtime
packages/domain
packages/i18n
packages/ui
```

La migración debe ser incremental; `apps/bot` puede mantener shims hasta terminar V2.

## Configuración

Todas las variables deben dividirse en:

- comunes: nombre, prefijo, límites, paths;
- runtime: web, health, logs, Ollama;
- plataforma: credenciales y opciones WhatsApp/Telegram/Discord;
- instancia: MainBot/subbot;
- providers: descargas y APIs externas.

Nunca compartir credenciales entre instancias por herencia accidental.

## Persistencia V2

Estructura objetivo:

```text
DATA_DIR/
  global/
  identities/
  instances/
    whatsapp/main/
    telegram/main/
    discord/main/
  caches/
  downloads/
```

La economía cross-platform requiere enlazado de identidad explícito. Sin enlace, cada identidad externa es independiente.

## Seguridad

- secretos fuera del repositorio;
- redacción de tokens en logs;
- rutas temporales con cleanup;
- errores públicos sin stack trace;
- input validation con Zod;
- allowlist de acciones administrativas;
- no ejecutar shell arbitrario a petición de chats;
- preservar aislamiento MainBot/subbot.

## CI requerido

Mantener todos los smokes actuales y añadir:

```text
platform-contracts-smoke
command-portability-audit
capability-fallback-smoke
state-namespace-smoke
provider-health-contract-smoke
release-readiness-audit
```

## Definition of Done V2

- router neutral de plataforma;
- >= 90% de comandos clasificados `shared` o `capability-gated`;
- cero imports directos de Baileys en comandos `shared`;
- i18n completo `es/en`;
- persistencia namespaced;
- suite de contrato ejecutada contra WhatsApp, Telegram, Discord y FakeAdapter;
- release semver `2.0.0` solo después de los gates del plan maestro.

Ver [plan V2](../../v2/README.md) y [arquitectura multiplataforma](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
