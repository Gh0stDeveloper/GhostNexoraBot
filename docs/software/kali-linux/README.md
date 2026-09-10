# Ghost Nexora — Aplicación Kali Linux

## Estado actual

**Pendiente como software dedicado.** El runtime Linux/VPS ya existe y proporciona una base técnica útil, pero no se encontró una aplicación específica para Kali Linux con interfaz, paquete `.deb` o AppImage.

## Objetivo V2

Entregar una aplicación desktop para Kali Linux que permita instalar, vincular, configurar y supervisar Ghost Nexora desde una GUI, sin convertir Kali en una variante independiente del Core.

Kali es Debian-based; el producto debe aprovechar la misma aplicación Linux portable y añadir validación oficial sobre Kali, en lugar de mantener un fork exclusivo.

## Stack propuesto

**Tauri 2 + React/TypeScript**, compartido con Windows.

```text
apps/desktop/
  src/                     # UI compartida
  src-tauri/               # lifecycle/update/native
  platform/windows/
  platform/linux/
```

Artefactos Linux:

- `.deb` para Kali/Debian/Ubuntu compatibles;
- AppImage como distribución portable;
- opcional tarball para recuperación/advanced install.

## Arquitectura

```text
Tauri UI
   ↓
Desktop Manager
   ↓
Local Control API
   ↓
Ghost Nexora runtime
   ├─ WhatsApp
   ├─ Telegram
   └─ Discord
```

La aplicación administra el runtime; no duplica comandos.

## Instalación

Flujo:

1. detectar distro/arquitectura;
2. comprobar dependencias;
3. instalar o desplegar runtime administrado;
4. crear directorios de estado;
5. elegir perfil;
6. crear token local;
7. pairing/configuración de plataformas;
8. instalar integración desktop;
9. opcionalmente habilitar servicio de usuario/systemd;
10. ejecutar health/doctor.

## Dependencias

Preferir paquetes oficiales de Debian/Kali cuando correspondan:

```text
ffmpeg
git
ca-certificates
```

Node puede ser:

- runtime empaquetado/administrado por Ghost Nexora; o
- Node 24+ del sistema si cumple el contrato.

No asumir que Kali rolling siempre incluye exactamente la versión necesaria.

## Privilegios

La aplicación debe funcionar como usuario normal para:

- iniciar/detener runtime de usuario;
- pairing;
- configuración;
- logs;
- actualizaciones dentro del directorio de usuario.

Solicitar elevación únicamente para:

- instalar `.deb`/dependencias del sistema;
- crear servicios system-wide;
- escribir en rutas protegidas.

Nunca ejecutar toda la GUI como root como requisito permanente.

## Directorios

Convención XDG:

```text
~/.local/share/ghost-nexora/
~/.config/ghost-nexora/
~/.cache/ghost-nexora/
```

Logs persistentes pueden residir en `~/.local/state/ghost-nexora/` cuando el entorno lo soporte.

Si se instala un servicio system-wide, conservar el modelo existente de datos separados del checkout.

## systemd

Dos modos:

### User service

Preferido para desktop:

```text
systemctl --user enable --now ghost-nexora.service
```

### System service

Solo para servidor/instalación administrada. Debe usar usuario de servicio dedicado y permisos mínimos.

## Funciones de la UI

Mismas funciones que Windows:

```text
status/health
start/stop/restart
pairing
WhatsApp/Telegram/Discord
subbots
módulos
i18n
Ollama
Web
providers
logs/metrics
update/rollback
backup/restore
doctor
```

## Kali no implica funciones ofensivas

La aplicación Kali es una herramienta de administración del bot. No se deben habilitar capacidades adicionales simplemente porque el sistema anfitrión sea Kali Linux. Las políticas y permisos del Core son idénticos a Linux/Windows.

## Seguridad

- Control API en loopback por defecto;
- token local con permisos de archivo restrictivos;
- secretos redactados;
- no exponer auth state WhatsApp;
- no ejecutar shell arbitrario desde la UI;
- validar manifests/checksums de actualización;
- dependencias descargadas solo desde fuentes declaradas.

## Ollama

Opcional como en Linux/VPS:

- detectar instalación existente;
- ofrecer instalación explícita;
- verificar API local;
- modelo configurable;
- comandos LLM ocultos si está deshabilitado.

## Compatibilidad

Matriz mínima:

```text
Kali Linux rolling x86_64
Debian stable x86_64
Ubuntu LTS x86_64
```

Kali ARM64 debe declararse solo después de validar Tauri/WebKit, Node, FFmpeg y dependencias del bot en hardware o runner adecuado.

## CI

```text
linux-desktop-build
linux-deb-package
linux-appimage-package
linux-control-api-contract
linux-installer-smoke
linux-update-rollback-fixture
```

Para Kali específico, ejecutar contenedor/chroot de validación de dependencias y mantener una prueba manual de release sobre Kali real/VM.

## Definition of Done V2

- `.deb` y/o AppImage generado por CI;
- instalación y ejecución como usuario normal;
- integración opcional systemd;
- pairing y gestión de las tres plataformas;
- logs/métricas/configuración;
- update + rollback;
- español/inglés;
- checksum/provenance;
- prueba documentada en Kali rolling.

Ver [Windows](../windows/README.md) para la base desktop compartida y [arquitectura](../../v2/ARCHITECTURE_MULTIPLATFORM.md).
