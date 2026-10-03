# Phase D — Runtime y entrega WhatsApp

Estado: TERMINADO

La Fase D endurece el runtime de WhatsApp sobre el núcleo compartido B1–B5 y conserva la compatibilidad con los comandos legacy que todavía dependen de Baileys.

## D1 · Contexto de entrega inmutable

`WhatsAppAdapter` ya no conserva `activeUserId`. `SendOptions.delivery` transporta explícitamente `userId`, `locale` y `correlationId` desde el `RequestContext` de cada ejecución. Los helpers compartidos, edición y reacciones reciben el mismo contexto, evitando contaminación entre peticiones concurrentes.

## D2 · Caché por chat con TTL y LRU

`WhatsAppMessageCache` usa claves `chatId:messageId`, límite de 1000 referencias y TTL de 15 minutos. El acceso actualiza el orden LRU, hay limpieza automática por expiración y cada instancia del bot conserva su propio scope.

## D3 · Colas de ejecución

`ExecutionQueueManager` limita simultáneamente:

- global: 20;
- por grupo: 3;
- por usuario: 2;
- downloads: 4;
- IA: 3;
- operaciones de subbots: 3.

Los comandos pasan por estas colas antes del handler. Free-chat, audio IA y auto-chat también usan el carril de IA.

## D4 · Outbox fiable

`delivery_outbox` persiste el ciclo `pending -> sending -> sent/retry/failed` por instancia, plataforma y chat. El backoff por defecto es 1 s, 3 s y 10 s, con hasta cuatro intentos. El outbox guarda metadata operativa y correlation ID, no el cuerpo de mensajes privados.

WhatsApp utiliza el outbox en texto, media, UI y edición. Los broadcasts del comando, del panel administrativo y de la vista de grupos pasan por el adapter y heredan la misma política.

Los callbacks de entrega se reintentan durante la ejecución actual. Una entrada `sending` abandonada por reinicio se reconcilia a `retry` para diagnóstico; el contenido del mensaje no se persiste deliberadamente, por lo que no se reproduce automáticamente tras un reinicio.

## D5 · Fallback automático de UI

La degradación de WhatsApp es determinista:

`Carousel -> Card -> List -> Plain text`.

Cada etapa se intenta dentro de la misma operación de outbox. Los fallos de Native Flow/Baileys no invalidan el comando completo mientras exista una representación inferior viable.

## D6 · MediaPipeline común

`media-pipeline.ts` centraliza:

- límites de tamaño;
- validación de paths y URLs;
- streaming;
- descarga temporal segura;
- detección/fallback MIME;
- nombres de archivo;
- cleanup;
- retries de descarga;
- hook opcional de transcodificación.

WhatsApp, Discord y Telegram consumen la misma capa. Discord conserva multipart streaming; WhatsApp materializa URLs remotas de forma acotada cuando necesita una fuente local estable; Telegram valida y normaliza media antes de entregarla al Bot API.

## Validación

El gate `scripts/phase-d-runtime-delivery-smoke.mjs` verifica aislamiento de caché, TTL/LRU, límites de concurrencia, outbox/retries, fallback de UI, MediaPipeline y la eliminación de estado mutable de usuario.

PR de cierre: #105.
