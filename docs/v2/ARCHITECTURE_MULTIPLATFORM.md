# Arquitectura multiplataforma V2

## Objetivo

Convertir Ghost Nexora Bot de un runtime centrado en WhatsApp/Baileys a una plataforma con lógica común reutilizable en WhatsApp, Telegram y Discord, sin duplicar economía, juegos, descargas, moderación, IA, permisos, subbots ni i18n.

## Problema actual

El runtime actual nació alrededor de Baileys. Eso es correcto para V1, pero impide declarar soporte multiplataforma real si comandos y servicios dependen directamente de tipos, JIDs, payloads interactivos o sockets de WhatsApp.

V2 debe separar cuatro capas:

```text
[transport adapter]
        ↓
[normalization + capabilities]
        ↓
[command/application core]
        ↓
[domain services + persistence]
```

## Estructura objetivo

```text
apps/
  bot/                 # compat entrypoint actual / WhatsApp full
  web/                 # dashboard Next.js
  telegram/            # entrypoint Telegram
  discord/             # entrypoint Discord
  desktop/             # Tauri Windows + Linux/Kali
  android/             # app Android nativa

packages/
  platform-contracts/  # interfaces y DTOs neutrales
  core/                # router, permisos, command registry
  runtime/             # lifecycle, health, logs, config
  domain/              # economy, games, downloads, moderation
  i18n/                # catálogos y resolución de idioma
  ui/                  # NormalizedUi + fallback
```

La migración puede ser incremental. No es obligatorio mover todos los archivos de `apps/bot/src` de una sola vez.

## Contratos mínimos

### `PlatformId`

```ts
type PlatformId = 'whatsapp' | 'telegram' | 'discord'
```

### `NormalizedMessage`

```ts
interface NormalizedMessage {
  platform: PlatformId
  botInstanceId: string
  chatId: string
  senderId: string
  messageId: string
  text: string
  isGroup: boolean
  replyTo?: string
  media?: NormalizedMedia
  raw?: unknown
}
```

Los comandos comunes nunca deben asumir que `chatId` es un JID.

### `PlatformCapabilities`

```ts
interface PlatformCapabilities {
  editMessage: boolean
  reactions: boolean
  typing: boolean
  buttons: boolean
  carousel: boolean
  embeds: boolean
  files: boolean
  polls: boolean
  groupModeration: boolean
  maxUploadBytes: number
}
```

### `PlatformAdapter`

```ts
interface PlatformAdapter {
  readonly id: PlatformId
  readonly capabilities: PlatformCapabilities

  start(): Promise<void>
  stop(): Promise<void>
  sendText(chatId: string, text: string): Promise<SentMessage>
  sendMedia(chatId: string, media: OutgoingMedia): Promise<SentMessage>
  sendUi(chatId: string, ui: NormalizedUi): Promise<SentMessage>
  editMessage?(chatId: string, messageId: string, text: string): Promise<void>
  setTyping?(chatId: string, active: boolean): Promise<void>
  react?(chatId: string, messageId: string, reaction: string): Promise<void>
}
```

## UI normalizada

No transportar payloads de WhatsApp a Telegram o Discord. El core expresa intención:

```ts
type NormalizedUi =
  | { kind: 'text'; text: string }
  | { kind: 'card'; title: string; body?: string; buttons?: UiAction[] }
  | { kind: 'list'; title?: string; items: UiItem[] }
  | { kind: 'carousel'; cards: UiCard[] }
```

Cada adapter traduce a su formato nativo:

| UI | WhatsApp | Telegram | Discord |
|---|---|---|---|
| card | interactive/native o fallback | mensaje + inline keyboard | embed + components |
| carousel | carrusel compatible select-first | mensajes/cards secuenciales | embeds/components |
| button | quick reply/token | callback_data | ButtonBuilder customId |
| edit | Baileys edit | editMessageText | message.edit |

Si la capability no existe, se genera texto plano equivalente.

## Regla contra “actualiza WhatsApp”

1. No usar payloads experimentales directamente desde comandos compartidos.
2. Mantener una única implementación de mensajes interactivos en el adapter WhatsApp.
3. Preferir token corto en callbacks.
4. Evitar mezclar tipos de CTA incompatibles en la misma tarjeta.
5. Proveer fallback textual.
6. Mantener smoke test que recorra el registro completo buscando APIs prohibidas/legadas.
7. Añadir E2E en al menos Android estable y WhatsApp Web/Desktop cuando sea posible.

## Router y comandos

El router debe recibir `CommandContext` neutral:

```ts
interface CommandContext {
  platform: PlatformId
  message: NormalizedMessage
  adapter: PlatformAdapter
  locale: LocaleCode
  prefix: string
  args: string[]
  argText: string
  permissions: PermissionSnapshot
}
```

Los comandos se clasifican:

- `shared`: funcionan igual en todas las plataformas;
- `capability-gated`: requieren edición, botones, grupos, etc.;
- `platform-specific`: comportamiento exclusivo justificado;
- `runtime-only`: administración local del proceso.

