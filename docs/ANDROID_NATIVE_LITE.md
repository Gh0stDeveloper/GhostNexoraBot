# Ghost Nexora Android Native Lite

> Documento de diseño para convertir la aplicación Android actual en un host autónomo de Ghost Nexora Bot Lite.
>
> Estado: **diseño aprobado para implementación futura**. Este documento no modifica todavía el runtime Android.

## 1. Objetivo

La aplicación Android debe dejar de ser un controlador que delega la ejecución a Termux y convertirse en una aplicación **autónoma** capaz de instalarse y ejecutar Ghost Nexora Bot Lite por sí misma.

La experiencia objetivo es:

1. El usuario instala el APK.
2. Abre Ghost Nexora.
3. Configura el bot.
4. Vincula WhatsApp mediante código o QR.
5. Pulsa **Iniciar**.
6. El bot queda activo mediante un servicio nativo de Android visible al usuario.
7. Todo el estado, la sesión, configuración, base de datos y logs permanecen dentro del sandbox privado de la aplicación.

No se debe exigir:

- Termux;
- Termux:API;
- F-Droid;
- Git;
- npm;
- una terminal;
- Python del sistema;
- un administrador de procesos externo;
- un navegador o dashboard externo para controlar el bot.

El perfil seguirá siendo **Lite**: el objetivo es mantener el núcleo del bot, grupos, economía, comandos compatibles, subbots compatibles y automatizaciones importantes, evitando servicios pesados que no tienen sentido mantener permanentemente en un teléfono.

## 2. Situación actual

La aplicación actual ya tiene una base útil:

- Kotlin + Jetpack Compose;
- Material 3;
- navegación inferior;
- pantallas de Inicio, Vinculación, Actividad y Ajustes;
- almacenamiento de token protegido con Android Keystore;
- cliente del Control API;
- pairing mediante QR o código;
- lectura de logs;
- Start / Stop / Restart / Update;
- configuración de nombre, prefijo e idioma;
- firma Android V1/V2/V3/V4 cuando existen credenciales;
- versión Android 2.0.0;
- minSdk 33, targetSdk 36.

Sin embargo, la ejecución local depende actualmente de Termux.

### Dependencias de Termux que deben desaparecer

El manifiesto declara:

- `com.termux.permission.RUN_COMMAND`;
- consulta explícita del paquete `com.termux`.

`LocalRuntimeBridge`:

- comprueba si Termux está instalado;
- llama `com.termux.RunCommandService`;
- ejecuta `/data/data/com.termux/files/usr/bin/bash`;
- ejecuta `/data/data/com.termux/files/usr/bin/ghostnexora`;
- instala paquetes mediante `pkg`;
- instala Node.js, FFmpeg, Python y yt-dlp;
- clona/actualiza el repositorio con Git;
- compila el runtime dentro de Termux.

Esta arquitectura debe eliminarse por completo para el modo local Android.

## 3. Principios del nuevo Android Native Lite

### 3.1 Cero aplicaciones externas

El APK debe contener todo lo necesario para **arrancar el bot**.

La primera ejecución no debe descargar ni instalar un entorno Linux.

### 3.2 Sin compilación en el teléfono

El dispositivo no debe ejecutar:

- `npm install`;
- TypeScript;
- Gradle;
- Git checkout;
- compilación de módulos nativos.

GitHub Actions preparará previamente el runtime que será empaquetado con la aplicación.

### 3.3 Local-first

El modo principal será **Este teléfono**.

El modo de control de un VPS continuará existiendo como función secundaria y opcional.

### 3.4 Runtime Lite real

Se conservará un bundle específicamente preparado para Android, equivalente al concepto actual `dist-termux`, pero sin referencias a Termux.

Nombre recomendado:

```text
mobile-lite
```

### 3.5 Interfaz y runtime aislados

La interfaz Compose no debe compartir el mismo ciclo de vida que el motor del bot.

