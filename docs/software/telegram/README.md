# Ghost Nexora — Telegram

## Estado actual

**Pendiente como plataforma oficial.** El código actual contiene `telegram-bridge-v7.ts` y variables `TELEGRAM_BOT_TOKEN`/canal destinadas a integración/bridge. Eso no equivale a ejecutar Ghost Nexora completo en Telegram.

## Objetivo V2

Telegram debe consumir el mismo Shared Core que WhatsApp:

```text
Telegram Bot API
      ↓
TelegramAdapter
      ↓
NormalizedMessage
      ↓
Shared Core
      ↓
NormalizedUi
      ↓
TelegramAdapter
```

## Tecnología propuesta

- Node.js 24+;
- TypeScript;
- `grammy` como wrapper de Telegram Bot API, o cliente HTTP propio si se decide minimizar dependencias;
- long polling para instalación simple;
- webhook opcional para VPS con HTTPS.

No reutilizar `telegram-bridge-v7.ts` como adapter completo sin separar sus responsabilidades actuales.

## Entrada y configuración

Variables propuestas:

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_MODE=polling
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
```

Los secretos deben quedar por instancia y nunca exponerse en el panel.

## Normalización

Mapear:

- `message.chat.id` → `chatId`;
- `message.from.id` → `senderId`;
- `message.message_id` → `messageId`;
- replies → `replyTo`;
- photos/video/audio/document → `NormalizedMedia`;
- callback queries → acciones UI con token.

## UI

| Ghost UI | Telegram |
|---|---|
| texto | `sendMessage` |
| card | texto formateado + inline keyboard |
| botones | `InlineKeyboardButton.callback_data` |
| carrusel | cards secuenciales o media group + callbacks |
| edición | `editMessageText`/caption |
| typing | `sendChatAction` |
| reacción | capability según Bot API disponible |

`callback_data` debe usar tokens cortos y server-side cache; no serializar URLs grandes ni objetos completos.

## Permisos

Mapeo de grupos:

- owner/creator Telegram → owner-equivalent;
- administrator → group admin;
- member → user;
- restricted/banned → no permisos administrativos.

Los comandos que requieren capacidades no disponibles deben ocultarse o responder con fallback claro.

## Descargas

Los providers son compartidos. TelegramAdapter se ocupa de límites de entrega:

1. si cabe en el límite configurado → subir archivo;
2. si no cabe y existe URL temporal segura → entregar enlace;
3. si no → mensaje de tamaño no soportado.

No volver a descargar el mismo contenido solo para cambiar de plataforma cuando el DownloadResult ya tiene un artefacto local reutilizable.

## Economía e identidad

Por defecto una identidad Telegram es independiente de WhatsApp. Para compartir NXC entre redes debe existir un flujo de vinculación verificable.

Ejemplo:

```text
.linkaccount
→ código de un solo uso
→ confirmar desde la otra plataforma
→ IdentityLink
```

## i18n

El idioma se resuelve con el mismo sistema `es/en`. `language_code` de Telegram puede sugerir idioma inicial, pero nunca reemplazar una preferencia explícita.

## Bridge heredado

El bridge actual puede mantenerse como módulo independiente:

```text
telegram-channel-bridge != telegram-platform-adapter
```

Debe renombrarse/documentarse para evitar confusión.

## CI

```text
telegram-adapter-contract
telegram-normalization-fixtures
telegram-callback-token-smoke
telegram-permission-map
telegram-reconnect/polling
telegram-webhook-signature
telegram-shared-command-suite
```

Las pruebas unitarias no necesitan token real. Las pruebas live deben ser opt-in mediante secrets de CI/release staging.

## Definition of Done V2

- bot Telegram puede iniciar independientemente de WhatsApp;
- comandos `shared` pasan la misma suite;
- callbacks, media, edición y permisos funcionan;
- datos namespaced;
- Web muestra su estado;
- idiomas `es/en` completos;
- desconectar Telegram no afecta WhatsApp/Discord;
- bridge heredado sigue funcionando o se migra explícitamente.

Ver [arquitectura](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
