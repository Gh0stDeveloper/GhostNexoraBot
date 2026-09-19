# Fase B4 — Capability-aware command execution

Estado: TERMINADO

## Objetivo

B4 hace que la ejecución consulte capacidades del adapter antes de entrar al handler y use fallbacks neutrales cuando una función nativa no exista.

El comando declara intención mediante `requiresCapabilities`; no necesita preguntar si está ejecutándose en WhatsApp, Discord o Telegram.

## Matriz de fallback

| Capacidad | Sin soporte nativo |
|---|---|
| `buttons` | UI/texto normalizado |
| `carousel` | UI/texto normalizado |
| `embeds` | UI/texto normalizado |
| `editMessage` | nuevo mensaje de texto |
| `reactions` | no-op seguro |
| `typing` | no-op seguro |
| `files` | URL textual cuando la fuente es remota; path/bytes fallan de forma controlada |
| `polls` | sin fallback genérico; bloquea antes del handler |
| `groupModeration` | sin fallback genérico; bloquea antes del handler |

## Contrato

- `supportsCapabilities()` continúa siendo un chequeo estricto de soporte nativo.
- `resolveCapabilityRequirements()` separa capacidades nativas, degradables y faltantes.
- `canExecuteWithCapabilityFallbacks()` responde si un comando puede ejecutarse de forma segura.
- `SharedCommandEngine` bloquea únicamente capacidades sin fallback seguro.
- El resultado de ejecución expone `fallbackCapabilities` para diagnóstico.
- Los routers nativos de Discord y Telegram aplican el mismo preflight a comandos que todavía no pasan por el engine compartido.

## Validación

El gate `scripts/phase-b4-capability-execution-smoke.mjs` valida fallbacks de UI, typing, edición y archivos, además del bloqueo previo para polls.


## Cierre validado

- `SharedCommandEngine` realiza preflight de `requiresCapabilities`.
- Los fallbacks degradables se ejecutan sin duplicar handlers por plataforma.
- `polls` y `groupModeration` bloquean antes del handler cuando no existe soporte.
- Los comandos nativos restantes de Discord/Telegram usan el mismo resolvedor.
- `scripts/phase-b4-capability-execution-smoke.mjs` pasó en CI.
- Typecheck, Build, Windows, Termux y regresión completa pasaron sobre `07c27051f50b16eb228ea9d5cb14ed6083a9cb40`.
- Evidencia funcional: CI run `35471325648` · success.
