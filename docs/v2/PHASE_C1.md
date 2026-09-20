# Phase C1 — Slash commands de Discord desde metadata central

Estado: EN VALIDACIÓN

## Objetivo

Eliminar el inventario manual de slash commands de Discord y proyectar la superficie de application commands desde el catálogo central introducido en B3, sin alterar el motor compartido B1–B5 ni los comandos por mensaje.

## Implementación

- `discordApplicationCommands` se genera desde `platformCommandMetadata('discord')`.
- El catálogo central decide nombre canónico, aliases, disponibilidad de plataforma, discoverability, descripción, claves i18n y argumentos.
- Las descripciones se publican en español y con localizaciones `en-US`, `en-GB`, `es-ES` y `es-419`.
- Los argumentos string conservan `required` y `max_length` cuando están declarados.
- Los comandos `discoverable: false` siguen siendo routables pero no se registran como slash commands.
- Los comandos nativos de Discord todavía no migrados al `SharedCommandEngine` continúan en el catálogo como fallback y también se proyectan automáticamente.
- Los aliases existentes se proyectan desde metadata central para conservar compatibilidad de slash commands sin un inventario Discord paralelo.
- La generación detecta colisiones de nombres/aliases entre comandos canónicos y falla de forma explícita.
- Los comandos Discord por mensaje conservan `discordCommandAliases`, `SharedCommandEngine` y el fallback nativo.
- B5 permanece intacta: cada ejecución sigue creando su `RequestContext` inmutable y correlation ID.

## Validación

Gate dedicado: `scripts/phase-c1-discord-slash-metadata-smoke.mjs`.

El gate comprueba fuente de verdad central, discoverability, aliases, colisiones, i18n, argumentos, compatibilidad message commands, SharedCommandEngine y RequestContext. CI también ejecuta Typecheck, Build y los gates B1–B5.

C1 solo se marcará TERMINADO después de que el PR quede verde y sea fusionado a `main`.

## Siguiente subfase

C2 — Aliases centralizados.
