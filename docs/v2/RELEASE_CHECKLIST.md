# Ghost Nexora Bot V2.0 — Release Checklist

Este checklist es el gate formal para declarar que el proyecto sale de BETA y publicar `v2.0.0`.

**Regla:** un checkbox solo se marca cuando existe evidencia reproducible: prueba CI, artefacto, reporte o validación manual registrada. “El código parece correcto” no cuenta como evidencia de release.

## 1. Versionado y alcance

- [ ] baseline V1 congelado y etiquetado;
- [ ] inventario efectivo de comandos V1 generado;
- [ ] inventario efectivo de comandos V2 generado;
- [ ] delta de funciones del comunicado demostrado (`>= 60`) o comunicado corregido;
- [ ] `package.json` raíz y workspaces alineados en `2.0.0`;
- [ ] changelog V2 completo;
- [ ] migration notes desde 1.1.x;
- [ ] licencia y THIRD_PARTY_NOTICES revisados.

## 2. Core multiplataforma

- [ ] `PlatformAdapter` estable;
- [ ] `NormalizedMessage` estable;
- [ ] `NormalizedUi` estable;
- [ ] `PlatformCapabilities` estable;
- [ ] router neutral de transport;
- [ ] FakeAdapter ejecuta suite compartida;
- [ ] auditor CI impide imports de adapters en comandos `shared`;
- [ ] persistencia namespaced por plataforma/instancia;
- [ ] IdentityLink explícito para identidad cross-platform.

## 3. WhatsApp

- [ ] adapter WhatsApp encapsula Baileys;
- [ ] pairing code;
- [ ] QR fallback;
- [ ] PN/LID;
- [ ] reconexión;
- [ ] typing;
- [ ] reactions;
- [ ] edición de mensajes;
- [ ] grupos/permisos;
- [ ] MainBot/subbots aislados;
- [ ] toda UI interactiva usa renderer canónico;
- [ ] fallback textual;
- [ ] matriz Android/Web/Desktop validada;
- [ ] no se reproduce “actualiza WhatsApp” en rutas soportadas.

## 4. Telegram

- [ ] runtime/entrypoint independiente;
- [ ] token/configuración aislada;
- [ ] polling;
- [ ] webhook opcional y validado;
- [ ] mensajes/replies/media;
- [ ] callbacks;
- [ ] edición;
- [ ] typing;
- [ ] permisos de grupos;
- [ ] suite shared commands;
- [ ] Web/control plane muestra estado;
- [ ] desconexión no afecta otras plataformas.

## 5. Discord

- [ ] runtime/entrypoint independiente;
- [ ] intents mínimos documentados;
- [ ] mensajes/replies/attachments;
- [ ] embeds/components;
- [ ] edición;
- [ ] typing;
- [ ] permisos de guild;
- [ ] slash commands derivados del registry donde aplique;
- [ ] suite shared commands;
- [ ] Web/control plane muestra estado;
- [ ] desconexión no afecta otras plataformas.

## 6. i18n

- [ ] `es` completo;
- [ ] `en` completo;
- [ ] mismas claves e interpolaciones;
- [ ] auditor user-facing sin strings no permitidos;
- [ ] Web traducido;
- [ ] Android traducido;
- [ ] Desktop traducido;
- [ ] selección por usuario/chat/bot documentada;
- [ ] fallback español probado.

## 7. Descargas y proveedores prometidos

- [ ] X/Twitter live test;
- [ ] X/Twitter fallback;
- [ ] VK implementado;
- [ ] VK live test;
- [ ] XVideos regresión;
- [ ] XNXX regresión;
- [ ] Pornhub regresión;
- [ ] política 18+ y privacidad conservada;
- [ ] Uptodown;
- [ ] Aptoide;
- [ ] HappyMod;
- [ ] LiteAPKS;
- [ ] F-Droid;
- [ ] APK.Tools;
- [ ] AndroForever;
- [ ] APKMirror;
- [ ] APKPure;
- [ ] error público normalizado;
- [ ] timeout/retry/fallback por provider;
- [ ] cleanup de temporales;
- [ ] límites de tamaño;
- [ ] métricas por provider.

## 8. Termux Lite

- [ ] build Lite independiente;
- [ ] instalación limpia en Termux;
- [ ] update conserva sesión/config;
- [ ] Ollama/Web no se cargan;
- [ ] command registry Lite validado;
- [ ] Android 12–16 documentado/probado según matriz final;
- [ ] arm64 probado;
- [ ] reconexión Wi-Fi/datos;
- [ ] proceso/lockfiles robustos;
- [ ] reporte RSS/CPU/almacenamiento publicado;
- [ ] backup/restore o procedimiento equivalente validado.

