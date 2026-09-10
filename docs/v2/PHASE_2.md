# V2 · Fase 2 — Compatibilidad de UI de WhatsApp

> Rama: `feat/v2-phase-2-ui-compat`  
> Base: `feat/v2-phase-1-whatsapp-adapter@f496218a54c4140c6b1d164e4339c07ceead5770`

## Objetivo

Cerrar la deuda de compatibilidad visual que podía terminar en el placeholder del cliente **“necesitas actualizar WhatsApp para poder ver este mensaje”** aun cuando el servidor de WhatsApp hubiese aceptado el relay.

La Fase 2 no intenta detectar la versión exacta del cliente receptor. Ese dato no está disponible de forma fiable para decidir el render antes de enviar. En su lugar elimina del camino estable las primitivas conocidas como frágiles, conserva las acciones en fallbacks seguros y centraliza los sobres propietarios que sí son necesarios.

## Principio de compatibilidad

Un relay exitoso solo confirma que WhatsApp aceptó el mensaje. No confirma que todas las versiones del cliente sean capaces de dibujar el payload.

Por eso el orden estable es:

```text
NormalizedUi / caller V1
          |
          v
WhatsApp UI compatibility planner
          |
          +-- mensaje estándar
          +-- Native Flow conservador
          +-- single_select
          `-- texto accionable
```

Ningún caller debe depender de un error de `relayMessage()` para saber si un payload será visible en el dispositivo.

## Política estable

Archivo:

```text
apps/bot/src/platform/whatsapp/ui-compat.ts
```

La política queda congelada inicialmente así:

```text
nativeCarousel            false
maxCards                   8
maxNativeButtons           3
maxButtonsPerCarouselCard  2
maxSelectSections          8
maxRowsPerSection          10
```

### Tarjetas

| Entrada | Transporte estable |
|---|---|
| Sin acciones | mensaje estándar de texto/imagen |
| Reply/URL soportados | Native Flow |
| Un único `single_select` | Native Flow |
| `single_select` mezclado con otros botones | texto accionable |

El fallback textual conserva el label y el comando/URL de cada acción. Ya no se envía un fallback que muestre únicamente título y cuerpo dejando al usuario sin forma de continuar el flujo.

### Carruseles

`carouselMessage` queda retirado del camino estable.

| Contenido del carrusel V1 | Transporte V2 |
|---|---|
| Cards con acciones `reply` | una tarjeta `single_select` con secciones |
| Cards con URLs | texto accionable con URLs clicables |
| Cards con selects anidados | texto accionable |
| Cards sin acciones | texto informativo |

Esto se implementa dentro de `sendCarousel()`, por lo que todos los comandos V1 que todavía importan el shim histórico reciben el fix sin una reescritura masiva.

El contrato abstracto `NormalizedUi.carousel` continúa siendo válido: WhatsApp puede representar semánticamente ese contenido aunque el adapter use una presentación select-first en vez de un carrusel nativo.

## Frontera interactiva

La implementación estable continúa en:

```text
apps/bot/src/platform/whatsapp/interactive.ts
```

Responsabilidades:

- localización;
- precarga de imágenes;
- `quick_reply`;
- `cta_url`;
- `single_select`;
- relay nodes;
- selección del plan de compatibilidad;
- mensajes estándar para cards sin acciones;
- fallback accionable;
- conversión de carrusel V1 a select-first.

`services/interactive.ts` sigue siendo únicamente un shim de compatibilidad.

## `.view` y juegos HTML

Antes de Fase 2 existían dos implementaciones manuales del sobre `botForwardedMessage/richResponseMessage`:

- `.view` / navegador;
- juegos mediante `sendAiHtmlMessage()`.

Aunque se intentaba mantenerlas equivalentes, podían volver a divergir con un cambio futuro.

Ahora ambas rutas usan:

```text
apps/bot/src/platform/whatsapp/rich-response.ts
```

El helper común fija:

- `messageContextInfo`;
- `deviceListMetadataVersion`;
- `messageSecret`;
- `botMetadata.botResponseId`;
- forwarded AI context;
- `generateWAMessageFromContent`;
- `messageId` del relay;
- timeout;
- logging del transporte.

Por tanto:

```text
.view
  |
  +-----------------------------+
                                v
                   relayWhatsAppRichResponse
                                ^
  +-----------------------------+
  |
