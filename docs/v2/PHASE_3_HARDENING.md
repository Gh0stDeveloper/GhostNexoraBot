# V2 · Fase 3 — Hardening y criterio de cierre

Este documento complementa `docs/v2/PHASE_3.md` y fija el comportamiento de producción que debe conservarse al iniciar la Fase 4.

## Estado de seguridad del transporte

La capa de providers usa sesiones HTTP efímeras y no persiste cookies, firmas ni nonces de descarga.

Controles obligatorios:

- allowlist de host antes de cada petición;
- redirects HTML manuales y limitados;
- captura de `Set-Cookie` en cada salto permitido;
- `Referer`, `Cookie`, `User-Agent` y navegación coherentes dentro de una misma sesión;
- redirects binarios manuales y limitados;
- eliminación de `Cookie` cuando el redirect binario cambia de hostname;
- límite streaming por `MAX_DOWNLOAD_MB`;
- rechazo de HTML/JSON cuando se espera un paquete Android;
- ZIP magic `PK` antes de aceptar APK/XAPK/APKS;
- cleanup de temporales;
- no registrar cookies, bearer tokens ni URLs firmadas completas.

## APKMirror

El flujo conserva la sesión desde `.apkmirror <búsqueda>` hasta `.apkmirrordl <token>` durante el TTL del token.

La resolución sigue:

```text
búsqueda
  -> release actual
  -> variante APK
  -> espera publicada por APKMirror
  -> /download/?key=<nonce>
  -> download.php?id=<id>&key=<firma>
  -> binario
```

No se fija ningún `id`, `key`, nonce o URL firmada.

Para reducir bloqueos por tráfico automatizado, el trabajo de APKMirror está serializado mediante un lease interproceso compartido entre MainBot y subbots. El lease incluye heartbeat, recuperación de locks huérfanos y verificación de ownership al liberar.

## APKPure

El provider admite los dominios web `apkpure.net` y `apkpure.com` y solo acepta como destinos binarios las familias conocidas usadas por el flujo actual:

```text
d.apkpure.net
d.apkpure.com
data.winudf.com
dl.winudf.com
d-<n>.winudf.com
```

No existe una wildcard abierta para hosts arbitrarios.

El paquete sigue validándose por tamaño, MIME/contenido y ZIP magic después del último redirect.

## Pruebas deterministas obligatorias

`npm run v2:providers` debe pasar siempre. Incluye:

- parsers X/VK;
- parsers APKMirror/APKPure;
- firmas y countdown APKMirror;
- redirects HTML/binaros allowlisted;
- cookies entre redirects;
- límite de redirects;
- rechazo de redirects fuera de allowlist;
- validación ZIP;
- lease concurrente APKMirror;
- recuperación de stale lock;
- resolución del directorio global del lease para subbots;
- telemetría y catálogo;
- registro compartido MainBot/Termux Lite.

Un fallo en estas pruebas nunca puede convertirse en `PASS` por una excepción de red externa.

## Live audit

El audit estricto continúa disponible:

```bash
node scripts/v2-phase3-live-provider-audit.mjs \
  --output=artifacts/v2-phase3-live-provider-audit.json
```

En modo estricto, cualquier required check fallido devuelve código distinto de cero.

GitHub-hosted runners pueden ser bloqueados por Cloudflare aunque los contratos y parsers sean correctos. Para CI existe un wrapper explícito:

```bash
node scripts/v2-phase3-live-provider-gate.mjs \
  --allow-known-antibot-blocks \
  --output=artifacts/v2-phase3-live-provider-audit.json \
  --gate-output=artifacts/v2-phase3-live-provider-gate.json
```

La excepción solo acepta un required failure cuando se cumplen simultáneamente estas condiciones:

1. el check pertenece a APKMirror o APKPure;
2. el error contiene HTTP 403;
3. el propio transporte identificó `protección anti-bot activa`;
4. no existe ningún fallo estructural adicional.

Siguen siendo bloqueantes, entre otros:

- host de redirect no permitido;
- parser sin resultados cuando la página fue servida normalmente;
- firma sin `id/key`;
- CDN inesperado;
- URL mal formada;
- profundidad de redirects excedida;
- HTTP binario no válido;
- MIME/contenido HTML inesperado;
- falta de ZIP magic;
- regresión de comandos;
- fallo de Termux Lite;
- fallo de Fases 0, 1 o 2.

El artifact `v2-phase3-live-provider-audit` contiene tanto el reporte bruto como la clasificación del gate. Un `PASS WITH EXTERNAL BLOCKS` no afirma que el sitio externo haya permitido la descarga desde la IP del runner; afirma que el único impedimento observado fue el challenge anti-bot explícito y que no apareció una regresión estructural del bot.

## Criterio de cierre de Fase 3

Fase 3 puede cerrarse cuando el mismo HEAD cumple:

- CI principal: PASS;
- Fase 0: PASS;
- Fase 1: PASS;
- Fase 2: PASS;
- Fase 3 deterministic providers: PASS;
- Termux Lite: PASS;
- fingerprint V1 con solo las seis adiciones aprobadas: PASS;
- live gate: `PASS` o `PASS WITH EXTERNAL BLOCKS` bajo la clasificación estricta descrita arriba;
- V23 `.edit` ValleyBot/ValleyInvisible: PASS.

No se debe iniciar Fase 4 desde un HEAD que tenga un fallo estructural clasificado como required.
