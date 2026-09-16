# V2 UI Phase 4 — Web oficial y distribución multiplataforma

## Objetivo

La Web pública de Ghost Nexora Bot funciona también como centro oficial de distribución de las aplicaciones. Mantiene el lenguaje visual existente — AMOLED, superficies `ops-*`, azul/violeta y Operations Center — y añade descargas verificables para Android, Windows y Linux.

La Web **no compila ni firma dentro de una petición HTTP**. El proceso privilegiado pertenece a la VPS; Next.js únicamente lee un catálogo público y transmite archivos ya publicados.

## Superficies públicas

- `/` — portada pública existente con bloque de distribución oficial integrado.
- `/downloads` — centro oficial de descargas.
- `/api/releases` — catálogo JSON público de la versión publicada.
- `/api/releases/download?id=<artifact-id>` — descarga segura por ID, con `HEAD`, `Range`, ETag y SHA-256.

Los clientes nunca suministran una ruta de filesystem. `apps/web/lib/releases.ts` valida el ID, el nombre, el hash, el tamaño y que la ruta final permanezca dentro de `OFFICIAL_RELEASE_DIR`.

## Paquetes

| Plataforma | Artefacto | Uso |
| --- | --- | --- |
| Android | `.apk` | Ghost Nexora Manager para Android |
| Windows 10/11 x64 | NSIS `.exe` | Instalador de escritorio |
| Ubuntu / Debian | `.deb` | Paquete Linux integrado al sistema |
| Fedora / RHEL | `.rpm` | Paquete RPM cuando el bundler lo genera |
| Linux universal | `.AppImage` | Ejecutable portátil |

El `.rpm` es adicional. APK, NSIS, DEB y AppImage son obligatorios antes de que el publisher acepte una compilación como catálogo actual.

## Layout persistente VPS

En producción se utilizan rutas fuera del checkout Git:

```text
/var/lib/ghost-nexora-bot/
├── releases/                 # público para el servicio Web, no para escritura Web
│   ├── current.json
│   └── v2.0.0/<sha>/...
├── release-db/
│   └── releases.sqlite       # root-only: historial y fingerprints, NO secretos
├── release-secrets/          # root-only 0700
│   ├── signing.env           # 0600
│   ├── ghost-nexora-android-release.p12
│   ├── ghost-nexora-windows-release.pfx
│   ├── ghost-nexora-windows.key.pem
│   ├── ghost-nexora-windows.cert.pem
│   └── gnupg/
├── release-toolchain/
└── release-build/
```

El checkout `/opt/ghost-nexora-bot` puede actualizarse o sustituirse sin perder las identidades de firma.

## Claves y firmas

### Android

En la primera compilación VPS se genera una identidad RSA-4096 dentro de un PKCS#12 persistente. `apps/android/app/build.gradle.kts` consume:

- `GHOST_NEXORA_ANDROID_KEYSTORE`
- `GHOST_NEXORA_ANDROID_KEY_ALIAS`
- `GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD`
- `GHOST_NEXORA_ANDROID_KEY_PASSWORD`

Las actualizaciones reutilizan exactamente el mismo archivo/alias/password. Esto preserva la identidad de firma requerida para que Android acepte futuras actualizaciones sobre una instalación existente.

### Windows

La VPS conserva un PFX permanente. Hay dos modos:

- `self-signed`: fallback generado por la VPS para continuidad criptográfica y pruebas/distribución privada.
- `trusted`: PFX emitido por un proveedor de code-signing confiable.

Una firma autofirmada **no elimina las advertencias de SmartScreen para usuarios públicos**. Antes de una release pública final conviene sustituir el PFX fallback por un certificado de code-signing válido y configurar `WINDOWS_SIGNING_MODE=trusted`. La ruta y password permanecen en `release-secrets/signing.env`.

El cross-build Windows se realiza desde Linux con Tauri + `cargo-xwin`; la firma PE/NSIS se realiza con `osslsigncode`.

### Linux

La VPS genera y conserva una clave GPG RSA-4096. Cada publicación incluye:

- `SHA256SUMS.txt`
- `SHA256SUMS.txt.asc`
- `GHOST-NEXORA-RELEASE-PUBLIC.asc`

El catálogo registra el fingerprint, pero nunca la clave privada ni su passphrase.

## SQLite

`release-db/releases.sqlite` guarda únicamente metadata:

- builds/versiones publicadas;
- SHA/ref del código fuente;
- artefactos, arquitectura, distro, tamaño y SHA-256;
- estado/fingerprint de las identidades de firma.

No existen columnas para passwords, private keys, keystore blobs ni PFX blobs.

## Automatización en instalación y actualización

El `postinstall` existente instala/actualiza:

- `ghost-nexora-release-build.service`
- `ghost-nexora-release-build.timer`

La distribución automática requiere:

1. Linux/VPS con systemd;
2. ejecución root durante instalación/actualización;
3. `NEXORA_RUNTIME_PROFILE=full`;
4. `WEB_ENABLED=true`;
5. `OFFICIAL_DISTRIBUTION_ENABLED=true`.

`.env.example` activa la distribución para instalaciones VPS Web nuevas. Un operador puede desactivarla explícitamente con `OFFICIAL_DISTRIBUTION_ENABLED=false`.

El timer espera para no competir con `install.sh` o `update.sh` y ejecuta el build después. El builder usa `flock` para impedir dos compilaciones simultáneas.

## Comandos

Build/publicación manual:

```bash
sudo ghostnexorabot release-build
```

Equivalente desde el repositorio:

```bash
sudo npm run release:vps
```

El proceso:

1. detecta el SHA/ref instalado;
2. prepara/reutiliza toolchains;
3. genera o reutiliza identidades de firma;
4. compila Android;
5. compila DEB/AppImage/RPM;
6. cross-compila NSIS Windows;
7. firma y verifica artefactos;
8. calcula SHA-256;
9. firma el archivo de hashes con GPG;
10. publica `current.json` de forma atómica;
11. registra el build y fingerprints en SQLite.

## Frontera de seguridad

- Next.js no ejecuta Gradle, Cargo, keytool, GPG, OpenSSL ni osslsigncode.
- La Web no conoce la ruta de `release-secrets` ni passwords.
- Las descargas públicas se resuelven por IDs permitidos, no rutas arbitrarias.
- El directorio de claves es `0700` y sus archivos sensibles `0600`.
- El directorio de releases es de solo lectura para el usuario del servicio Web.
- El publisher no acepta un catálogo sin APK, NSIS, DEB y AppImage.
- `current.json` se reemplaza atómicamente solo después de publicar todos los artefactos.
- Cada artefacto expone SHA-256 y fuente exacta para trazabilidad.

## CI

Phase 7 ejecuta:

- `v2-phase7-distribution-smoke.mjs`
- `v2-phase7-distribution-audit.mjs`

El smoke valida publicación, catálogo y SQLite con artefactos sintéticos. El audit valida fronteras Web/builder, scripts Bash, formatos, persistencia de firmas y ausencia de secretos en la base pública/metadata.

Los workflows nativos existentes siguen compilando Android, Windows y Linux de forma independiente, por lo que cambios en las apps continúan cubiertos por las regresiones Phase 7/8.

## Limitación antes de v2.0.0 final

La infraestructura ya soporta una identidad Windows persistente, pero una release pública final debe usar un certificado confiable si se desea evitar advertencias de confianza de Windows/SmartScreen. El fallback autofirmado no debe presentarse como equivalente a una firma comercial confiable.
