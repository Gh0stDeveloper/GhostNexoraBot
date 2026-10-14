# Ghost Nexora — Aplicación Android oficial

## Estado actual

**Pendiente.** La auditoría de `main` no encontró proyecto Gradle/AndroidManifest/MainActivity. Termux Lite funciona en Android, pero no es la aplicación Android oficial anunciada.

## Objetivo del producto

La app oficial debe permitir instalar, vincular, configurar, supervisar y administrar Ghost Nexora sin que el usuario necesite operar Termux o una terminal.

V2 debe separar dos modos para no comprometer estabilidad:

1. **Remote Manager — objetivo obligatorio del primer release estable.** Administra un bot que corre en VPS, Windows o Linux mediante Control API autenticada.
2. **On-device Runtime — objetivo posterior dentro de V2 si supera los gates.** Ejecuta el runtime compatible directamente en el dispositivo sin depender de Termux.

No se debe afirmar que el modo on-device existe hasta que esté empaquetado, firmado y probado.

## Stack propuesto

```text
Kotlin
Jetpack Compose
Material/Compose primitives
Coroutines + Flow
Ktor/OkHttp para Control API/WebSocket
DataStore para preferencias no sensibles
Android Keystore para secretos/tokens
WorkManager para tareas diferibles
Foreground Service solo cuando el modo on-device lo necesite
```

UI: nativa, simple y centrada en estado operacional.

## Arquitectura

```text
Compose UI
   ↓
ViewModels
   ↓
Domain repositories
   ↓
ControlApiClient ─────────────→ VPS/PC runtime
   ↓ opcional
LocalRuntimeManager ──────────→ on-device runtime
```

Las pantallas no deben conocer detalles de Baileys, Telegram Bot API o Discord Gateway.

## Pantallas mínimas

```text
Inicio
Conexiones
  WhatsApp
  Telegram
  Discord
Pairing / QR
Subbots
Comandos y módulos
Configuración
Idioma
Descargas/providers
IA/Ollama remoto
Estadísticas
Logs
Actualizaciones
Backups
Acerca de / licencias
```

## Flujo inicial — Remote Manager

1. elegir “Conectar a mi bot”;
2. introducir URL HTTPS o escanear QR generado por la instalación;
3. intercambio de token de un solo uso;
4. guardar credencial en Android Keystore;
5. validar `/health` y versión API;
6. mostrar plataformas e instancias disponibles.

El QR nunca debe contener una contraseña permanente.

## Pairing de WhatsApp

La app inicia pairing a través de Control API y muestra:

- código de vinculación;
- QR cuando aplique;
- estado `waiting / accepted / reconnecting / connected / failed`;
- instrucciones sin exponer logs internos.

El proceso sigue en el runtime; cerrar una pantalla no debe cancelar accidentalmente la vinculación salvo acción explícita.

## Configuración multiplataforma

DTO común:

```kotlin
data class PlatformStatus(
    val id: String,
    val enabled: Boolean,
    val state: ConnectionState,
    val accountLabel: String?,
    val capabilities: Set<String>
)
```

La app habilita formularios específicos solo para credenciales necesarias, pero mantiene estado común.

## Secretos

- Android Keystore para token del manager;
- nunca guardar tokens de Telegram/Discord en logs;
- si la Control API permite editar secretos, el backend devuelve únicamente `configured: true/false`, no el valor actual;
- bloqueo biométrico opcional para acciones administrativas;
- TLS obligatorio para conexiones remotas fuera de localhost/LAN confiable.

## Logs

Mostrar logs estructurados y filtrables:

```text
INFO / WARN / ERROR
runtime / whatsapp / telegram / discord / downloads / subbots
```

Redactar tokens, cookies, auth state y URLs firmadas.

## Actualizaciones

### Runtime remoto

La app solicita `POST /v2/runtime/update`, observa progreso por eventos y muestra rollback si el health final falla.

### App Android

Distribución inicial posible mediante GitHub Releases/página oficial. Cada release debe ofrecer:

- APK universal o variantes declaradas;
- SHA-256;
- firma estable;
- changelog;
- versión mínima del Control API.

Si en el futuro se publica en Play, usar el mecanismo oficial de actualización de la tienda.

## Modo on-device

Es técnicamente más exigente que envolver scripts Termux. Antes de implementarlo se requiere PoC documentado para:

- ejecutar el runtime requerido dentro del sandbox Android;
- Node/JS engine compatible o migración de runtime;
- módulos nativos usados por dependencias;
- FFmpeg y herramientas auxiliares licenciadas/paquetizadas correctamente;
- persistencia privada;
- foreground service;
- reinicio/reconexión;
- Android Doze;
- tamaño de app;
- actualizaciones del runtime;
- Baileys funcionando de forma sostenida.

### Gates on-device

```text
Android 13–16
arm64-v8a
12 h smoke
72 h soak
cambio Wi-Fi ↔ datos
dozer/reanudación
reinicio de app
reboot del dispositivo con comportamiento documentado
pair/re-pair
update/rollback
```

Si alguno falla, V2 puede lanzar Remote Manager sin anunciar ejecución local sin Termux.

## Accesibilidad y UX

- estados con texto/icono, no solo color;
- logs copiables con redacción;
- acciones destructivas con confirmación;
- soporte español/inglés;
- no bloquear la UI mientras actualiza/reinicia;
- mostrar claramente si una función es remota, local o no soportada.

## CI Android

```text
./gradlew lint
./gradlew test
./gradlew assembleDebug
./gradlew assembleRelease
```

Además:

```text
control-api-contract tests
Compose UI tests críticos
secret-redaction tests
release signing validation
APK SHA-256 artifact
```

Las claves de firma no se versionan en Git.

## Definition of Done V2

### Remote Manager

- APK instalable y firmado;
- conexión segura a runtime;
- status/logs/metrics;
- start/stop/restart/update;
- pairing;
- configuración de plataformas;
- subbots;
- español/inglés;
- recuperación de conexión;
- CI genera artefacto verificable.

### On-device

Solo se marca terminado después de todos los gates de runtime, batería y soak. Hasta entonces debe figurar como experimental o pendiente.

Ver [Control API y arquitectura](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
