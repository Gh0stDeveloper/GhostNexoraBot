# V2 · Fase 1 — WhatsAppAdapter y frontera de transporte

> Rama: `feat/v2-phase-1-whatsapp-adapter`  
> Base: `feat/v2-phase-0-contracts@db360ae666cc90ac502dd84f7f5d3461a04995e4`

## Objetivo

Encapsular progresivamente Baileys detrás de un `PlatformAdapter` sin cambiar el comportamiento observable del bot actual. La Fase 1 no intenta convertir de una vez los más de 400 comandos canónicos en comandos neutrales: establece una frontera ejecutable, migra el router y concentra los componentes de transporte WhatsApp más importantes.

## Implementación

### `WhatsAppAdapter`

Ubicación:

```text
apps/bot/src/platform/whatsapp/adapter.ts
```

Implementa el contrato `PlatformAdapter` de Fase 0 y expone:

- `sendText`;
- `sendMedia`;
- `sendUi`;
- `editMessage` para edición legítima de mensajes del propio bot;
- `setTyping`;
- `react`;
- `normalizeMessage`;
- `rememberMessage` para resolver quotes/reacciones durante la transición.

Capabilities declaradas:

```text
editMessage      true
reactions        true
typing           true
buttons          true
carousel         true
embeds           false
files            true
polls            true
groupModeration  true
maxUploadBytes   config.maxDownloadBytes
```

`embeds=false` es deliberado: los embeds son una primitiva de Discord; WhatsApp usa tarjetas/native flow y previews propios.

## Normalización de entrada

`normalizeWhatsAppMessage()` convierte `WAMessage` a `NormalizedMessage`:

```text
WAMessage
   ↓
normalizeWhatsAppMessage
   ↓
NormalizedMessage
  platform
  botInstanceId
  chatId
  senderId
  messageId
  text
  isGroup
  replyTo
  pushName
  media metadata
  raw
```

El campo `raw` se conserva temporalmente para interoperabilidad durante la migración. Los futuros comandos `shared` no deben depender de él.

## CommandContext transicional

El contexto actual ofrece simultáneamente:

```ts
platform
adapter
normalizedMessage
```

y mantiene temporalmente:

```ts
socket      // deprecated V1 compatibility
message     // deprecated V1 compatibility
```

Esto permite migrar comandos en lotes sin romper los handlers existentes.

### Regla para código nuevo

Un comando nuevo que se pretenda compartir con Telegram/Discord debe usar:

```text
ctx.adapter
ctx.normalizedMessage
ctx.reply / ctx.react
```

No debe introducir una dependencia nueva de Baileys salvo que esté declarado como WhatsApp-only.

## Router

`apps/bot/src/core/router.ts` continúa realizando por ahora la extracción WhatsApp de identidad, metadata de grupo y permisos, pero la salida común ya se canaliza a través de `WhatsAppAdapter`.

Cambios principales:

- instancia un adapter por mensaje/instancia;
- construye `NormalizedMessage`;
- `ctx.reply()` usa `adapter.sendText()`;
- `ctx.react()` usa `adapter.react()`;
- respuestas de relaciones con mentions usan `adapter.sendText()`;
- el `CommandContext` entrega la superficie neutral.

### Compatibilidad de `ctx.reply()`

Algunos handlers V1 hacen:

```ts
const status = await ctx.reply('...')
// después leen status.key para editar progreso
```

Por esa razón `ctx.reply()` envía por el adapter pero devuelve temporalmente `SentMessage.raw`, que en WhatsApp corresponde al `WAMessage` devuelto por Baileys. Esto evita romper progresos existentes mientras esos comandos migran al contrato `SentMessage`.

## Interactivos

La implementación nativa se movió de:

```text
apps/bot/src/services/interactive.ts
```

a:

```text
apps/bot/src/platform/whatsapp/interactive.ts
```

Se conservan:

- `NativeFlowMessage`;
- nodos adicionales del relay;
- `viewOnceMessage` wrapper actual;
- precarga de imágenes;
- máximo de ocho cards;
- dos botones principales por card;
- navegación de overflow;
- fallback a texto;
- localización actual.

El archivo antiguo permanece como re-export de compatibilidad, por lo que los comandos existentes no requieren una migración masiva en esta fase.

## Media

`preloadWhatsAppMedia` se movió a:

```text
apps/bot/src/platform/whatsapp/media.ts
```

`services/whatsapp-media.ts` queda como shim. Se preservan Buffers, límites, timeout y fallback `{ url }` de V1.

## Socket localizado

La localización transparente de payloads Baileys se movió a:

```text
apps/bot/src/platform/whatsapp/localized-socket.ts
```

El import histórico sigue funcionando mediante shim.

Este mecanismo es una capa de compatibilidad. Los adapters Telegram/Discord no reutilizarán un socket localizado de WhatsApp: deberán recibir texto ya resuelto por i18n y traducir su propia UI.