Mario / Dino / Snake / Doom / Arcade / juegos HTML
```

Los juegos mantienen además `protectGameHtmlInput()` para long-press, selección, drag y gestos táctiles.

## Auditor de frontera

Nuevo script:

```text
scripts/v2-ui-compat-audit.mjs
```

Recorre todo `apps/bot/src/**/*.ts` y genera un inventario de rutas UI.

Falla si detecta:

- `carouselMessage` o `CarouselMessage`;
- `buttonsMessage`;
- `templateMessage`;
- `listMessage`;
- `generateWAMessageFromContent()` fuera de la allowlist revisada;
- `.relayMessage()` fuera de la frontera o de las PoC explícitamente permitidas.

### Generadores raw permitidos

Solo:

```text
platform/whatsapp/interactive.ts
platform/whatsapp/rich-response.ts
services/rich-code-message.ts
services/premium-stickers-v18.ts
```

Los dos últimos son primitivas WhatsApp-only y no se presentan como `NormalizedUi` compartible.

### Raw relays permitidos

Además de los transportes anteriores se conservan las rutas Valley/PoC acotadas:

```text
services/security-poc-scope.ts
commands/edit.ts
commands/valley-poc-v22.ts
commands/valley-compat-v21.ts
```

`.edit` ValleyBot/ValleyInvisible no se modifica ni se convierte en una primitive de UI general.

## Inventario UI

El audit clasifica por archivo:

- `ctx.adapter.sendUi()`;
- `sendInteractiveCard()`;
- `sendCarousel()`;
- `sendAiHtmlMessage()`;
- `sendRichAiCodeMessage()`;
- `sendRichLinkPreview()`;
- generación raw;
- relay raw.

El JSON resultante se publica como artifact de Actions para poder medir cómo disminuyen los callers heredados a medida que Telegram y Discord reutilicen `NormalizedUi`.

## Pruebas de compatibilidad

Nuevo smoke:

```text
scripts/v2-phase2-ui-smoke.mjs
```

Valida en runtime:

1. política `nativeCarousel=false`;
2. carrusel de comandos -> `single_select`;
3. carrusel con URL -> texto con URL preservada;
4. card sin acciones -> mensaje estándar;
5. select mezclado -> texto accionable;
6. payload emitido sin `carouselMessage`;
7. browser y juegos usando el mismo helper rich;
8. helper rich usando el `messageId` generado;
9. `.edit` Valley fuera de la nueva capa.

## CI

Workflow dedicado:

```text
.github/workflows/v2-phase2.yml
```

Ejecuta:

1. instalación;
2. typecheck de todos los workspaces;
3. build completo;
4. contratos de Fase 0;
5. adapter de Fase 1;
6. smoke y audit de Fase 2;
7. Termux Lite build + smoke;
8. inventario efectivo de comandos;
9. fingerprint exacto contra el baseline V1;
10. artifacts de UI e inventario.

El CI principal continúa siendo obligatorio.

## Compatibilidad con comandos existentes

No se cambian nombres, aliases, permisos ni resolución del registro.

Los callers actuales pueden seguir haciendo:

```ts
sendInteractiveCard(...)
sendCarousel(...)
```

pero ambos pasan por la política estable de Fase 2.

Los comandos nuevos destinados a ser multiplataforma deben preferir:

```ts
ctx.adapter.sendUi(...)
```

con `NormalizedUi`.

## Deuda deliberadamente pendiente

Fase 2 no convierte a formato neutral las siguientes primitivas propietarias:

- rich code de WhatsApp;
- stickers Lottie/premium;
- HTML Primitive;
- PoC Valley.

Se mantienen aisladas y auditadas porque Telegram y Discord necesitarán una representación distinta o un fallback propio.

Tampoco se afirma que un cliente de WhatsApp extremadamente antiguo vaya a soportar HTML Primitive o todos los Native Flow. Lo que sí garantiza esta fase es que el bot deja de emitir el carrusel nativo identificado como ruta frágil y que los fallbacks conservan la capacidad de completar la acción.

## Gate de Fase 2

La fase queda cerrada cuando:

- typecheck y build pasan;
- Fase 0 continúa verde;
- Fase 1 continúa verde;
- `v2:ui-compat` pasa;
- el audit reporta cero violaciones;
- Termux Lite continúa verde;
- fingerprint V1 no cambia;
- CI principal completo pasa;
- Valley V23 continúa pasando.

## Siguiente fase

Fase 3 se centrará en los providers prometidos para V2: hardening de X/Twitter, incorporación de VK, APKMirror/APKPure y normalización del motor de descargas con fallback/telemetría por provider.