## 9. Android oficial

### Remote Manager

- [ ] proyecto Android/Gradle creado;
- [ ] APK release firmado;
- [ ] Android Keystore para token del manager;
- [ ] conexión TLS a Control API;
- [ ] status/metrics/logs;
- [ ] start/stop/restart;
- [ ] update/rollback remoto;
- [ ] pairing;
- [ ] gestión WhatsApp/Telegram/Discord;
- [ ] subbots;
- [ ] configuración/i18n;
- [ ] reconexión de la app;
- [ ] CI Android genera artefacto + SHA-256.

### On-device

- [ ] runtime empacado sin Termux;
- [ ] foreground service;
- [ ] Android 13–16;
- [ ] arm64;
- [ ] Doze/reanudación;
- [ ] Wi-Fi ↔ datos;
- [ ] pairing/re-pair;
- [ ] update/rollback runtime;
- [ ] 72 h soak.

Si esta segunda sección no está completa, el release debe describir Android como **Remote Manager** y no como runtime local 24/7 sin Termux.

## 10. Windows `.exe`

- [ ] Tauri/desktop app creada;
- [ ] adopta instalación PowerShell existente;
- [ ] instalador `.exe` CI;
- [ ] start/stop/restart;
- [ ] plataformas/pairing;
- [ ] logs/metrics;
- [ ] Ollama/Web opcionales;
- [ ] updater transaccional;
- [ ] rollback;
- [ ] uninstall preserva/elimina datos según elección;
- [ ] SHA-256;
- [ ] firma de código o estado de firma documentado.

## 11. Kali/Linux app

- [ ] desktop compartido compila Linux;
- [ ] `.deb`;
- [ ] AppImage o alternativa portable;
- [ ] XDG paths;
- [ ] user service opcional;
- [ ] no requiere GUI como root;
- [ ] actualización/rollback;
- [ ] Kali rolling x86_64 validado;
- [ ] Debian/Ubuntu compatibilidad declarada;
- [ ] SHA-256/provenance.

## 12. Web / Control API

- [ ] Control API versionada;
- [ ] bind loopback por defecto;
- [ ] autenticación por sesión/token bootstrap;
- [ ] roles owner/admin/viewer;
- [ ] secretos redactados;
- [ ] CSRF/origin protections según superficie;
- [ ] plataformas e instancias comunes;
- [ ] logs paginados;
- [ ] metrics;
- [ ] update progress;
- [ ] backup/restore;
- [ ] browser/proxy SSRF regression.

## 13. Seguridad

- [ ] `npm audit --omit=dev --audit-level=high` aceptable o excepciones documentadas;
- [ ] secret scan;
- [ ] `.env` no versionado;
- [ ] auth state no incluido en artefactos;
- [ ] logs redactados;
- [ ] URLs temporales no filtradas;
- [ ] dependencias/licencias revisadas;
- [ ] acciones admin con autorización;
- [ ] ningún endpoint ejecuta shell arbitrario;
- [ ] threat model actualizado.

## 14. Reliability

- [ ] restart del runtime;
- [ ] reboot host;
- [ ] caída de red;
- [ ] cambio de interfaz de red;
- [ ] provider externo caído;
- [ ] Ollama ausente;
- [ ] Web ausente;
- [ ] subbot crash aislado;
- [ ] disco temporal lleno manejado;
- [ ] update fallido hace rollback;
- [ ] sesión dañada tiene repair path;
- [ ] 72 h soak de release candidate.

## 15. CI/CD y release artifacts

- [ ] Linux validate;
- [ ] Windows validate;
- [ ] Android validate;
- [ ] adapters contract suite;
- [ ] i18n audit;
- [ ] provider fixtures;
- [ ] packaging desktop;
- [ ] APK artifact;
- [ ] checksums;
- [ ] SBOM;
- [ ] provenance/attestation;
- [ ] GitHub Release draft;
- [ ] rollback package disponible.

## 16. Release approval

Antes del tag final:

```text
RC commit: ______________________________
CI run:    ______________________________
Soak:      ______________________________
Windows:   ______________________________
Android:   ______________________________
Kali:      ______________________________
WA:        ______________________________
Telegram:  ______________________________
Discord:   ______________________________
Approved:  ______________________________
```

Solo después de esta aprobación se crea `v2.0.0` y se cambia el estado público de BETA a PRODUCCIÓN OFICIAL.
