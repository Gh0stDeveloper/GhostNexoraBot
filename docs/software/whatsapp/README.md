# Ghost Nexora — WhatsApp

## Estado actual

**Plataforma principal y más madura.** Se usa Baileys 7.0.0-rc14 con pairing code/QR, reconexión, sesión persistente, MainBot, subbots, moderación, juegos, economía, descargas, edición de mensajes e interfaces interactivas.

V2 debe conservar compatibilidad mientras extrae WhatsApp detrás de `PlatformAdapter`.

## Objetivo

WhatsApp debe convertirse en el primer adapter de referencia, no en el modelo interno universal.

```text
Baileys events
   ↓
WhatsAppAdapter.normalize()
   ↓
NormalizedMessage
   ↓
Shared Router/Core
   ↓
NormalizedUi
   ↓
WhatsAppAdapter.render()
```

## Funciones obligatorias

- conexión Multi-Device;
- QR + pairing code;
- reconexión controlada;
- typing/presence;
- reply/quote;
- edición de mensajes cuando WhatsApp lo permita;
- reacciones;
- media y documentos;
- grupos y permisos;
- botones/listas/carrusel con fallback;
- subbots aislados;
- health/metrics.

## Compatibilidad “actualiza WhatsApp”

V15 ya estableció un patrón correcto para varias descargas: selección previa, tokens cortos y un solo CTA compatible. V2 debe aplicar el patrón a **todo** el proyecto.

Reglas:

1. centralizar generación de interactivos;
2. prohibir payloads ad-hoc desde comandos compartidos;
3. feature/capability detection;
4. fallback a texto si el payload no está validado;
5. un token corto como callback en lugar de URL larga;
6. pruebas de regresión que escaneen comandos;
7. no mostrar al usuario errores internos de protobuf/Baileys.

## Edición de mensajes

La edición integrada en V23 debe exponerse como capability:

```ts
capabilities.editMessage = true
adapter.editMessage(chatId, messageId, newText)
```

Los comandos no deben depender de estructuras crudas de Baileys para editar. Los fallbacks de compatibilidad permanecen dentro del adapter.

## Sesiones

Ruta de sesión por instancia:

```text
DATA_DIR/instances/whatsapp/main/session/
DATA_DIR/instances/whatsapp/subbot-<id>/session/
```

Migración desde rutas antiguas debe ser automática, reversible y con backup previo.

## Subbots

Cada subbot debe aislar:

- auth/session;
- settings;
- cooldowns;
- flags;
- métricas;
- welcome/antilink/moderación;
- caches;
- runtime profile.

LLM local permanece deshabilitado en subbots salvo cambio explícito de arquitectura y recursos.

## Descargas

Estado relevante de V2:

- X/Twitter: existe; endurecer y probar;
- VK: falta;
- XVideos/XNXX/Pornhub: existentes en V15;
- APK: varias fuentes actuales; APKMirror/APKPure faltan;
- UI: mantener selección compatible por token.

La plataforma WhatsApp solo entrega el resultado; el extractor debe vivir en providers neutrales.

## Tests

```text
whatsapp-adapter-contract
whatsapp-session-reconnect
whatsapp-interactive-compat
whatsapp-edit-parity
whatsapp-subbot-isolation
whatsapp-download-delivery
whatsapp-group-permissions
whatsapp-soak
```

## Matriz de aceptación

Probar al menos:

- Android WhatsApp estable actual;
- WhatsApp Web;
- WhatsApp Desktop cuando sea viable;
- cuenta PN y escenarios LID;
- chat privado;
- grupo admin/no-admin;
- MainBot;
- subbot;
- recuperación después de pérdida de red.

## Definition of Done V2

- toda interacción sale por `WhatsAppAdapter`;
- ningún comando `shared` importa Baileys;
- cero rutas conocidas con payloads incompatibles;
- sesiones y subbots sobreviven actualización;
- reconexión y pairing tienen pruebas;
- errores internos no se exponen al chat;
- soak test de producción superado.

Ver [arquitectura](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
