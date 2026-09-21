# Ghost Nexora — Discord

## Estado actual

**Pendiente.** En la auditoría de `main` no se encontró un adapter, runtime ni configuración de Discord. V2 no debe declarar Discord como soportado hasta que exista una entrada independiente, persistencia aislada y la suite compartida de comandos.

## Objetivo V2

Discord será un transport oficial del mismo Shared Core:

```text
Discord Gateway / REST
        ↓
DiscordAdapter
        ↓
NormalizedMessage
        ↓
Shared Core
        ↓
NormalizedUi
        ↓
DiscordAdapter
```

## Tecnología propuesta

- Node.js 24+;
- TypeScript;
- `discord.js`;
- Gateway intents mínimos necesarios;
- REST para registrar slash commands cuando se habiliten;
- prefijo textual conservado para mantener paridad con las demás plataformas.

## Configuración

```env
DISCORD_ENABLED=false
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=
DISCORD_SLASH_COMMANDS=true
```

`DISCORD_GUILD_ID` debe ser opcional: sirve para staging/registro rápido, no como requisito de producción global.

## Intents

Solicitar únicamente los necesarios. La primera versión debe justificar expresamente cada intent privilegiado.

Mínimo esperado según funciones habilitadas:

- Guilds;
- GuildMessages;
- MessageContent, únicamente si se conserva el parser por prefijo y la configuración del bot lo requiere;
- GuildMembers solo para módulos que realmente necesiten miembros/moderación.

Los módulos deben degradarse por capability cuando un intent no está concedido.

## Normalización

Mapeo principal:

- `channelId` → `chatId`;
- `author.id` → `senderId`;
- `message.id` → `messageId`;
- guild/channel/thread → contexto de conversación;
- attachments → `NormalizedMedia`;
- referenced message → `replyTo`;
- component interactions → acciones UI por token.

Los IDs de Discord son strings opacas. El Core nunca debe convertirlos a números.

## UI

| Ghost UI | Discord |
|---|---|
| texto | mensaje normal |
| card | Embed |
| botón | Button component/customId |
| lista | select menu cuando sea útil |
| carrusel | embeds paginados + botones |
| edición | `message.edit` |
| typing | `channel.sendTyping()` |
| media | attachment |

Los `customId` deben ser tokens cortos con estado server-side. No serializar secretos, URLs extensas o JSON arbitrario en componentes.

## Permisos

Crear un `DiscordPermissionMapper` que produzca el `PermissionSnapshot` común.

Ejemplos:

```text
Administrator                 -> botAdmin
ManageGuild / ManageMessages  -> groupAdmin capability
owner del bot                 -> owner global según config
usuario normal                -> member
```

No mapear roles por nombre (`Admin`, `Owner`) como autoridad; usar permisos/IDs configurados.

## Slash commands

Son una mejora de UX, no una segunda implementación de lógica.

```text
/chat input command
      ↓
Discord command bridge
      ↓
misma definición BotCommand
```

El registro de slash commands puede generarse automáticamente desde metadata del command registry para comandos compatibles.

## Hilos, DMs y servidores

El adapter debe diferenciar:

- DM;
- canal de texto;
- thread;
- forum thread cuando aplique.

La moderación solo se habilita donde exista guild + permisos suficientes.

## Descargas y archivos

El Download Core es compartido. DiscordAdapter decide si el resultado puede subirse con el límite efectivo del contexto. Si no cabe, utilizar URL temporal segura cuando esté disponible o responder con limitación de tamaño.

## Economía e identidad

`discord:<instance>:user:<snowflake>` es una identidad independiente. Compartir NXC con WhatsApp/Telegram solo mediante `IdentityLink` verificado.

## i18n

Usar `es/en` del core. El locale de Discord/interacción puede sugerir el idioma inicial, pero una preferencia guardada tiene prioridad.

## Rate limits

- respetar rate limits de discord.js/REST;
- no implementar loops de reintento agresivos;
- aplicar cooldown común de comandos;
- separar rate limit de plataforma del cooldown funcional del bot.

## CI

```text
discord-adapter-contract
discord-normalization-fixtures
discord-component-token-smoke
discord-permission-map
discord-intents-capability-smoke
discord-shared-command-suite
discord-reconnect-smoke
```

Las pruebas live deben ser staging opt-in con secrets, nunca requisito para forks.

## Definition of Done V2

- inicia y se detiene sin depender de WhatsApp;
- procesa comandos compartidos;
- DMs, guilds, replies, media y components funcionan;
- permissions se mapean correctamente;
- datos y credenciales están namespaced;
- Web muestra estado y métricas;
- desconexión de Discord no interrumpe otras plataformas;
- i18n `es/en` completo en sus respuestas.

Ver [arquitectura multiplataforma](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
