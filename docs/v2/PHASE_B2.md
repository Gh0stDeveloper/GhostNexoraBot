# Fase B2 — Un solo Command Engine

Estado de validación: TERMINADO

## Objetivo

B2 establece una sola frontera de resolución y ejecución de comandos:

```text
Evento -> normalizador de plataforma -> CommandEngine -> CommandContext neutral -> PlatformAdapter
```

WhatsApp conserva compatibilidad V1 únicamente mediante `LegacyCompatibleCommandContext`; Discord y Telegram consumen el catálogo neutral compartido.

## Contrato B2

`CommandEngine` centraliza:

- resolución de nombres y aliases;
- permisos estáticos de comando;
- configuración runtime E6;
- cooldowns;
- autorización adicional de plataforma/comunidad;
- ejecución del handler;
- telemetría y auditoría.

Los handlers neutrales sólo utilizan operaciones del `CommandContext` como `reply`, `sendText`, `sendUi`, `sendMedia`, `editMessage`, `react` y `setTyping`.

## Catálogo compartido

`apps/bot/src/commands/shared.ts` reúne los módulos ya transport-neutral:

- general/menu/help, ping e info;
- idioma;
- créditos;
- sistema;
- versión;
- VK;
- APKMirror y APKPure;
- provider health.

`discordstatus` y `tgstatus` permanecen nativos porque son diagnósticos exclusivos de cada runtime.

## Paridad por plataforma

- WhatsApp usa el catálogo completo con bridge legacy, pero matcher y ejecución pasan por `CommandEngine`.
- Discord y Telegram resuelven y ejecutan `sharedNeutralCommands` con el mismo engine.
- Los providers compartidos usan UI/media neutral, sin dependencias de Baileys.
- Los menús no-WhatsApp filtran por soporte real, configuración runtime y cooldown.
- Los callbacks normalizan prefijos para evitar IDs inválidos o comandos con doble slash.

## Gates

- CI principal con TypeScript, build, B1 y B2 smoke.
- Telegram V2 Phase 4.
- Discord V2 Phase 5.
- i18n/regresiones V2 Phase 6.
- Baseline de comandos WhatsApp.
- Regresiones de E6, Operations Center y acceso adulto.

## Evidencia

La implementación completa fue validada originalmente en `feature/b2-shared-command-engine` con CI #2998 en success. La reconciliación sobre el `main` actual conserva además:

- `syncgroups` como delta pre-B2 aprobado en el baseline histórico;
- smoke Discord determinista para el flujo ACK → respuesta → limpieza del placeholder;
- las correcciones de validación integradas antes de esta consolidación.

B2 queda cerrada cuando el commit reconciliado vuelve a pasar los gates anteriores.