Si el runtime falla, la UI debe seguir funcionando y mostrar diagnóstico/reinicio.

## 4. Arquitectura objetivo

```text
┌────────────────────────────────────────────┐
│            Ghost Nexora Android            │
│                                            │
│  Jetpack Compose UI                        │
│  ├─ Inicio                                 │
│  ├─ Vinculación                            │
│  ├─ Administrar                            │
│  ├─ Actividad                              │
│  └─ Ajustes                                │
│                  │                         │
│                  ▼                         │
│          Native Runtime Controller         │
│                  │                         │
│       IPC / loopback privado               │
│                  │                         │
│                  ▼                         │
│     BotRuntimeService (:bot process)       │
│     Foreground Service                     │
│                  │                         │
│                  ▼                         │
│       Nexora Embedded Node Host            │
│       libnode.so + JNI bridge              │
│                  │                         │
│                  ▼                         │
│       Ghost Nexora mobile-lite JS          │
│       Baileys + SQLite + comandos           │
└────────────────────────────────────────────┘
```

### Componentes nuevos

#### `BotRuntimeService`

Servicio nativo encargado de:

- iniciar el motor;
- detenerlo;
- reiniciarlo;
- mantener la notificación persistente;
- informar estado;
- recibir acciones desde la notificación;
- administrar recuperación ante crash.

Debe ejecutarse preferentemente en un proceso separado:

```xml
android:process=":bot"
```

Esto evita que un fallo grave del motor cierre también la interfaz Compose.

#### `EmbeddedNodeHost`

Capa JNI responsable de cargar el motor Node incluido en el APK.

Responsabilidades:

- cargar `libnode.so`;
- crear el hilo del runtime;
- proporcionar rutas privadas de Android;
- iniciar `mobile-lite/bootstrap.js`;
- entregar señales de cierre;
- devolver exit code/crash reason al servicio.

#### `NativeRuntimeController`

Sustituye a `LocalRuntimeBridge`.

No conocerá Termux.

API prevista:

```text
status()
start()
stop()
restart()
pairCode(phone)
pairQr()
cancelPairing()
saveConfig()
logs()
updateRuntime()
rollbackRuntime()
exportBackup()
importBackup()
```

## 5. Node.js embebido

Ghost Nexora Bot actual requiere Node.js moderno y utiliza APIs que no deben degradarse silenciosamente.

Node upstream incluye herramientas para cross-compilar Android, pero Android no es una plataforma oficialmente soportada ni cubierta por su CI principal. Por eso no se debe depender de descargar un Node genérico en el teléfono.

### Decisión

Crear un runtime propio:

```text
Nexora Embedded Node
```

Construido de forma reproducible en GitHub Actions con Android NDK.

### ABI inicial

Producción:

```text
arm64-v8a
```

Pruebas/emulador:

```text
x86_64
```

`armeabi-v7a` no será prioridad debido al coste de mantenimiento, memoria limitada y menor relevancia en dispositivos modernos.

### Reglas

- versión de Node fijada por commit/tag;
- NDK fijado;
- SHA-256 del runtime publicado;
- pruebas automáticas de `crypto`, `fetch`, WebSocket, SQLite, timers y filesystem;
- prueba real de conexión Baileys;
- nunca descargar un binario Node sin firma/verificación;
- mantener un patchset Android propio si upstream lo requiere.

`nodejs-mobile` puede usarse como referencia técnica, pero no será una dependencia ciega del producto mientras su versión estable no coincida con los requisitos del bot.

## 6. Bundle JavaScript móvil

Añadir un build específico:

```text
apps/bot/dist-mobile/
```

Entrada sugerida:

```text
apps/bot/src/mobile-lite.ts
```

Debe partir del runtime Lite existente, eliminando cualquier supuesto de Termux.

### Incluido