## Typing

El helper común:

```text
apps/bot/src/core/typing.ts
```

opera exclusivamente sobre `PlatformAdapter` y `capabilities.typing`.

El runtime principal ya lo usa para free-chat, audio chat y auto-chat. Esto elimina del flujo principal la implementación duplicada que llamaba directamente a `sendPresenceUpdate`.

## Edición y Valley

Hay dos conceptos distintos que no deben mezclarse.

### Edición normal del adapter

`WhatsAppAdapter.editMessage()` edita mensajes del propio bot con la key legítima del mensaje enviado.

Esta es la capacidad que podrán consumir comandos compartidos cuando necesiten actualizar progreso.

### `.edit` ValleyBot / ValleyInvisible

`apps/bot/src/commands/edit.ts` permanece sin migrar a `ctx.adapter`.

Su secuencia especial de `stanzaId` y fallback de colisión de ID se conserva exactamente como PoC acotada y continúa protegida por:

- owner/staff;
- solo grupos;
- allowlist de bug bounty;
- pruebas V23 existentes.

El adapter general no debe incorporar esa primitive.

## MainBot y subbots

`CommandRouter` recibe `instanceId`; por eso el adapter expone:

```text
main
subbot-<id>
```

como `botInstanceId` normalizado.

Los subbots siguen usando su runtime existente; al pasar por el mismo router obtienen automáticamente `adapter` y `normalizedMessage` sin compartir una instancia mutable del adapter.

## Termux Lite

`@ghostnexora/bot` depende ahora explícitamente de `@ghostnexora/platform-contracts`.

Los scripts `build` y `build:termux` compilan primero el paquete de contratos para que Termux Lite pueda resolver el import en runtime incluso cuando se invoca únicamente el workspace del bot.

Fase 1 no habilita Web ni Ollama en Lite ni cambia su alcance funcional.

## Regression gate

La Fase 0 congeló el registro V1. La Fase 1 añade:

```text
scripts/v2-phase1-command-regression.mjs
```

que compara el inventario actual con fingerprints derivados del artifact de Fase 0.

Se validan por perfil:

- número de entradas;
- comandos canónicos;
- nombres canónicos duplicados;
- colisiones de aliases;
- total de tokens nombre+alias;
- SHA-256 del conjunto canónico;
- SHA-256 de todas las filas de comando;
- SHA-256 de todos los tokens.

También se comprueba el número de providers congelado.

Por tanto, una refactorización que cambie silenciosamente un alias, permiso, categoría, descripción, uso o comando hará fallar CI.

## Pruebas de adapter

`scripts/whatsapp-adapter-v2-smoke.mjs` usa un socket falso y valida:

- capabilities;
- normalización de texto/media/quote;
- `sendText` con quote y mentions;
- compatibilidad `SentMessage.raw`;
- envío de documento desde bytes;
- `NormalizedUi.text`;
- edición estándar;
- reaction con la key original;
- typing composing/paused;
- shims V1;
- ubicación de Native Flow bajo la frontera WhatsApp;
- preservación explícita de `.edit` Valley fuera del adapter.

## CI

`.github/workflows/v2-phase1.yml` ejecuta:

1. instalación;
2. typecheck de todos los workspaces;
3. build completo;
4. contratos Fase 0;
5. smoke `WhatsAppAdapter`;
6. build Termux Lite;
7. smoke Termux Lite;
8. generación del inventario actual;
9. comparación exacta contra el baseline;
10. publicación del inventario como artifact.

El CI principal continúa siendo obligatorio y no se reduce.

## Deuda deliberadamente pendiente

Fase 1 no afirma todavía que todo `apps/bot/src/commands` sea neutral. Siguen existiendo handlers V1 que usan directamente:

- `ctx.socket`;
- `ctx.message`;
- metadata/JIDs de WhatsApp;
- funciones específicas de Baileys.

Esos comandos deben clasificarse y migrarse por lotes antes de declararlos `shared` para Telegram/Discord.

Tampoco se han trasladado todavía al adapter todas las operaciones de moderación/grupos; eso requiere contratos de permisos y miembros más ricos que los definidos en Fase 0.

## Gate de Fase 1

La fase queda técnicamente cerrada cuando:

- `npm run typecheck` pasa;
- `npm run build` pasa;
- `npm run v2:contracts` pasa;
- `npm run v2:whatsapp-adapter` pasa;
- Termux Lite compila y pasa su smoke;
- el fingerprint del registro V1 permanece idéntico;
- CI principal completa todos los smokes heredados;
- `.edit` Valley conserva su suite de paridad.

## Siguiente fase

Fase 2 utilizará esta frontera para centralizar la compatibilidad de UI. El trabajo principal será clasificar todas las rutas interactivas, expresar las que sean compartibles como `NormalizedUi` y garantizar fallback por capability sin reintroducir payloads que produzcan el aviso de actualización de WhatsApp.
