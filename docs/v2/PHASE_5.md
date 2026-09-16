# Ghost Nexora Bot V2 · Fase 5 · Discord nativo

## Objetivo

La Fase 5 incorpora Discord como tercera plataforma real de Ghost Nexora Bot sobre `PlatformAdapter`, sin emular un `WASocket`, sin compartir credenciales entre plataformas y sin duplicar los providers introducidos en la Fase 3.

La implementación usa directamente:

- Discord Gateway v10 para eventos en tiempo real.
- Discord REST API v10 para mensajes, archivos, edición, typing, reacciones y registro de application commands.
- `@ghostnexora/platform-contracts` para la frontera de salida compartida.
- los providers V2 existentes de VK, APKMirror y APKPure.

No se añade un SDK de Discord como dependencia de producción.

## Arquitectura

```text
Discord
  |
  +-- Gateway v10
  |     |
  |     +-- HELLO / heartbeat / ACK
  |     +-- IDENTIFY / READY
  |     +-- RESUME / RESUMED
  |     +-- MESSAGE_CREATE
  |     +-- INTERACTION_CREATE
  |
  +-- REST API v10
        |
        +-- messages / edit / typing / reactions
        +-- multipart files
        +-- slash command synchronization
        +-- interaction acknowledgements

              |
              v
       DiscordRuntime
              |
       DiscordCommandRouter
              |
       DiscordAdapter
              |
       PlatformAdapter
              |
       Shared Core/providers
```

## Archivos

- `apps/bot/src/platform/discord/types.ts`: contratos mínimos de Gateway/REST.
- `apps/bot/src/platform/discord/config.ts`: configuración aislada e intents.
- `apps/bot/src/platform/discord/rest.ts`: transporte REST v10 y control de 429.
- `apps/bot/src/platform/discord/gateway.ts`: WebSocket, heartbeat, identify, resume y reconexión.
- `apps/bot/src/platform/discord/normalize.ts`: `DiscordMessage -> NormalizedMessage`.
- `apps/bot/src/platform/discord/adapter.ts`: implementación de `PlatformAdapter`.
- `apps/bot/src/platform/discord/router.ts`: comandos Discord portados por capacidad.
- `apps/bot/src/platform/discord/runtime.ts`: composición, estado persistente y application commands.

## Estrategia de entrada

Discord no depende exclusivamente del intent privilegiado `MESSAGE_CONTENT`.

### Slash commands

Son la entrada principal y funcionan sin habilitar lectura general del contenido de mensajes. La Fase 5 registra:

- `/start`
- `/help`
- `/menu`
- `/ping`
- `/info`
- `/version`
- `/vk url:<url>`
- `/apkmirror query:<app|package>`
- `/apkpure query:<app|package>`
- `/providerhealth`
- `/discordstatus`

Los botones de resultados usan componentes Discord y pueden ejecutar handlers internos como `apkmirrordl` y `apkpuredl` sin publicar comandos auxiliares innecesarios en el command picker.

### Mensajes

El router acepta:

- DMs al bot.
- mensajes que mencionan al bot, por ejemplo `<@BOT_ID> ping`.
- `/comando` recibido como mensaje.
- el prefijo global de Ghost Nexora Bot cuando Discord entrega `content`.

Para leer contenido general de mensajes en servidores debe habilitarse explícitamente `DISCORD_MESSAGE_CONTENT_ENABLED=true` y habilitar Message Content Intent en Discord Developer Portal.

El valor por defecto es `false`.

## Gateway y sesiones

El runtime implementa el ciclo de Gateway v10:

1. obtiene `/gateway/bot`;
2. abre WebSocket con `v=10&encoding=json`;
3. procesa `Hello`;
4. inicia heartbeats con jitter;
5. usa `IDENTIFY` únicamente cuando no existe sesión reanudable;
6. almacena `session_id`, `resume_gateway_url` y la secuencia;
7. usa `RESUME` al reconectar cuando es posible;
8. exige heartbeat ACK;
9. aplica backoff de reconexión;
10. trata cierres fatales de autenticación/intents como error no reintentable.

El código 4014 produce un error explícito indicando revisar los privileged intents en vez de crear un loop infinito de reconexión.

Antes de ejecutar un nuevo `IDENTIFY`, el runtime consulta `session_start_limit.remaining` de `/gateway/bot`.

## Persistencia

Por defecto:

```text
DATA_DIR/discord-platform/state.json
```

Puede cambiarse con:

```env
DISCORD_PLATFORM_STATE_FILE=
```

El estado contiene únicamente datos de reanudación del Gateway. El token no se escribe en ese archivo.

## REST y rate limits

`DiscordRestClient` centraliza todas las llamadas `https://discord.com/api/v10`.

- usa `Authorization: Bot <token>` solo donde corresponde;
- los callbacks de interacciones usan su endpoint/token de interacción sin enviar Bot Authorization;
- procesa `429` y respeta `Retry-After` / `retry_after`;
- mantiene el bloqueo temporal del rate limit global cuando Discord lo indica;
- limita los reintentos para evitar loops ilimitados.

