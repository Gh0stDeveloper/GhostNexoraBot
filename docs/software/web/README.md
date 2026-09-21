# Ghost Nexora Web / Panel

## Estado actual

**Existente y opcional.** El workspace `@ghostnexora/web` usa Next.js App Router y actualmente incluye rutas de inicio, login, administración, API, browser/proxy y portal de subbots.

El panel actual es una pieza útil de V1, pero V2 debe convertirlo en el **control plane común** de todas las plataformas y aplicaciones oficiales.

## Objetivo V2

El panel debe permitir administrar una instalación sin editar `.env` ni ejecutar comandos manuales para tareas normales.

Áreas mínimas:

```text
Dashboard
Plataformas
  WhatsApp
  Telegram
  Discord
Instancias
  MainBot
  Subbots
Configuración
Idiomas
Comandos y módulos
Descargas/providers
IA/Ollama
Logs
Métricas
Actualizaciones
Backups
Seguridad
```

## API de control

La Web no debe leer bases o archivos internos directamente cuando exista una API de runtime. Debe consumir contratos estables:

```text
GET  /api/runtime/status
GET  /api/runtime/metrics
GET  /api/platforms
GET  /api/instances
GET  /api/providers
GET  /api/config
PATCH /api/config
POST /api/runtime/restart
POST /api/runtime/update
POST /api/pair/start
```

Las operaciones mutables necesitan autenticación, autorización y auditoría.

## Autenticación

V2 debe reemplazar cualquier modelo de “token administrativo único pegado en el navegador” como mecanismo principal por sesiones seguras.

Requisitos:

- bootstrap local con token inicial;
- cookie `HttpOnly`, `Secure`, `SameSite`;
- expiración y revocación;
- roles `owner`, `admin`, `viewer`;
- CSRF en mutaciones cuando aplique;
- rate limit de login;
- secretos enmascarados;
- auditoría de cambios críticos.

## Multi-plataforma

El panel muestra una tarjeta por adapter:

| Campo | Ejemplo |
|---|---|
| Estado | conectado / reconectando / detenido |
| Cuenta | nombre/ID público redactado |
| Instancias | MainBot + subbots |
| Mensajes | rx/tx |
| Latencia | health del adapter |
| Errores | tasa reciente |
| Acciones | conectar, desconectar, reiniciar |

No debe asumir WhatsApp en nombres de rutas o DTOs compartidos.

## i18n Web

El panel debe compartir las convenciones `es/en` del core.

Primera entrega:

- locale cookie/preferencia de usuario;
- catálogos Web separados;
- español como fallback;
- selector de idioma en ajustes;
- CI que compare claves.

## Aplicaciones oficiales

Windows/Kali pueden reutilizar esta UI de dos maneras:

1. componentes React compartidos con Tauri;
2. panel local embebido conectado a la misma Control API.

Android debe usar componentes nativos Compose, pero los mismos DTOs y endpoints.

## Observabilidad

Dashboard mínimo:

- uptime;
- RSS/CPU;
- estado de adapters;
- subbots activos;
- comandos por minuto;
- errores por minuto;
- descargas por provider y success rate;
- salud de Ollama;
- versión instalada / versión disponible.

## Seguridad del browser/proxy

El proxy es superficie sensible. V2 debe mantener:

- bloqueo de loopback/private ranges para destinos externos;
- timeouts;
- límite de tamaño;
- validación de esquemas `http/https`;
- headers seguros;
- sin acceso arbitrario a metadata cloud;
- logs de destino sin secretos de query cuando contengan tokens.

## CI

Además del build de Next.js:

```text
web-route-contract
web-auth-smoke
web-platforms-smoke
web-i18n-audit
web-security-headers
web-control-api-contract
```

## Definition of Done V2

- controla WhatsApp, Telegram y Discord desde un modelo común;
- configuración sin editar archivos para operaciones normales;
- español/inglés completos;
- autenticación por sesión y roles;
- métricas y logs paginados;
- actualizaciones seguras con preflight/rollback;
- responsive desktop/mobile;
- no contiene secretos en HTML, JS público o respuestas de API.

Ver [plan V2](../../v2/README.md).