- WhatsApp / Baileys;
- pairing;
- reconexión;
- economía;
- banco;
- grupos;
- moderación;
- juegos compatibles;
- RPG compatible;
- waifus;
- automatizaciones;
- sesión persistente;
- SQLite;
- subbots compatibles con memoria móvil;
- providers HTTP compatibles;
- Control API local;
- observabilidad Lite;
- logs;
- backups.

### No incluido en el núcleo móvil

- Ollama;
- Qwen local;
- Next.js;
- Nginx;
- systemd;
- Playwright;
- Chromium;
- panel web completo;
- compilación TypeScript;
- herramientas de desarrollo.

## 7. Multimedia

El bot debe poder arrancar y funcionar completamente aunque no exista ningún paquete multimedia adicional.

### FFmpeg

Recomendación:

- compilar un FFmpeg reducido para Android/arm64;
- empaquetarlo como componente nativo administrado por la app;
- habilitar únicamente codecs/operaciones realmente usados por Ghost Nexora Lite.

### yt-dlp

No se debe obligar al APK base a incluir un entorno Python completo solo para yt-dlp.

Orden recomendado:

1. priorizar providers HTTP/JS existentes;
2. usar implementaciones directas cuando sea posible;
3. crear posteriormente un **Media Pack** administrado por la propia app si se necesita paridad exacta con yt-dlp.

Un Media Pack sería descargado e instalado desde Ghost Nexora, nunca mediante otra aplicación.

El bot base seguirá siendo autónomo aunque el Media Pack no esté instalado.

## 8. Servicio en segundo plano

El bot mantiene una conexión de red de larga duración. No debe intentarse ocultar este trabajo.

Android requiere que el usuario pueda percibir y controlar un servicio prolongado.

### Diseño

Usar un `ForegroundService` iniciado explícitamente por el usuario.

Notificación persistente:

```text
Ghost Nexora Bot
WhatsApp conectado
Activo · 2h 14m

[Detener] [Reiniciar] [Abrir]
```

No usar emojis en la UI real.

### Tipo de servicio

Evaluar `specialUse` para el runtime persistente cuando no exista otro tipo Android que describa correctamente el caso.

Manifest esperado:

```text
FOREGROUND_SERVICE
FOREGROUND_SERVICE_SPECIAL_USE
POST_NOTIFICATIONS
```

El subtipo debe explicar claramente que el usuario inicia un bot local persistente con conexión de mensajería y que puede detenerlo desde la notificación.

### Restricciones Android modernas

- el usuario inicia el runtime desde una pantalla visible;
- no iniciar silenciosamente un Foreground Service desde background;
- el usuario siempre dispone de acción Stop;
- no mantener wake lock permanente por defecto;
- ofrecer guía de optimización de batería para fabricantes agresivos;
- registrar claramente cuando Android/OEM haya terminado el proceso.

### Inicio tras reinicio

No prometer autoarranque absoluto.

Opción:

```text
Reactivar después de reiniciar
```

Comportamiento:

- restaurar estado si Android permite el arranque correspondiente;
- si el sistema no permite iniciar el FGS desde boot, mostrar una notificación para que el usuario reactive el bot;
- nunca intentar evadir restricciones del sistema.

## 9. Almacenamiento Android

Estructura propuesta:

```text
filesDir/
├── runtime/
│   ├── slot-a/
│   ├── slot-b/
│   └── active.json
├── state/
│   ├── session/
│   ├── data/
│   ├── subbots/
│   └── logs/
└── exports/

cacheDir/
└── media/

noBackupFilesDir/
└── secrets/
```

### Sesión WhatsApp

Debe permanecer en almacenamiento privado de la aplicación.

No utilizar almacenamiento compartido para credenciales.

### Configuración sensible

Proteger con Android Keystore:

- token del Control API local;
- claves de API configuradas por el usuario;
- secretos de actualización;
- claves de backup cifrado.

## 10. Backups

Añadir desde la app:

