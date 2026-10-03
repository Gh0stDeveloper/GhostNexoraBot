# Phase F — Observabilidad, métricas y operación

Estado: TERMINADO

## F1 · PlatformRuntimeRegistry

`ops_platform_runtime` unifica por instancia el estado de WhatsApp, Discord y Telegram: estado, latencia, eventos, comunidades, reconexiones, rate limits, último evento, error sanitizado y metadata técnica acotada. Los runtimes publican cambios reales de conexión, sincronización, eventos y reconexión.

## F2 · Métricas de colas

`ops_queue_metrics` conserva profundidad actual/máxima, tiempos de espera y ejecución, fallos, retries, saturación y última saturación. Las dimensiones disponibles son plataforma, comando, provider y lane. Los carriles de ejecución incluyen default, downloads, AI y subbots.

## F3 · Métricas de adapters

`ops_adapter_metrics` registra entregas, fallos, retries, edit failures, typing failures, bytes subidos, latencia y rate limits para WhatsApp, Discord y Telegram. Los eventos 429 recientes se guardan por separado con retención acotada para alertas basadas en ventana temporal.

## F4 · Correlation IDs

`trace-context.ts` utiliza `AsyncLocalStorage` para propagar el correlation ID desde ingest/request hacia router, comando, providers, MediaPipeline, outbox y adapters. La traza transporta únicamente metadatos operativos y no contenido de conversaciones.

## F5 · Alertas operativas

`operational-health.ts` evalúa periódicamente:

- rate limits recientes;
- providers offline/degradados;
- Discord Gateway en reconexión repetida;
- desconexiones de WhatsApp ya reportadas por el runtime;
- profundidad/espera/saturación de colas;
- fallos de FFmpeg y yt-dlp/download;
- contención SQLite/DB locked;
- latencia crítica de adapters;
- espacio libre de disco;
- memoria RSS.

Las alertas reutilizan `ops_alerts`, por lo que aparecen en el centro de alertas existente sin crear un sistema paralelo.

## F6 · Error grouping

`ops_error_groups` agrupa fallos mediante fingerprint SHA-256 calculado sobre error normalizado/sanitizado más plataforma, comando y provider. Conserva primera aparición, última aparición, cantidad, muestra sanitizada y último correlation ID.

## Dashboard

Developer / Diagnostics muestra:

- runtime uniforme por plataforma;
- métricas de colas;
- métricas de adapters;
- errores agrupados;
- pipeline y command audit ya existentes.

La Web aplica sanitización nuevamente al leer los datos y mantiene aislamiento por instancia.

## Privacidad y retención

La observabilidad no persiste contenido de mensajes. Los logs, errores y metadata pasan por sanitización de secretos. Los correlation IDs identifican una ejecución, no a una persona, y permiten unir eventos técnicos sin guardar la conversación.

## Gates

`scripts/phase-f-observability-smoke.mjs` valida F1–F6 en runtime y estructura. Fase F queda añadida como regresión obligatoria en CI y workflows V2 relevantes.

PR de cierre: #105.
