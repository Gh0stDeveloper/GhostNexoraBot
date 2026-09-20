# Fase B5 — RequestContext inmutable

Estado: TERMINADO

## Objetivo

Aislar identidad y permisos por mensaje para que dos ejecuciones concurrentes no compartan ni sobrescriban estado del request.

Cada comando recibe un snapshot `request` que contiene:

- plataforma;
- instancia lógica del bot;
- chat;
- usuario;
- locale;
- permisos;
- message ID o event ID;
- correlation ID único.

## Contrato

`RequestContext` y `RequestPermissionSnapshot` son tipos `Readonly`.

`createRequestContext()`:

1. normaliza los identificadores obligatorios;
2. genera un `correlationId` con `randomUUID()` cuando no se proporciona uno;
3. congela `permissions`;
4. congela el snapshot raíz.

`SharedCommandEngine` valida que:

- plataforma del request = adapter;
- instancia del request = adapter;
- chat/usuario/message ID = mensaje normalizado;
- los aliases legacy de `CommandContext` no diverjan del snapshot.

## Routers

### WhatsApp

El snapshot se crea después de resolver permisos relevantes para el comando.

Se conservan `args` mutables por compatibilidad V1: existen handlers legacy que modifican el array antes de delegar a otro handler.

B5 **no** elimina `WhatsAppAdapter.activeUserId`; esa deuda pertenece a **D1** y continúa pospuesta.

### Discord

Los mensajes normales usan el ID del mensaje.

Slash commands y components mantienen separado:

- `messageId`: mensaje de Discord al que se puede responder cuando existe;
- `requestMessageId`: ID del evento/interacción usado por B5.

Esto evita tratar un interaction ID como reply target.

### Telegram

Cada update de comando crea un snapshot usando el mensaje normalizado y los permisos calculados para ese usuario.

## Correlation ID

B5 introduce el ID dentro del contexto y lo añade a los logs de error de comando.

La propagación end-to-end por todos los subsistemas/telemetría sigue perteneciendo a **F4**.

## Validación

`scripts/phase-b5-request-context-smoke.mjs` verifica:

- freeze del snapshot y de permisos;
- rechazo de mutaciones;
- rechazo de bindings cruzados;
- aislamiento de dos ejecuciones concurrentes;
- integración WhatsApp/Discord/Telegram;
- correlation ID presente en logs de los tres routers.


## Cierre validado

- El snapshot raíz y permisos son inmutables en runtime mediante `Object.freeze`.
- El engine verifica que request, adapter y mensaje normalizado pertenezcan a la misma ejecución.
- Dos ejecuciones concurrentes conservan chat, usuario, locale, permisos y correlation ID propios.
- WhatsApp, Discord y Telegram usan un snapshot independiente por comando.
- El correlation ID aparece en logs de error de los tres routers.
- `activeUserId` de WhatsApp no se modifica aquí y continúa explícitamente en D1.
- La propagación completa de tracing hacia providers/media/outbox continúa en F4.
- CI principal y gate B5 pasaron en verde sobre `087d09f8c041ad42e532bca8fdf1515341b7f9ca`.
- PR de cierre: #86.