- Crear backup;
- Restaurar backup;
- Exportar archivo cifrado;
- Importar backup;
- Mostrar fecha/tamaño;
- comprobar versión compatible antes de restaurar.

Contenido:

- sesión;
- SQLite;
- configuración;
- economía;
- subbots;
- preferencias.

No incluir:

- caché;
- logs temporales;
- binarios del runtime.

## 11. Vinculación de WhatsApp

La experiencia actual de QR/código se conserva pero deja de pasar por Termux.

### Código

Flujo:

```text
Vincular
→ Código
→ Número con país
→ Solicitar código al runtime
→ Mostrar código grande
→ Estado de vinculación
→ Conectado
```

### QR

Flujo:

```text
Vincular
→ QR
→ Runtime genera evento QR
→ Compose renderiza QR
→ refresco automático
→ conectado
```

Añadir:

- tiempo restante;
- botón cancelar;
- regeneración;
- estado de conexión;
- mensaje claro si la sesión expiró;
- acción Desvincular dispositivo.

## 12. Nuevo diseño visual

La interfaz debe alejarse de un administrador técnico y sentirse como una aplicación móvil terminada.

### Dirección visual

- diseño minimalista;
- oscuro por defecto;
- opción AMOLED;
- superficies compactas;
- esquinas suaves;
- tipografía limpia tipo SF/Inter;
- jerarquía visual clara;
- iconografía nativa;
- sin emojis como iconos de interfaz;
- animaciones cortas;
- haptics discretos;
- blur únicamente donde aporte valor;
- evitar tarjetas gigantes;
- información importante visible sin mucho scroll.

### Barra inferior

Propuesta:

```text
Inicio | Vincular | Administrar | Actividad | Ajustes
```

Solo iconos en navegación compacta cuando el ancho sea reducido.

### Inicio

Hero compacto:

```text
Ghost Nexora Bot
ONLINE

WhatsApp conectado
2h 14m activo

[Detener] [Reiniciar]
```

Debajo:

- uso RAM;
- batería estimada;
- mensajes procesados;
- grupos;
- subbots;
- errores recientes;
- actualización disponible.

### Vincular

- código;
- QR;
- dispositivo actual;
- estado de sesión;
- desvincular.

### Administrar

Subsecciones:

- Plataformas;
- Grupos;
- Subbots;
- Comandos;
- Economía;
- Backups.

#### Grupos

Mostrar:

- nombre;
- JID;
- miembros;
- admins;
- estado;
- bienvenida;
- despedida;
- antilink;
- configuración rápida.

#### Subbots

Mostrar:

- nombre;
- estado;
- sesión;
- iniciar;
- detener;
- reiniciar;
- eliminar;
- pairing.

### Actividad

- logs en vivo;
- filtros Info / Warning / Error;
- búsqueda;
- copiar;
- compartir diagnóstico;
- eventos de conexión;
- reconexiones;
- crashes;
- historial de runtime.

### Ajustes

Secciones:

#### Bot

- nombre;
- prefijo;
- idioma;
- owner;
- comportamiento.

#### Runtime

- iniciar automáticamente cuando sea posible;
- recuperación después de crash;
- límite de almacenamiento temporal;
- nivel de logs;
- optimización de batería.

#### Integraciones

- Spotify;
- LemPi;
- OpenRouter;
- Anime;
- Telegram;
- Discord;
- providers opcionales.

#### Apariencia

- Oscuro;
- AMOLED;
- idioma de la app;
- reducir animaciones.

#### Actualizaciones

- versión de app;
- versión de runtime;
- buscar actualización;
- canal Stable / Beta;
- rollback.

#### Avanzado

- exportar diagnóstico;
- limpiar caché;
- reconstruir índices;
- reparar sesión;
- restablecer runtime.

## 13. Modo remoto

La capacidad actual de controlar un VPS debe conservarse.

En Ajustes:

