# V2 Phase 7 — Official applications

## Goal

Ship the first official management clients for Ghost Nexora Bot without embedding platform-specific bot logic inside each GUI.

Phase 7 is stacked on Phase 6. It does not merge or rewrite the previous PR chain.

## Architecture

```text
Android Remote Manager ─┐
Windows Tauri Manager ──┼── Control API V2 ── Ghost Nexora Bot runtime
Kali/Linux Tauri Manager┘
```

The Control API is the only supported application boundary. Clients do not edit SQLite, session credentials or internal JSON files.

### Control API V2

Shared contract: `packages/control-api-contracts`.

Endpoints:

- `GET /health`
- `GET /v2/status`
- `GET /v2/metrics`
- `GET /v2/logs?cursor=`
- `POST /v2/runtime/start`
- `POST /v2/runtime/stop`
- `POST /v2/runtime/restart`
- `POST /v2/runtime/update`
- `POST /v2/pair/start`
- `GET /v2/pair/status`
- `GET /v2/config`
- `PATCH /v2/config`
- `GET /v2/platforms`
- `POST /v2/platforms/:id/connect`
- `POST /v2/platforms/:id/disconnect`

All `/v2/*` endpoints require the installation bearer token. The runtime continues listening on `127.0.0.1` by default. Remote exposure must terminate TLS in a trusted reverse proxy; clients reject plain HTTP for non-loopback hosts.

The existing `/control` endpoint remains available for the current Web operations console.

### Runtime lifecycle

`runtime/update` is executable from the running bot because it only writes the fixed `update-request` signal consumed by the existing privileged updater.

`runtime/start|stop|restart` intentionally reports `managerRequired` from the in-process server. A process cannot honestly guarantee its own host lifecycle. Windows and Linux desktop apps provide a native fixed-service manager for these actions. A persistent remote host manager for Android lifecycle across a stopped bot remains a release gate before Phase 7 is declared fully complete.

No endpoint accepts executable names, shell snippets or arbitrary command arguments.

## Windows and Kali/Linux

`apps/desktop` is one Tauri 2 + React/TypeScript application.

Current pinned line:

- Tauri runtime `2.11.5`
- Tauri CLI `2.11.4`
- React 19

Security boundary:

- Rust performs authenticated HTTP calls.
- Remote HTTP is rejected; HTTPS is mandatory.
- Native service actions accept only `start`, `stop`, `restart`, `status`.
- Executables/service names are fixed literals.
- No `cmd.exe`, PowerShell, `/bin/sh`, `bash -c` or user-built shell command is used.

Bundles:

- Windows: NSIS `.exe`
- Kali/Debian/Ubuntu: `.deb` + AppImage

The existing PowerShell installer remains a recovery/install alternative and is not removed.

## Android

`apps/android` is the official **Remote Manager**.

It is not Termux and it does not run Node.js/Baileys on-device.

Toolchain:

- AGP `9.4.0`
- Gradle `9.6.0`
- JDK 17
- Kotlin / Compose compiler `2.3.21`
- `compileSdk 37`
- `targetSdk 36` (Android 16)
- `minSdk 33` (Android 13)
- Compose BOM `2026.08.00`

Security:

- bearer token encrypted with AES-256-GCM using Android Keystore
- backups disabled
- cleartext traffic globally disabled
- local HTTP limited to loopback/emulator development
- remote hosts require HTTPS in application code as well
- QR/pairing data is never persisted by the secure token store

The on-device runtime remains a later conditional objective and is not claimed by this phase.

## Validation

`npm run v2:official-apps` validates:

1. shared Control API contracts build;
2. bot runtime builds against the contract;
3. desktop frontend builds;
4. authenticated HTTP Control API smoke;
5. token redaction;
6. safe update request;
7. platform connect/disconnect boundary;
8. Desktop shell/process audit;
9. Android Keystore/HTTPS/Remote Manager audit.

`.github/workflows/v2-phase7.yml` additionally builds platform artifacts:

- Windows NSIS installer + SHA-256
- Linux `.deb` + AppImage + SHA-256
- Android debug APK + unsigned release APK + SHA-256

It also runs the complete Phase 0–6 regression, Termux Lite and the frozen WhatsApp command fingerprint.

## Definition of done

Phase 7 can be marked complete only when:

- Control API V2 is green;
- all Phase 0–6 regression gates remain green;
- Windows NSIS builds successfully;
- Linux `.deb` and AppImage build successfully;
- Android lint/tests/APKs build successfully;
- command registry fingerprint remains compatible;
- Valley `.edit` parity remains green through main CI;
- artifacts contain checksums;
- no client accepts arbitrary shell execution;
- remote Android lifecycle is either backed by a persistent host manager or explicitly kept out of the final Phase 7 completion claim.

Production signing, SBOM/provenance and release-channel rollout are Phase 8 release gates.