El menú debe ocultar comandos que el adapter activo no puede cumplir.

## Identidades y persistencia

Nunca mezclar IDs externos directamente como claves globales.

Clave recomendada:

```text
<platform>:<botInstanceId>:<entityType>:<externalId>
```

Ejemplos:

```text
whatsapp:main:user:521...
telegram:main:user:12345678
discord:main:user:987654...
```

Economía global entre plataformas solo debe activarse mediante una **cuenta Nexora enlazada explícitamente**, no suponiendo que números, usernames o IDs representan a la misma persona.

## Subbots

El aislamiento actual por instancia debe extenderse a:

- config;
- session/auth;
- cooldowns;
- feature flags;
- welcome/moderation settings;
- metrics;
- caches;
- platform credentials.

Modelo:

```text
DATA_DIR/
  instances/
    whatsapp/main/
    whatsapp/subbot-<id>/
    telegram/main/
    discord/main/
```

## i18n

El código actual soporta `es` y `en`. V2 debe mover todo texto user-facing a catálogos comunes.

Resolución sugerida:

```text
user override > chat override > bot default > es
```

La plataforma no debe alterar el idioma salvo que no exista override y se decida usar locale del usuario como sugerencia inicial.

CI debe comprobar:

- mismas claves en `es` y `en`;
- cero claves vacías;
- cero strings user-facing nuevas fuera de allowlist;
- interpolaciones equivalentes.

## Descargas

Separar:

```text
command → DownloadOrchestrator → Provider[] → DownloadResult → adapter delivery
```

`DownloadProvider`:

```ts
interface DownloadProvider {
  id: string
  supports(input: URL): boolean
  resolve(input: URL, options: DownloadOptions): Promise<DownloadResult>
  health?(): Promise<ProviderHealth>
}
```

Para X, VK, TikTok, redes adultas y stores APK:

- timeout;
- retries limitados;
- fallback explícito;
- máximo de tamaño;
- limpieza temporal;
- error público genérico;
- error interno estructurado;
- métricas de éxito/fallo/latencia.

## Control API para aplicaciones oficiales

Las GUIs no deben manipular archivos internos directamente. Deben consumir una API local autenticada.

Endpoints mínimos:

```text
GET  /health
GET  /v2/status
GET  /v2/metrics
GET  /v2/logs?cursor=
POST /v2/runtime/start
POST /v2/runtime/stop
POST /v2/runtime/restart
POST /v2/runtime/update
POST /v2/pair/start
GET  /v2/pair/status
GET  /v2/config
PATCH /v2/config
GET  /v2/platforms
POST /v2/platforms/:id/connect
POST /v2/platforms/:id/disconnect
```

Seguridad local:

- bind a `127.0.0.1` por defecto;
- token aleatorio de instalación;
- secretos redactados en respuestas;
- CSRF/origin check si se expone a navegador;
- no aceptar shell arbitrario desde la UI.

## Windows y Kali

Usar un único `apps/desktop` con Tauri 2:

```text
React UI
  ↓ invoke / local HTTP
Rust/Tauri manager
  ↓
Ghost Nexora runtime + updater + logs
```

Windows distribuye NSIS `.exe`; Linux/Kali distribuye `.deb` y AppImage.

## Android

Hay dos objetivos diferentes:

### Modo remoto — obligatorio para V2 estable

La app administra un Ghost Nexora Bot que corre en VPS/PC mediante API autenticada. Es el camino más estable y permite publicar una app oficial sin depender de Termux.

### Modo on-device — requisito para afirmar “bot 24/7 en Android sin Termux”

Debe empaquetar/hostear el runtime dentro de la app o mediante un componente nativo mantenido. No debe publicitarse como terminado hasta probar:

- `arm64-v8a`;
- servicio foreground;
- reconexión tras Doze/red;
- persistencia privada;
- actualización del bundle;
- límites de batería;
- Android 13–16;
- WhatsApp/Baileys estable durante soak.

No se debe ocultar Termux detrás de una UI y llamarlo app nativa.

## Observabilidad

Cada plataforma publica métricas comunes:

```text
connection_state
messages_received_total
messages_sent_total
commands_total{command,status}
downloads_total{provider,status}
subbots_active
queue_depth
process_uptime
memory_rss_bytes
```

Los clientes desktop/Android pueden mostrar estas métricas sin acceso al log completo.

## Migración sin romper V1

1. crear contratos;
2. crear `WhatsAppAdapter` envolviendo comportamiento existente;
3. migrar `interactive.ts`, edición, typing y media;
4. migrar router;
5. migrar comandos por lotes;
6. impedir imports Baileys nuevos en comandos compartidos mediante lint/smoke;
7. añadir Telegram;
8. añadir Discord;
9. solo entonces retirar compat shims.

## Criterio de éxito

Un comando marcado `shared` debe poder ejecutarse en un test harness con adapter falso sin importar ninguna librería de WhatsApp, Telegram o Discord. Ese será el indicador técnico principal de que Ghost Nexora Bot realmente es multiplataforma.