```text
Modo de ejecución

● Este teléfono
○ Servidor remoto
```

### Este teléfono

La app controla `BotRuntimeService`.

### Servidor remoto

La app usa el `ControlApiClient` existente con HTTPS y token en Android Keystore.

La UI debe poder distinguir claramente los dos contextos para evitar detener un VPS cuando el usuario pretendía detener el bot local.

## 14. Actualizaciones sin Git ni npm

La aplicación no debe actualizar el runtime haciendo `git pull`.

### Formato

```text
runtime-manifest.json
runtime-mobile-lite.zip
runtime-mobile-lite.sig
```

Manifest:

```json
{
  "runtimeVersion": "2.1.0",
  "minimumAppVersion": "2.1.0",
  "nodeVersion": "24.x",
  "abi": "arm64-v8a",
  "sha256": "...",
  "size": 12345678
}
```

### Seguridad

- firma Ed25519;
- public key embebida en la app;
- SHA-256;
- descarga HTTPS;
- validar antes de activar;
- no ejecutar contenido sin firma válida.

### Slots A/B

```text
slot-a = runtime activo
slot-b = runtime nuevo
```

Proceso:

1. descargar a slot inactivo;
2. verificar firma;
3. ejecutar smoke local;
4. marcar como activo;
5. reiniciar;
6. comprobar health;
7. si falla, rollback automático.

## 15. Recuperación ante fallos

El servicio debe distinguir:

- salida solicitada;
- desconexión de WhatsApp;
- sesión cerrada;
- excepción JS;
- crash nativo;
- runtime corrupto;
- actualización fallida.

Política:

- reconexión de WhatsApp: automática;
- excepción recuperable: registrar y continuar;
- runtime crash: máximo de reinicios en ventana temporal;
- crash loop: detener y mostrar diagnóstico;
- actualización fallida: rollback;
- sesión cerrada: no reintentar indefinidamente; pedir nueva vinculación.

## 16. Observabilidad móvil

La aplicación debe mostrar métricas Lite:

- estado;
- uptime;
- memoria RSS;
- almacenamiento usado;
- eventos procesados;
- mensajes/min;
- reconexiones;
- errores;
- cola actual;
- grupos;
- subbots;
- versión app;
- versión runtime;
- versión Node.

No persistir contenido completo de mensajes en telemetría.

## 17. Permisos

Eliminar:

```text
com.termux.permission.RUN_COMMAND
queries -> com.termux
TermuxResultService
```

Añadir según implementación final:

```text
INTERNET
POST_NOTIFICATIONS
FOREGROUND_SERVICE
FOREGROUND_SERVICE_SPECIAL_USE
RECEIVE_BOOT_COMPLETED
WAKE_LOCK
```

`WAKE_LOCK` no significa mantener un bloqueo permanente. Solo se usará si una operación concreta lo necesita.

No solicitar permisos de contactos, SMS, llamadas, ubicación, cámara o micrófono si no existe una función explícita que los necesite.

## 18. Rendimiento

Objetivos iniciales para el perfil Lite:

### Idle conectado

- memoria objetivo: lo más cercana posible a 150–250 MB incluyendo motor;
- CPU prácticamente inactiva cuando no hay eventos;
- cero polling agresivo;
- timers agrupados;
- cachés limitadas.

### Límites

- temp media con cuota;
- logs con rotación;
- cachés TTL/LRU;
- límite de subbots según RAM;
- descargas concurrentes reducidas;
- IA local deshabilitada.

### Protección térmica/batería

Detectar:

- batería baja;
- thermal status;
- almacenamiento bajo.

Reducir trabajo no crítico cuando sea necesario.

## 19. Subbots en Android

Los subbots se conservarán, pero deberán respetar límites móviles.

Configuración recomendada:

```text
2 GB RAM  -> MainBot + 0/1 subbot
4 GB RAM  -> MainBot + hasta 2 subbots
6+ GB RAM -> límite configurable
```

