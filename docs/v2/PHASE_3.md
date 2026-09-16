# V2 · Fase 3 — Providers de descarga verificados

> Rama: `feat/v2-phase-3-download-providers`  
> Base: `feat/v2-phase-2-ui-compat@a514cef1baf234e4217f21de18c955a4d77daf05`

## Objetivo

Cumplir la parte de providers prometida para V2 sin inventar endpoints ni depender de URLs firmadas permanentes. Los métodos de esta fase se comprobaron contra las páginas/documentación vigentes en septiembre de 2026 y se respaldan con un audit live ejecutable en CI.

Fase 3 añade:

- hardening de X/Twitter;
- VK / VK Video;
- APKMirror;
- APKPure;
- transporte HTTP stateful y acotado para cadenas firmadas;
- serialización interproceso de APKMirror;
- telemetría común de providers;
- verificación live de endpoints y cadenas firmadas;
- regresión estricta del registro V1 alrededor de las nuevas funciones.

## Regla de diseño

Los endpoints documentados se pueden fijar en código. Los tokens, IDs temporales, nonces, cookies y URLs CDN firmadas **nunca** se fijan ni se persisten.

```text
endpoint estable/documentado   -> código
query actual                    -> generado
nonce/key firmado               -> extraído del HTML actual
CDN URL firmada                 -> extraída del HTML actual
cookie de sesión                -> memoria, TTL del resultado
OAuth/Bearer                    -> secreto opcional del operador
```

## X / Twitter

### Método oficial actual

```http
GET https://api.x.com/2/tweets/{id}
Authorization: Bearer <X_BEARER_TOKEN>
```

Query usada:

```text
expansions=attachments.media_keys
media.fields=duration_ms,height,media_key,preview_image_url,type,url,variants,width
```

El resolver une `data.attachments.media_keys` con `includes.media`. Para video/animated GIF elige la variante `video/mp4` con mayor `bit_rate`; para foto utiliza el `url` de media.

### Fallback

Si no existe `X_BEARER_TOKEN`, el plan de X no permite el Post o la API oficial falla, se utiliza el `yt-dlp` instalado por Ghost Nexora Bot para contenido público.

El comando efectivo sigue siendo:

```text
.twitter <url>
.x <url>
.tweet <url>
```

Sus nombres, aliases, categoría y descripción V1 no se modificaron.

## VK / VK Video

### Método oficial actual

El schema oficial VK utilizado por la fase es **5.199**.

```http
GET https://api.vk.com/method/video.get
```

Parámetros:

```text
videos=<owner_id>_<video_id>
access_token=<VK_ACCESS_TOKEN>
v=5.199
```

Se inspecciona `response.items[0].files` y se escoge la variante `mp4_N` con mayor resolución disponible.

El parser admite URLs públicas con identificador clásico, entre ellas:

```text
https://vk.com/video-<owner>_<id>
https://vkvideo.ru/video-<owner>_<id>
```

Los recordings del tipo:

```text
https://live.vkvideo.ru/<canal>/record/<uuid>
```

no contienen directamente `owner_id_video_id`; por ello pasan al fallback `yt-dlp`.

Comandos:

```text
.vk <url>
.vkvideo <url>
.vkd <url>
```

`VK_ACCESS_TOKEN` es opcional.

## APKMirror

### Búsqueda actual

La búsqueda se construye sobre la propia web de APKMirror:

```text
https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=<query>
```

No se usa una API de terceros.

### Cadena real de descarga

```text
search result
  -> /apk/<developer>/<app>/<release>-release/
  -> <variant>-android-apk-download/
  -> espera publicada por la variante cuando exista
  -> download/?...&key=<nonce actual>
  -> /wp-content/themes/APKMirror/download.php?id=<id>&key=<firma actual>
  -> redirect(s) binario(s) validados
  -> APK
```

El `id` y el `key` se extraen del DOM de la sesión actual. No existe un ID/nonce hardcodeado en el provider.

### Countdown real

Durante el hardening del 10 de septiembre de 2026, las variantes actuales de APKMirror mostraron el mensaje de espera de **15 segundos** antes de habilitar el siguiente salto. El provider no fija 15 segundos como contrato: detecta el contador publicado por el HTML y espera ese valor más un pequeño margen antes de consumir el `key`.

Si APKMirror cambia el contador, el parser utiliza el nuevo valor observado. Si no existe contador, no se añade una espera artificial.

### Sesión continua búsqueda -> descarga

