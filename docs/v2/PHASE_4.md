# V2 · Fase 4 — Telegram nativo

## Objetivo

Convertir Telegram de un puente unidireccional a una plataforma de ejecución real de Ghost Nexora Bot sobre `PlatformAdapter`, sin abrir un segundo proceso de comandos ni competir por `getUpdates`.

La Fase 4 se apila sobre Fase 3 y no modifica la semántica de WhatsApp ni la PoC `.edit` ValleyBot/ValleyInvisible.

## Arquitectura

```text
Telegram Bot API
      |
      v
TelegramBotApiClient
      |
      +--> TelegramAdapter --------> PlatformAdapter
      |          |
      |          +--> text / media / UI / edit / typing / reactions
      |
      v
TelegramRuntime
      |
      +--> normalizeTelegramMessage
      +--> TelegramCommandRouter
      +--> channel_post --> Telegram bridge cache V7 --> .tgshare en WhatsApp
      +--> callback_query --> answerCallbackQuery --> comando
```

### Un solo consumidor de updates

`TelegramRuntime` es el único componente autorizado a ejecutar `getUpdates`. El bridge V7 ya no hace polling; `startTelegramBridge()` se conserva únicamente como hook de compatibilidad para instalaciones existentes y delega al runtime nuevo.

El offset se persiste como `update_id + 1` en `DATA_DIR/telegram-platform/state.json` (o `TELEGRAM_PLATFORM_STATE_FILE`). Esto evita reprocesar updates tras un reinicio normal.

## Webhook vs long polling

Telegram Bot API no permite `getUpdates` mientras exista un webhook activo.

Política V2:

- por defecto, `TELEGRAM_DELETE_WEBHOOK_ON_START=false`;
- si existe webhook, el runtime pasa a `blocked-webhook` y no lo elimina;
- el operador puede migrar deliberadamente activando `TELEGRAM_DELETE_WEBHOOK_ON_START=true`;
- `TELEGRAM_DROP_PENDING_UPDATES=false` conserva los updates pendientes por defecto.

No se realizan cambios destructivos silenciosos sobre una configuración Telegram existente.

## Adapter

`apps/bot/src/platform/telegram/adapter.ts` implementa:

- `sendText`: divide mensajes al límite de 4096 caracteres;
- `sendMedia`: photo, video, audio, document y sticker por URL/path/bytes;
- `sendUi`: traduce `NormalizedUi` a inline keyboard;
- `editMessage`: `editMessageText` o `editMessageCaption`;
- `setTyping`: `sendChatAction('typing')`;
- `react`: `setMessageReaction`;
- callbacks de comandos cortos directos y comandos largos mediante referencias efímeras, siempre <=64 bytes.

El límite de subida del adapter cloud se declara en 50 MiB. Una futura configuración con Local Bot API deberá declarar capacidades diferentes en vez de fingir el límite cloud.

## Identidad

Telegram no comparte identidad con WhatsApp:

```text
WhatsApp: <jid>
Telegram: telegram:<numeric_user_id>
```

Owners/staff Telegram se configuran exclusivamente mediante:

```env
TELEGRAM_OWNER_IDS=
TELEGRAM_STAFF_IDS=
```

No se intenta inferir una cuenta Telegram a partir de `OWNER_NUMBERS`.

## Comandos portados en Fase 4

El primer conjunto nativo es explícito y auditable:

- `/start`
- `/help`, `/menu`, `/ayuda`
- `/ping`
- `/info`, `/version`, `/botinfo`
- `/vk`, `/vkvideo`, `/vkd`
- `/apkmirror`, `/apkm`, `/amirror`
- `/apkmirrordl`, `/amdl`
- `/apkpure`, `/apkp`, `/pureapk`
- `/apkpuredl`, `/apdl`
- `/providerhealth`, `/dlhealth` — staff
- `/tgstatus`, `/telegramstatus` — owner

Los providers de Fase 3 son reutilizados directamente. No existe un extractor Telegram duplicado.

Los comandos de WhatsApp que dependen de JIDs, `WASocket`, administración específica de grupo, PoCs, payloads raw de Baileys o funciones que todavía no tienen contrato multiplataforma no se exponen falsamente en Telegram. Se migrarán por capacidad en fases posteriores.

## Bridge V7 preservado

`TELEGRAM_CHANNEL_ID` continúa siendo opcional. Cuando está configurado, `channel_post` y `edited_channel_post` recibidos por el runtime nativo actualizan la misma caché usada por `.tgshare` en WhatsApp.

El contenido protegido continúa bloqueado para redistribución.

## Variables

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_IDS=
TELEGRAM_STAFF_IDS=
TELEGRAM_DELETE_WEBHOOK_ON_START=false
TELEGRAM_DROP_PENDING_UPDATES=false
TELEGRAM_POLL_TIMEOUT_SECONDS=25
TELEGRAM_RECONNECT_DELAY_MS=3000
TELEGRAM_PLATFORM_STATE_FILE=
TELEGRAM_CHANNEL_ID=
TELEGRAM_CHANNEL_URL=
```

## Contratos de CI

`npm run v2:telegram` ejecuta:

1. `v2-phase4-telegram-smoke.mjs`
   - normalización;
   - límites de texto;
   - inline keyboard;
   - callback_data;
   - media;
   - edición;
   - typing;
   - reacciones.
2. `v2-phase4-telegram-audit.mjs`
   - exactamente un consumidor `getUpdates`;
   - URL de Bot API encapsulada en el client;
   - bridge sin polling;
   - webhook guard;
   - providers Phase 3 reutilizados.
3. build Termux Lite.
4. fingerprint de comandos WhatsApp Phase 3 sin cambios.
5. toda la matriz histórica CI y fases previas por workflows apilados.

## Gate de cierre

La fase se considera cerrada cuando:

- TypeScript y build pasan;
- Fases 0–3 continúan verdes;
- CI principal continúa verde;
- adapter/audit Telegram pasan;
- Termux Lite continúa compilando;
- el inventario WhatsApp no cambia respecto del delta aprobado de Fase 3;
- `.edit` Valley V23 continúa verde.