La app debe advertir cuando un número de subbots pueda provocar presión de memoria.

Nunca prometer que Android mantendrá procesos ilimitados activos.

## 20. Compatibilidad de comandos

Crear una matriz automática:

```text
FULL
MOBILE_LITE
```

Cada comando debe declarar:

- compatible;
- degradado;
- no disponible;
- necesita Media Pack;
- necesita API externa.

El menú móvil no mostrará comandos imposibles de ejecutar en ese perfil.

## 21. GitHub Actions

Añadir validaciones Android específicas.

### Embedded Node

- cross-build arm64;
- x86_64 de pruebas;
- smoke de Node;
- crypto;
- fetch;
- WebSocket;
- SQLite;
- filesystem.

### Runtime mobile-lite

- build TypeScript;
- ejecutar smoke;
- verificar imports prohibidos;
- impedir Termux paths;
- impedir `pkg`, `apt`, `npm install` y Git en runtime móvil.

### Android

- lint;
- unit tests;
- Compose tests;
- build debug;
- build release;
- firma;
- APK install smoke;
- arranque de Foreground Service;
- pairing mock;
- restart;
- actualización A/B;
- rollback.

### Regla de regresión

CI debe fallar si reaparece:

```text
com.termux
/data/data/com.termux
RUN_COMMAND
install-termux.sh
```

dentro de `apps/android` o del runtime mobile-lite.

## 22. Migración de usuarios actuales

La aplicación debe detectar si una instalación anterior utilizaba Termux.

Mostrar:

```text
Se detectó una instalación anterior de Ghost Nexora Lite.

Puedes importar tu sesión y datos al nuevo runtime interno.
Termux ya no será necesario después de completar la migración.
```

### Importación

Por las restricciones de sandbox de Android, la app no debe asumir que puede leer directamente `/data/data/com.termux`.

La migración antigua podrá requerir una exportación explícita desde la instalación vieja y una importación mediante Storage Access Framework.

Después de importar:

- validar sesión;
- validar SQLite;
- crear backup interno;
- arrancar runtime;
- confirmar health;
- informar al usuario que Termux puede desinstalarse.

## 23. Orden recomendado de implementación

### 1. Base autónoma

- quitar dependencia Termux del diseño;
- crear `BotRuntimeService`;
- notificación persistente;
- RuntimeController;
- almacenamiento interno.

### 2. Embedded Node

- pipeline NDK;
- `libnode.so`;
- JNI;
- arm64;
- smoke Android.

### 3. mobile-lite

- nueva entrada;
- bundle precompilado;
- paths Android;
- health/control local.

### 4. Vinculación real

- código;
- QR;
- sesión;
- logout;
- reconexión.

### 5. Administración

- grupos;
- subbots;
- configuración;
- economía;
- backups.

### 6. Actualizador

- manifest firmado;
- slots A/B;
- rollback.

### 7. Multimedia

- FFmpeg reducido;
- providers;
- Media Pack opcional.

### 8. Pulido

- diseño final;
- AMOLED;
- animaciones;
- haptics;
- onboarding;
- diagnóstico;
- pruebas en fabricantes reales.

## 24. Diseño del onboarding

Primera apertura:

### Pantalla 1

```text
Ghost Nexora Bot

Tu bot puede ejecutarse directamente
en este teléfono.

No necesitas Termux ni otra aplicación.
```

Botón:

```text
Continuar
```

### Pantalla 2

Explicar:

- notificación persistente;
- consumo de batería;
- almacenamiento local;
- privacidad.

### Pantalla 3

Configurar:

- nombre;
- prefijo;
- idioma;
- owner.

### Pantalla 4

Vincular WhatsApp.

### Pantalla 5

```text
Todo listo

Ghost Nexora puede mantenerse activo
mientras la notificación del runtime
permanezca habilitada.
```

