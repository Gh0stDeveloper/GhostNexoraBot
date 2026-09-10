# Ghost Nexora Bot V2.0 — plan de producción

> Estado del documento: auditoría técnica inicial de V2.0  
> Rama de documentación: `docs/v2-production-plan`  
> Base auditada: `main` en `f50f27a4438bb3bd7958e5d28956d3aed4b11997`  
> Fecha de auditoría: 2026-09-09 (America/Tijuana)

## Propósito

Este documento convierte el comunicado público de V2.0 en un plan técnico verificable. Cada promesa queda clasificada como **lista**, **parcial** o **pendiente** y recibe una definición de terminado. Ningún componente debe anunciarse como producción hasta cumplir sus criterios de aceptación y CI.

El lanzamiento anunciado para el 7 de septiembre de 2026 ya quedó atrás. El repositorio todavía declara `ghost-nexora-bot@1.1.0`; por tanto, V2.0 debe considerarse **en desarrollo** hasta completar este plan y cambiar la versión de manera deliberada.

## Estado real encontrado

| Promesa V2.0 | Estado | Evidencia actual | Falta para cerrar |
|---|---|---|---|
| WhatsApp estable | Parcial / avanzado | Baileys 7, pairing, subbots, CI, router y varios smoke tests | suite E2E real, soak test, matriz de clientes WhatsApp |
| Corregir “actualiza WhatsApp” | Parcial / avanzado | V15 usa tokens cortos y flujo select-first en descargas; existen pruebas de compatibilidad | migrar **todos** los mensajes interactivos al mismo contrato y probar fallback textual |
| X/Twitter | Parcial | comando y plataforma de descarga existen | pruebas reales, fallback y telemetría de proveedor |
| VK | Pendiente | no se encontró integración VK en `main` | proveedor, comando, pruebas y documentación |
| Adult downloads mejorados | Parcial / avanzado | V15 documenta XVideos/XNXX/Pornhub y selección compatible | health checks por proveedor, errores normalizados, pruebas de regresión |
| APKs múltiples | Parcial / avanzado | Uptodown, LiteAPKS, Aptoide, HappyMod, F-Droid, APK.Tools y AndroForever | APKMirror y APKPure, health checks, firma/hash cuando sea posible |
| Telegram oficial | Pendiente como plataforma | existe un `telegram-bridge-v7`, no un runtime Telegram equivalente | adaptador Telegram, entrada propia, comandos compartidos, CI y persistencia aislada |
| Discord oficial | Pendiente | no se encontró implementación Discord | adaptador Discord, gateway intents, comandos compartidos, CI |
| Multi-lenguaje | Parcial / funcional | infraestructura i18n y catálogos `es`/`en` | cobertura 100% de textos al usuario, panel web i18n y proceso para nuevos idiomas |
| Termux Lite | Implementado con alcance Lite | runtime `termux-lite`, `dist-termux`, instalador, updater y smoke test | pruebas reales en Android/Termux, métricas de memoria y compatibilidad por arquitectura |
| App Android oficial | Pendiente | no hay proyecto Android nativo | aplicación, runtime/control, firma, updater y CI Android |
| App Windows `.exe` | Parcial | instalador/gestor PowerShell nativo existente | frontend desktop, empaquetado `.exe`, firma y actualizador |
| App Kali Linux | Pendiente | no hay aplicación dedicada | cliente desktop Linux, `.deb`/AppImage, permisos y CI Kali/Debian |
| +60 funciones nuevas | No verificable todavía | el repositorio contiene un catálogo grande de comandos | congelar baseline V1, generar inventario automático y demostrar delta >= 60 |
| Salir de BETA | Pendiente | CI amplia, pero no existe gate formal de producción | release checklist, E2E, soak, seguridad, rollback, observabilidad y soporte |
| Código fuente público | Cumplido | repositorio público MIT | mantener notices/licencias de terceros y release reproducible |

## Arquitectura objetivo

V2 no debe mantener tres bots separados. Debe usar una sola lógica de negocio y adaptadores de transporte.

```text
                   +-----------------------+
                   |   Shared Command Core |
                   | router / permissions  |
                   | economy / games / AI  |
                   | downloads / i18n      |
                   +-----------+-----------+
                               |
                  NormalizedMessage / UI
                               |
          +--------------------+--------------------+
          |                    |                    |
+---------v---------+ +--------v---------+ +--------v---------+
| WhatsApp Adapter  | | Telegram Adapter | | Discord Adapter  |
| Baileys 7         | | Bot API / grammY | | discord.js       |
+-------------------+ +------------------+ +------------------+

          Runtime + Control API + persistence namespaced
                               |
        +----------------------+----------------------+
        |                      |                      |
+-------v-------+      +-------v-------+      +-------v-------+
| Android App   |      | Windows App   |      | Kali App      |
| manager       |      | desktop       |      | desktop       |
+---------------+      +---------------+      +---------------+
```

Ver: [`ARCHITECTURE_MULTIPLATFORM.md`](ARCHITECTURE_MULTIPLATFORM.md).

## Principios obligatorios de V2

