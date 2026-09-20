# Fase C1 · Slash commands de Discord generados automáticamente

Estado: EN VALIDACIÓN

## Objetivo

C1 elimina el registro manual de slash commands y deriva la superficie de Discord desde el catálogo central de metadata introducido en B3, sin modificar la semántica de B1–B5 ni los runtimes de WhatsApp/Telegram.

## Implementación

- `platformCommandMetadata('discord')` es la fuente de verdad para disponibilidad, nombre, aliases, descripción, argumentos, permisos, capabilities y `discoverable`.
- `apps/bot/src/platform/discord/application-commands.ts` transforma metadata central a definiciones de Discord.
- Se eliminó `slashTokens` de la metadata nativa.
- El router Discord ya no mantiene `discordApplicationCommands`.
- Los comandos nativos aún no migrados permanecen descritos en el catálogo central y siguen siendo ejecutados por el fallback del router.
- Los aliases continúan resolviéndose con la infraestructura existente; C2 queda reservado para centralizar completamente los mapas de aliases.

## Reglas de generación

- solo metadata con disponibilidad `discord`;
- solo comandos `discoverable`;
- nombre canónico y aliases normalizados al formato de Discord;
- descripciones ES/EN mediante las claves i18n existentes;
- argumentos tipo string con `required` y `max_length` desde metadata;
- argumentos requeridos antes que opcionales;
- `dm_permission=false` para comandos `groupOnly`;
- fallo explícito por colisiones de nombres/options o por superar límites de Discord;
- límite máximo de 100 application commands.

## Compatibilidad

C1 conserva:

- Discord message commands;
- `SharedCommandEngine`;
- aliases existentes;
- comandos nativos Discord todavía no migrados;
- `RequestContext` inmutable de B5 y correlation IDs;
- aislamiento por `botInstanceId`;
- compilación de WhatsApp y Telegram sin cambios de routing.

## Validación

Smoke dedicado:

```bash
npm run phase:c1
```

El smoke valida:

- generación desde metadata;
- discoverability;
- aliases;
- localización ES/EN;
- `required` y `max_length`;
- disponibilidad Discord;
- detección de colisiones;
- ausencia de `slashTokens`;
- ausencia de metadata slash duplicada en el router;
- permanencia de Discord message commands, `SharedCommandEngine` y B5.

GitHub Actions incorpora el gate `Phase C1 generated Discord slash commands smoke` después de B1–B5.

## Cierre

C1 se marcará **TERMINADO** únicamente cuando typecheck, build, smoke C1, regresiones B1–B5 y workflows del PR finalicen correctamente.

Siguiente subfase: **C2 · Aliases centralizados**.