## Mensajes y UI

`DiscordAdapter` implementa:

- mensajes de texto divididos al límite Discord de 2000 caracteres;
- replies mediante `message_reference`;
- `allowed_mentions.parse=[]` por defecto para impedir pings accidentales generados por contenido del bot;
- embeds para cards/listas;
- hasta 10 embeds cuando un `NormalizedUi.carousel` llega a Discord;
- botones de enlace;
- botones de comando mediante `custom_id`;
- referencias efímeras para comandos que no caben dentro del límite de `custom_id`;
- edición de mensajes;
- typing;
- reacciones;
- archivos multipart.

Aunque el request de Create Message admite hasta 25 MiB, el adapter reserva margen para metadata y multipart y expone un máximo seguro de 24 MiB por archivo.

## Interacciones

Los slash commands se reconocen inmediatamente antes de ejecutar el handler:

- application command: callback diferido tipo 5;
- componente: callback diferido tipo 6.

Después el handler usa el `PlatformAdapter` normal. En slash commands se elimina el placeholder diferido cuando la respuesta real ya fue enviada, evitando duplicar la UI.

## Providers compartidos

Discord reutiliza los servicios de Fase 3:

- VK / VK Video;
- APKMirror;
- APKPure;
- provider health;
- lease interproceso de APKMirror.

No existen forks Discord de esos scrapers/downloaders.

## Configuración

```env
DISCORD_BOT_TOKEN=
DISCORD_OWNER_IDS=
DISCORD_STAFF_IDS=
DISCORD_GUILD_ID=
DISCORD_REGISTER_COMMANDS=true
DISCORD_MESSAGE_CONTENT_ENABLED=false
DISCORD_RECONNECT_DELAY_MS=3000
DISCORD_MAX_RECONNECT_DELAY_MS=60000
DISCORD_PLATFORM_STATE_FILE=
```

### `DISCORD_GUILD_ID`

Si se define, los application commands se sobrescriben únicamente en ese guild. Es el modo recomendado durante desarrollo porque los cambios de guild commands se reflejan rápidamente.

Si queda vacío, el runtime usa application commands globales.

### Permisos de instalación recomendados

La aplicación debe instalarse con los scopes correspondientes a bot y application commands. Para la superficie de Fase 5, el bot necesita como mínimo poder ver el canal y enviar mensajes; para todas las capacidades del adapter se requieren también permisos para embeds, archivos, historial/replies y reacciones.

No debe concederse `Administrator` solo para hacer funcionar esta fase.

## Seguridad entre plataformas

Las identidades son independientes:

```text
WhatsApp owner -> OWNER_NUMBERS / JID
Telegram owner -> TELEGRAM_OWNER_IDS
Discord owner  -> DISCORD_OWNER_IDS
```

No se infiere que una persona con privilegios en una plataforma tenga los mismos privilegios en otra.

Los comandos que dependen de JIDs, `WASocket`, payloads Baileys o administración WhatsApp no se exponen en Discord fingiendo compatibilidad.

## Health

`/health` conserva su semántica actual de disponibilidad del MainBot WhatsApp y añade:

```text
platforms.discord
```

con estado, bot/application ID, guild count, secuencia, capacidad de resume, `MESSAGE_CONTENT`, scope de commands y último error.

## Verificación offline

La Fase 5 introduce:

- `scripts/v2-phase5-discord-smoke.mjs`
- `scripts/v2-phase5-discord-rest-smoke.mjs`
- `scripts/v2-phase5-discord-gateway-smoke.mjs`
- `scripts/v2-phase5-discord-runtime-smoke.mjs`
- `scripts/v2-phase5-discord-audit.mjs`

Comando agregado:

```bash
npm run v2:discord
```

El workflow `.github/workflows/v2-phase5.yml` vuelve a ejecutar también Fases 0, 1, 2, 3 y 4, el build/profile Termux Lite y el fingerprint del registro WhatsApp.

## Gate de cierre

La Fase 5 solo se considera cerrada cuando el HEAD de la PR cumple simultáneamente:

- TypeScript PASS;
- build completo PASS;
- Fases 0-4 PASS;
- adapter/router Discord PASS;
- REST/rate-limit Discord PASS;
- Gateway lifecycle/resume PASS;
- runtime slash/message integration PASS;
- boundary audit PASS;
- Termux Lite PASS;
- fingerprint de comandos WhatsApp sin cambios no aprobados;
- CI principal PASS.

## Referencias oficiales

- Gateway: https://docs.discord.com/developers/events/gateway
- Gateway events: https://docs.discord.com/developers/events/gateway-events
- Gateway intents: https://docs.discord.com/developers/events/gateway#gateway-intents
- Message Content Intent: https://docs.discord.com/developers/events/message-content-privileged-intent
- Create Message: https://docs.discord.com/developers/resources/message#create-message
- Rate limits: https://docs.discord.com/developers/topics/rate-limits
- Interactions: https://docs.discord.com/developers/interactions/receiving-and-responding