1. **Core neutral de plataforma.** Ningún comando de negocio debe importar Baileys directamente salvo módulos explícitamente WhatsApp-only.
2. **Capabilities.** Cada adaptador declara qué soporta: edición, reacción, botones, carrusel, archivos, typing, moderación, etc.
3. **Fallback seguro.** Si una UI no existe en una plataforma, el usuario recibe texto/links válidos; nunca un payload no soportado.
4. **Persistencia namespaced.** Claves por `platform + botInstance + chat/user`; MainBot, subbots y plataformas no comparten estado accidentalmente.
5. **i18n primero.** Todo texto nuevo al usuario debe entrar por catálogo; español e inglés deben mantenerse completos.
6. **Errores normalizados.** Nada de stack traces o logs internos al usuario final. Logs completos solo en servidor/desktop manager.
7. **Descargadores por proveedor.** La lógica de extracción vive en servicios, no en comandos. Cada proveedor tiene timeout, health, fallback y pruebas.
8. **Mismo release train.** Core, web y clientes oficiales se versionan bajo V2 con compatibilidad declarada.

## Fases de ejecución

### Fase 0 — contrato y baseline

- congelar inventario actual de comandos y providers;
- añadir `packages/core`, `packages/platform-contracts` y `packages/runtime` sin romper `apps/bot`;
- introducir `NormalizedMessage`, `PlatformAdapter`, `PlatformCapabilities` y `NormalizedUi`;
- añadir pruebas de contrato;
- generar reporte automático de cobertura i18n y comandos.

**Gate:** `npm run build`, `typecheck` y todos los smokes actuales siguen verdes.

### Fase 1 — extraer WhatsApp al adaptador

- envolver Baileys en `WhatsAppAdapter`;
- mover `sendCarousel`, `sendInteractiveCard`, edit, typing, reactions y media al adaptador;
- dejar router/comandos consumiendo solo interfaces comunes;
- mantener compatibilidad total con MainBot y subbots.

**Gate:** sin regresiones en comandos existentes y sin imports directos de Baileys desde comandos compartidos.

### Fase 2 — compatibilidad UI completa

- reemplazar payloads interactivos legados por `NormalizedUi`;
- select-first/token-short como patrón canónico;
- fallback textual por capability;
- inventario automático de lugares que aún generan mensajes experimentales.

**Gate:** cero rutas conocidas capaces de producir el aviso “actualiza WhatsApp” en la matriz de pruebas soportada.

### Fase 3 — descargas del comunicado

- endurecer X/Twitter;
- implementar VK;
- añadir APKMirror y APKPure;
- mantener Uptodown y demás fuentes actuales;
- health checks y fallback por provider;
- normalizar mensaje de error público;
- pruebas de búsqueda, selección y descarga.

**Gate:** contract tests + fixtures + pruebas live opt-in para cada provider.

### Fase 4 — Telegram

- entrada `apps/telegram` o runtime por adapter;
- Bot API con polling/webhook configurable;
- mensajes normalizados;
- permisos de grupo y callbacks;
- descarga/media con límites propios de Telegram;
- persistencia aislada.

**Gate:** suite compartida de comandos + suite Telegram específica.

### Fase 5 — Discord

- `discord.js`;
- intents mínimos;
- mensajes, embeds, components y attachments traducidos desde `NormalizedUi`;
- roles/permisos mapeados a permisos Discord;
- slash commands opcionales sin eliminar prefijo textual.

**Gate:** suite compartida + pruebas de permisos y reconexión.

### Fase 6 — multi-lenguaje completo

- completar strings hard-coded restantes;
- internacionalizar Web;
- seleccionar idioma por bot/chat/usuario según política;
- mantener `es` como fallback;
- validador CI de claves faltantes/sobrantes.

**Gate:** 100% de rutas user-facing cubiertas por el auditor i18n para `es` y `en`.

### Fase 7 — aplicaciones oficiales

- Android: gestor nativo + modo remoto estable; on-device Lite sin Termux solo cuando el runtime embebido pase pruebas reales;
- Windows: app Tauri 2 que reutiliza el manager existente y genera `.exe`/NSIS;
- Kali: misma base Tauri 2, paquete `.deb` y AppImage;
- APIs locales autenticadas para start/stop/update/pair/logs/metrics.

**Gate:** artefactos firmados, actualización y rollback probados.

### Fase 8 — producción 2.0.0

- release candidate;
- soak >= 72 h en MainBot + subbot + Telegram + Discord;
- recuperación de red, restart, update y corrupción de sesión;
- auditoría de secretos y dependencias;
- changelog y migración;
- tag `v2.0.0` solo después de gates.

## Definición de “producción oficial”

V2.0 puede salir de BETA únicamente cuando:

- CI de Linux, Windows y Android esté verde;
- adapters WhatsApp, Telegram y Discord pasen contract tests;
- no haya estado compartido accidental entre plataformas/subbots;
- los instaladores sean idempotentes y preserven datos;
- exista rollback documentado;
- i18n `es/en` esté completo;
- los providers prometidos tengan pruebas y degradación controlada;
- observabilidad cubra conexión, errores, cola, descargas y subbots;
- no se expongan secretos, stack traces ni tokens en mensajes/logs públicos;
- cada artefacto tenga checksum y procedencia de CI.

## Documentación por software

- [Core / MainBot](../software/core/README.md)
- [Web / Panel](../software/web/README.md)
- [WhatsApp](../software/whatsapp/README.md)
- [Telegram](../software/telegram/README.md)
- [Discord](../software/discord/README.md)
- [Termux Lite](../software/termux-lite/README.md)
- [Android](../software/android/README.md)
- [Windows](../software/windows/README.md)
- [Kali Linux](../software/kali-linux/README.md)

## Orden recomendado de implementación

No empezar por las GUIs. Primero separar el core de Baileys, después Telegram/Discord, luego cerrar i18n/descargas y finalmente empaquetar Android/Windows/Kali. De lo contrario las aplicaciones nativas terminarían dependiendo de APIs internas de WhatsApp y obligarían a reescribirlas.