Cada búsqueda crea una `ProviderHttpSession` efímera. El token `am_<hash>` conserva referencia a esa sesión en memoria durante el mismo TTL del resultado (30 minutos):

```text
.apkmirror query
     |
     +-- cookies/UA de esa navegación
     +-- item token am_...
              |
              v
.apkmirrordl am_...
     |
     +-- misma sesión en el primer intento
     +-- release -> variant -> wait -> signed link
```

Un `403/429` recuperable genera un segundo intento con **sesión y firma nuevas**. No se reusa un `key` que pudo quedar consumido o bloqueado.

### Serialización anti-rate-limit

APKMirror documenta bloqueos temporales de Cloudflare cuando se realizan descargas simultáneas/multichunk o muchas descargas en poco tiempo. Ghost Nexora Bot descarga en un único stream y añade un lease interproceso para `apkmirrordl`.

El lease:

- cubre resolución firmada + descarga completa;
- serializa MainBot y subbots que comparten IP;
- usa `NEXORA_GLOBAL_CONTROL_DB` para localizar el directorio global desde procesos subbot;
- mantiene heartbeat durante descargas largas;
- recupera locks huérfanos;
- verifica ownership antes de eliminar el lock;
- aplica un pequeño cooldown antes de liberar;
- no comparte sesiones, chats ni configuración de usuarios.

Antes de guardar el archivo se comprueba:

- dominio permitido en todos los redirects;
- límite de bytes;
- que la respuesta no sea HTML/JSON;
- ZIP magic `PK` de APK.

Comandos:

```text
.apkmirror <aplicación>
.apkmirrordl <token>
```

Aliases: `.apkm`, `.amirror`, `.amdl`.

## APKPure

### Lookup actual

Se utiliza el Online APK Downloader de APKPure:

```text
https://apkpure.net/es/apk-downloader?p=<nombre-o-package>
```

El propio flujo de APKPure puede devolver resultados o redirigir a la ficha cuando el package es exacto.

### Cadena real de descarga

```text
Online APK Downloader / ficha
  -> https://apkpure.net/.../<package>
  -> /download
  -> href firmado https://d.apkpure.net/...apk|xapk|apks?<firma actual>
  -> archivo binario
```

El bot no construye una URL CDN por patrón. Lee el `href` vigente de la página `/download` en cada operación. La sesión del lookup también se conserva en el token durante su TTL.

Se conserva el formato real devuelto: APK, XAPK o APKS.

Comandos:

```text
.apkpure <aplicación|package>
.apkpuredl <token>
```

Aliases: `.apkp`, `.pureapk`, `.apdl`.

## Tokens de selección

Los resultados APKMirror/APKPure se convierten en tokens opacos de proceso:

```text
am_<sha256-prefix>
ap_<sha256-prefix>
```

TTL: 30 minutos.

El usuario no necesita copiar URLs firmadas. El token conserva la ficha y la sesión efímera de navegación, **no** la URL final firmada: la firma se resuelve al pulsar Descargar.

## Transporte HTTP seguro

`apps/bot/src/services/download-providers/http.ts` centraliza:

- allowlist de hosts por provider;
- cookies efímeras con reglas `Domain`, `Path`, `Secure` y expiración;
- rechazo de `Domain` de cookie que no corresponda al host emisor;
- `User-Agent`, `Accept-Language`, `Referer` y headers de navegación consistentes;
- redirects HTML manuales, máximo 8;
- validación del host de **cada** `Location` antes de seguirlo;
- captura de `Set-Cookie` en cada salto 3xx;
- redirects binarios manuales, máximo 8;
- eliminación de `Cookie` si el binario cambia de hostname;
- timeout;
- límite streaming por `MAX_DOWNLOAD_MB`;
- directorios temporales y cleanup;
- rechazo de HTML/JSON cuando se espera binario;
- ZIP magic para paquetes Android.

Las cookies nunca se escriben a disco ni aparecen en `.providerhealth` o en el artifact live.

## Telemetría

`apps/bot/src/services/download-providers/runtime.ts` registra por proceso:

- attempts;
- successes;
- failures;
- última latencia;
- último éxito;
- último fallo;
- último error resumido.

Consulta owner/staff:

```text
.providerhealth
.dlhealth
```

La telemetría no almacena bearer tokens, cookies ni URLs firmadas completas.

## Catálogo de providers

La Fase 0 conserva su baseline histórico de 18 providers. Fase 3 añade un catálogo separado:

```text
docs/v2/baselines/providers-v2-phase3.json
```

Total V2 Phase 3: **21 providers**.

