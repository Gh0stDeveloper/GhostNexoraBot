# Phase C — Paridad Discord y Telegram

Estado: TERMINADO

## Cierre

La Fase C completa la proyección de comandos y las garantías operativas de Discord/Telegram sobre el núcleo compartido B1–B5.

### C1 · Slash commands desde metadata

Los application commands de Discord se generan desde el catálogo central, con aliases, argumentos, localización y detección de colisiones.

### C2 · Aliases centralizados

Discord y Telegram resuelven nombres y aliases mediante `resolvePlatformCommandToken()`. Los mapas exportados antiguos permanecen únicamente como proyección de compatibilidad para consumidores históricos y tests; los routers ya no los mantienen ni consumen como fuente propia.

### C3 · Menús y ayuda desde metadata

`platformCommandHelpCatalog()` genera el catálogo visible según plataforma y permisos. Discord y Telegram construyen su ayuda desde esa misma metadata y muestran aliases sin inventarios manuales.

### C4 · Component IDs persistentes de Discord

Los comandos que no caben directamente en los 100 bytes de `custom_id` se guardan en SQLite (`discord_component_refs`) con scope por instancia y TTL. Un botón válido puede resolverse después de recrear el adapter o reiniciar el runtime mientras no haya expirado.

### C5 · Media streaming en Discord

`outgoing-media-stream.ts` abre bytes, paths y URLs como `AsyncIterable<Uint8Array>`, aplica límite durante el flujo y permite multipart streaming. El adapter de Discord ya no ejecuta `arrayBuffer()` para media remota ni lee paths completos antes de enviarlos.

### C6 · Rate limiting por buckets

El cliente REST aprende `x-ratelimit-bucket`, respeta `x-ratelimit-reset-after`, conserva el límite global y separa buckets por major parameter (channel/guild/webhook). Los retries 429 recrean el body de streaming cuando corresponde.

## Gates

- TypeScript y Build completos.
- C1 smoke conservado.
- `phase-c-parity-smoke.mjs` para C2–C6.
- V2 Phase 5 cubre persistencia de componentes, streaming y rate limit.
- Regresiones B1–B5, Telegram, i18n y release gates permanecen obligatorias.

PR de cierre: #105.
