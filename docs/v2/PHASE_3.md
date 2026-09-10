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
- telemetría común de providers;
- verificación live de endpoints y cadenas firmadas;
- regresión estricta del registro V1 alrededor de las nuevas funciones.

## Regla de diseño

Los endpoints documentados se pueden fijar en código. Los tokens, IDs temporales, nonces y URLs CDN firmadas **nunca** se fijan.

```text
endpoint estable/documentado   -> código
query actual                    -> generado
nonce/key firmado               -> extraído del HTML actual
CDN URL firmada                 -> extraída del HTML actual
token OAuth/Bearer              -> secreto opcional del operador
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

Los nuevos recordings del tipo:

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
  -> download/?key=<nonce actual>
  -> /wp-content/themes/APKMirror/download.php?id=<id>&key=<firma actual>
  -> redirect binario
```

El `id` y el `key` se extraen del DOM de la sesión actual. No existe un ID/nonce hardcodeado en el provider.

Antes de guardar el archivo se comprueba:

- dominio permitido;
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

El bot no construye una URL CDN por patrón. Lee el `href` vigente de la página `/download` en cada operación.

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

El usuario no necesita copiar URLs firmadas y el bot no persiste firmas de corta duración.

## Transporte HTTP seguro

`apps/bot/src/services/download-providers/http.ts` centraliza:

- allowlist de hosts por provider;
- redirects controlados;
- timeout;
- User-Agent;
- límite streaming por `MAX_DOWNLOAD_MB`;
- directorios temporales;
- cleanup;
- rechazo de HTML/JSON cuando se espera binario;
- ZIP magic para paquetes Android.

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

La telemetría no almacena bearer tokens ni URLs firmadas completas.

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

`scripts/v2-phase3-provider-smoke.mjs` cubre:

- parser de ID de X;
- parser owner/video de VK;
- prioridad de calidades VK;
- query actual de APKMirror;
- parser release -> variant -> download/?key -> download.php?id&key;
- rechazo de firma APKMirror incompleta;
- query Online APK Downloader de APKPure;
- extracción del `d.apkpure.net` actual;
- telemetría;
- catálogo 21;
- registro único de comandos;
- preservación de metadata `.twitter`;
- herencia automática en Termux Lite;
- ausencia de firmas CDN hardcodeadas.

## Live contract audit

`scripts/v2-phase3-live-provider-audit.mjs` comprueba la web real en CI.

Gates requeridos:

1. X API v2 reconoce `/2/tweets/{id}`;
2. VK reconoce `video.get` con `v=5.199`;
3. búsqueda real APKMirror produce releases;
4. APKMirror resuelve una firma dinámica y los primeros bytes del APK son `PK`;
5. APKPure Online APK Downloader devuelve el package esperado;
6. APKPure resuelve `d.apkpure.net` y el binario comienza por `PK`.

Además se realizan probes informativos de los extractores públicos X/VK de la versión actual de `yt-dlp`. Un cambio temporal en esos extractores queda visible en el artifact sin convertir un fallo externo/auth específico en una falsa regresión de los endpoints oficiales.

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

`yt-dlp` ya forma parte de la instalación Lite, por lo que X y VK conservan fallback en Android/Termux.

## Gate de Fase 3

La fase queda cerrada cuando:

- typecheck completo pasa;
- build completo pasa;
- Fase 0 pasa;
- Fase 1 pasa;
- Fase 2 pasa;
- smoke Phase 3 pasa;
- live provider audit pasa;
- Termux Lite pasa;
- fingerprint V1 filtrando solo las seis adiciones aprobadas es idéntico;
- CI principal completo pasa;
- V23 `.edit` continúa pasando.

## Siguiente fase

Fase 4 implementará Telegram como plataforma real sobre `PlatformAdapter`, reutilizando Core y la capa de providers sin convertir Telegram en un puente de WhatsApp.