Nuevos:

- `vk`;
- `apkmirror`;
- `apkpure`.

`twitter` ya existía y pasa a estado `hardened`.

## Compatibilidad del registro

Fase 3 agrega únicamente seis comandos canónicos:

```text
vk
apkmirror
apkmirrordl
apkpure
apkpuredl
providerhealth
```

`scripts/v2-phase3-command-regression.mjs` elimina únicamente esos seis del inventario actual y exige que todo lo restante produzca exactamente el fingerprint congelado pre-V2.

De este modo la fase puede crecer sin debilitar la garantía de compatibilidad V1.

## Pruebas estáticas

### `v2-phase3-provider-smoke.mjs`

Cubre:

- parser de ID de X;
- parser owner/video de VK;
- prioridad de calidades VK;
- query actual de APKMirror;
- parser release -> variant -> download/?key -> download.php?id&key;
- countdown APKMirror;
- rechazo de firma APKMirror incompleta;
- query Online APK Downloader de APKPure;
- extracción del `d.apkpure.net` actual;
- cookie jar con `Path`;
- telemetría;
- catálogo 21;
- registro único de comandos;
- preservación de metadata `.twitter`;
- herencia automática en Termux Lite;
- ausencia de firmas CDN hardcodeadas.

### `v2-phase3-provider-http-smoke.mjs`

Servidor HTTP local determinista que comprueba:

- cookie recibida en el primer 302 se envía al segundo salto;
- cookie recibida en el segundo salto se aplica respetando `Path`;
- redirect HTML hacia un host fuera de allowlist se bloquea antes de seguirlo;
- más de 8 redirects se rechazan;
- redirects del binario también se validan;
- un binario permitido conserva ZIP magic.

### `v2-phase3-provider-lease-smoke.mjs`

Comprueba:

- dos trabajos APKMirror concurrentes nunca ejecutan simultáneamente (`maxActive=1`);
- recuperación de un lock huérfano;
- resolución del directorio global desde `NEXORA_GLOBAL_CONTROL_DB` en contexto subbot.

## Live contract audit

`scripts/v2-phase3-live-provider-audit.mjs` comprueba la web real en CI.

Gates requeridos:

1. X API v2 reconoce `/2/tweets/{id}`;
2. VK reconoce `video.get` con `v=5.199`;
3. búsqueda real APKMirror produce releases actuales;
4. el mismo ciclo toma un resultado **descubierto en vivo**, resuelve una firma dinámica y los primeros bytes del APK son `PK`;
5. APKPure Online APK Downloader devuelve el package esperado;
6. APKPure resuelve `d.apkpure.net` y el binario comienza por `PK`.

El audit ya no fija una variante APKMirror histórica. Esto evita confundir una release retirada/bloqueada con una regresión del parser actual.

Además se realizan probes informativos de los extractores públicos X/VK de la versión actual de `yt-dlp`. Un cambio temporal en esos extractores queda visible en el artifact sin convertir un fallo externo/auth específico en una falsa regresión de los endpoints oficiales.

El artifact no contiene cookies, bearer tokens ni valores `key` firmados.

Artifact esperado:

```text
v2-phase3-live-provider-audit
```

## Credenciales opcionales

`.env.example` incorpora:

```env
X_BEARER_TOKEN=
VK_ACCESS_TOKEN=
```

No son necesarias para mantener los fallbacks públicos, pero habilitan el resolver oficial preferente.

## Termux Lite

Los nuevos comandos se añaden al mismo `downloadProgressV2Commands` que consumen MainBot y Termux Lite. No existe un registro paralelo de providers V3.

`yt-dlp` ya forma parte de la instalación Lite, por lo que X y VK conservan fallback en Android/Termux. El lease APKMirror usa únicamente primitivas Node (`fs`, `crypto`, timers), por lo que también es compatible con Termux.

## Gate de Fase 3

La fase queda cerrada cuando:

- typecheck completo pasa;
- build completo pasa;
- Fase 0 pasa;
- Fase 1 pasa;
- Fase 2 pasa;
- smokes Phase 3 (provider, HTTP, lease) pasan;
- live provider audit pasa;
- Termux Lite pasa;
- fingerprint V1 filtrando solo las seis adiciones aprobadas es idéntico;
- CI principal completo pasa;
- V23 `.edit` continúa pasando.

## Siguiente fase

Fase 4 implementará Telegram como plataforma real sobre `PlatformAdapter`, reutilizando Core y la capa de providers sin convertir Telegram en un puente de WhatsApp.
