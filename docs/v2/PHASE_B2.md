# Fase B2 — Shared Command Engine

Estado de validación: EN PROGRESO

## Objetivo

B2 introduce un único punto de resolución y ejecución para comandos compartidos:

```text
Evento -> normalizador de plataforma -> SharedCommandEngine -> CommandContext neutral -> PlatformAdapter
```

La compatibilidad V1 de WhatsApp permanece detrás de `LegacyCompatibleCommandContext` hasta que las fases posteriores migren el catálogo restante.

## Contrato B2

El motor compartido debe permitir que un mismo handler neutral use:

- `reply` / `sendText`;
- `sendUi` para card, list y carousel;
- `sendMedia`;
- `editMessage`;
- `react`;
- `setTyping`.

Cada adapter traduce estas intenciones al transporte nativo de WhatsApp, Discord o Telegram.

## Implementación actual

- `core/shared-command-engine.ts` centraliza resolución, contexto neutral y ejecución.
- WhatsApp resuelve todo su catálogo mediante `SharedCommandEngine` y permite explícitamente el bridge legacy para comandos todavía no migrados.
- Discord y Telegram reutilizan el mismo handler para el lote neutral de B2.
- `commands/shared-neutral.ts` define el lote compartido certificado.
- `command-platform-support.ts` refleja ese lote en Operations Center.
- `menu/help` continúa nativo hasta B3, porque la metadata central de disponibilidad todavía no existe.
- Estado/runtime, providers e idioma que aún tienen lógica nativa permanecen como fallback temporal y se migrarán con el trabajo de metadata/paridad posterior.

## Gate de validación

Este documento existe también para disparar las suites históricas de plataforma sobre el estado B2. Antes de cerrar B2 deben quedar verdes:

1. CI principal: TypeScript, build, smoke B1 y smoke B2.
2. V2 Phase 4: Telegram adapter/runtime.
3. V2 Phase 5: Discord adapter/REST/Gateway/runtime y regresión Telegram.
4. V2 Phase 6: aislamiento i18n y regresiones de Discord/Telegram.
5. Superficie de comandos WhatsApp compatible con la baseline V2.

B2 sólo se marca como TERMINADO en el roadmap después de esos gates.