Botón:

```text
Iniciar bot
```

## 25. Criterios para considerar completa la migración

La nueva app se considera lista cuando:

- [ ] funciona en un teléfono limpio sin Termux;
- [ ] no requiere instalar otra app;
- [ ] no ejecuta npm/Git en el dispositivo;
- [ ] inicia y detiene el bot desde Compose;
- [ ] mantiene una notificación correcta mientras está activo;
- [ ] realiza pairing por código;
- [ ] realiza pairing por QR;
- [ ] conserva la sesión tras cerrar/reabrir la UI;
- [ ] conserva la sesión tras reiniciar el runtime;
- [ ] SQLite funciona dentro del sandbox;
- [ ] economía persiste;
- [ ] grupos/moderación funcionan;
- [ ] los comandos Lite pasan su matriz;
- [ ] los subbots soportados funcionan;
- [ ] los logs aparecen en la app;
- [ ] backup/restore funciona;
- [ ] actualización A/B funciona;
- [ ] rollback funciona;
- [ ] un crash del runtime no destruye la UI;
- [ ] CI compila APK firmado;
- [ ] CI valida `arm64-v8a`;
- [ ] no existen referencias de ejecución a Termux.

## 26. Decisiones de producto

### Mantener

- Kotlin;
- Compose;
- Control API;
- Android Keystore;
- ES/EN;
- pairing QR/código;
- control VPS remoto.

### Reemplazar

```text
LocalRuntimeBridge
        ↓
NativeRuntimeController
```

```text
TermuxResultService
        ↓
BotRuntimeService
```

```text
Termux + Node instalado
        ↓
Nexora Embedded Node
```

```text
git pull + npm install
        ↓
runtime packs firmados + A/B
```

### Eliminar

- permiso Termux;
- dependencia de F-Droid;
- bootstrap shell Termux;
- descarga de Node en el teléfono;
- npm install en Android;
- Git en Android;
- rutas `/data/data/com.termux`.

## 27. Riesgos técnicos

### Node Android

Android no es un target oficialmente soportado por Node upstream. El proyecto debe asumir responsabilidad sobre el toolchain y su validación.

Mitigación:

- versión/NDK fijados;
- builds reproducibles;
- smoke tests;
- patchset propio;
- no actualizar Node automáticamente.

### Memoria

Node + Baileys + cachés pueden ser pesados en teléfonos modestos.

Mitigación:

- mobile-lite;
- límites estrictos;
- reducir concurrencia;
- deshabilitar módulos pesados.

### OEM battery killers

Algunos fabricantes terminan servicios de larga duración con políticas propias.

Mitigación:

- FGS visible;
- onboarding de batería;
- detector de terminación;
- recuperación;
- guía específica cuando sea necesario.

### Google Play

El uso prolongado de Foreground Service debe ser transparente, iniciado/perceptible por el usuario y justificable como función central.

La distribución por GitHub Release puede continuar independientemente de Play Store, pero la implementación no debe intentar evadir las reglas del sistema operativo.

## 28. Referencias técnicas

- Android Foreground Services:
  https://developer.android.com/develop/background-work/services/fgs

- Android Foreground Service types:
  https://developer.android.com/develop/background-work/services/fgs/service-types

- Node.js Android build notes:
  https://github.com/nodejs/node/blob/main/BUILDING.md

- Node.js Mobile:
  https://github.com/nodejs-mobile/nodejs-mobile

## 29. Resultado esperado

Al terminar este rediseño, **Ghost Nexora Android no será un frontend para Termux**.

Será una aplicación completa formada por:

```text
App Android
+
Runtime Lite
+
Node embebido
+
Baileys
+
SQLite
+
Foreground Service
+
Pairing
+
Administración
+
Actualizaciones seguras
```

El usuario únicamente instalará Ghost Nexora, vinculará su cuenta y podrá mantener el bot activo desde la misma aplicación.
