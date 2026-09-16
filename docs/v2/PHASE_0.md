# V2 · Fase 0 — contratos y baseline

> Rama de implementación: `feat/v2-phase-0-contracts`  
> Base: `main@f50f27a4438bb3bd7958e5d28956d3aed4b11997`

## Objetivo

Preparar la migración multiplataforma sin cambiar todavía el comportamiento de WhatsApp. Esta fase introduce contratos neutrales, herramientas de inventario y una suite de contrato que puedan ejecutarse sin importar Baileys.

## Implementado

### `packages/platform-contracts`

Define la frontera entre Core y transportes:

- `PlatformId` (`whatsapp`, `telegram`, `discord`);
- `NormalizedMessage`;
- `NormalizedMedia`;
- `PlatformCapabilities`;
- `NormalizedUi`;
- `OutgoingMedia`;
- `SentMessage`;
- `PlatformAdapter`;
- fallback `normalizedUiToText`;
- comprobación de capabilities;
- `MemoryPlatformAdapter` para contract tests y futuros tests de comandos compartidos.

### `packages/core`

Añade contratos neutrales para:

- inventario de comandos;
- clasificación `shared`, `capability-gated`, `platform-specific`, `runtime-only`;
- requisitos de capabilities;
- disponibilidad por plataforma;
- snapshot de permisos;
- detección de colisiones entre nombres y aliases.

No reemplaza todavía `apps/bot/src/core/router.ts`. Ese cambio corresponde a la Fase 1.

### `packages/runtime`

Define:

- estados del runtime;
- contrato de lifecycle;
- health snapshot común;
- namespace por `platform + botInstanceId`;
- clave de entidad `<platform>:<instance>:<type>:<externalId>`.

Esto establece el modelo de aislamiento que usarán MainBot, subbots, Telegram y Discord.

## Baseline V1 previo a V2

El baseline queda anclado a:

```text
f50f27a4438bb3bd7958e5d28956d3aed4b11997
```

### Providers

El snapshot estático está en:

```text
docs/v2/baselines/providers-v1.json
```

Incluye 18 proveedores/familias detectados en el estado auditado. VK, APKMirror y APKPure no forman parte de este baseline porque todavía no estaban implementados.

### Comandos

`scripts/v2-baseline-report.mjs` construye el bot y extrae el registro efectivo real en dos perfiles:

- `minimal`: Web deshabilitado y Ollama deshabilitado;
- `full`: Web habilitado y Ollama habilitado.

El reporte incluye:

- número total de comandos;
- número de comandos canónicos;
- nombres y aliases;
- categoría;
- descripción y uso;
- flags de permisos;
- nombres canónicos duplicados;
- colisiones de aliases;
- catálogo de providers.

El worker se ejecuta en un `DATA_DIR`/`SESSION_DIR` temporal para no modificar datos reales.

Comando local:

```bash
npm run v2:inventory
```

Salida predeterminada:

```text
artifacts/v2-current-inventory.json
```

CI genera además `v2-current-inventory.json` y lo publica como artifact `v2-phase0-baseline`.

### Snapshot generado y congelado

La primera ejecución exitosa de `V2 Phase 0` produjo:

| Perfil | Entradas | Canónicos | Nombres duplicados | Colisiones de alias |
|---|---:|---:|---:|---:|
| `minimal` | 508 | 403 | 71 | 37 |
| `full` | 509 | 404 | 71 | 37 |

La única función canónica presente solo en `full` es `adminpanel`.

El resumen inmutable está en:

```text
docs/v2/baselines/commands-v1-summary.json
```

Guarda hashes SHA-256 del conjunto de nombres canónicos y de las filas completas del inventario, además del hash del artifact de CI. Así futuras comparaciones pueden demostrar cambios respecto al estado V1 sin depender de estimaciones manuales.

Las 71 duplicaciones canónicas y 37 colisiones de alias se consideran **deuda heredada V1**. Fase 0 solo las registra; no cambia resolución de comandos. Cualquier limpieza deberá hacerse posteriormente con pruebas de compatibilidad explícitas.

## Contract tests

Ejecutar:

```bash
npm run v2:contracts
```

La suite valida sin Baileys:

- plataformas soportadas;
- capabilities;
- validación de límites de upload;
- fallback de UI;
- adapter en memoria;
- edición, typing y reactions como contrato;
- inventario y colisiones de comandos;
- gating por capability;
- namespace de runtime;
- claves namespaced de entidades.

## CI

`.github/workflows/v2-phase0.yml` ejecuta:

1. `npm install`;
2. `npm run typecheck` para todos los workspaces;
3. `npm run build` para todos los workspaces;
4. `npm run v2:contracts`;
5. generación del baseline real de comandos/providers;
6. subida del artifact de inventario.

La CI principal existente continúa ejecutándose también. Fase 0 no elimina ni reduce ningún smoke previo.

## Compatibilidad V1

Esta fase **no**:

- cambia el router de WhatsApp;
- cambia `CommandContext` actual;
- cambia `WAMessage`/`WASocket` usados por V1;
- cambia sesiones;
- cambia la persistencia actual;
- activa Telegram o Discord;
- cambia versión del proyecto;
- cambia payloads de mensajes.

Por diseño, los nuevos paquetes conviven en paralelo hasta Fase 1.

## Gate de Fase 0

Para cerrar la fase deben quedar verdes:

- CI principal del repositorio;
- workflow `V2 Phase 0`;
- `npm run typecheck`;
- `npm run build`;
- todos los smoke tests V1;
- `npm run v2:contracts`;
- generación del inventario de ambos perfiles.

Si cualquiera falla, no se inicia la migración del router en Fase 1.

## Siguiente fase

Fase 1 envolverá el comportamiento existente en `WhatsAppAdapter` de manera incremental. El objetivo será que el Core pueda consumir `PlatformAdapter` sin eliminar de golpe los tipos Baileys del runtime V1.
