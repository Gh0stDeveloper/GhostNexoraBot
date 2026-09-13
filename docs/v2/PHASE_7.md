# V2 Phase 7 — Official applications

## Status

**Phase 7 is complete.**

Validated implementation branch: `feat/v2-phase-7-official-apps`  
Base branch: `feat/v2-phase-6-i18n`  
Validated implementation HEAD: `67afd98304922f4b218086b7cd5c86ee72c5be76`  
Validated Phase 7 workflow run: `34780941051`

This phase is intentionally stacked on Phase 6. It does not merge, squash or rewrite the previous V2 phase chain.

The validated implementation HEAD passed:

- full workspace typecheck and build;
- Phase 0 contracts;
- Phase 1 WhatsApp adapter;
- Phase 2 UI compatibility;
- Phase 3 provider regression;
- Phase 4 Telegram;
- Phase 5 Discord;
- Phase 6 i18n;
- Phase 7 Control API / official-app boundary;
- Termux Lite build and smoke;
- frozen WhatsApp command-surface regression;
- Android lint, unit tests and APK builds;
- Linux Tauri `.deb` and AppImage packaging;
- Windows Tauri NSIS `.exe` packaging;
- SHA-256 generation for platform artifacts.

Main CI on the same implementation HEAD also passed, including the existing compatibility gates such as the Valley `.edit` parity checks. Phase 7 does not modify or replace the special `.edit` implementation.

## Goal delivered

Phase 7 ships the first official management clients for Ghost Nexora Bot without duplicating bot/platform internals inside each GUI.

The delivered management surfaces are:

- Android native Remote Manager;
- Windows desktop manager;
- Kali/Debian/Ubuntu desktop manager;
- persistent host-side Manager Agent;
- shared Control API V2 contracts.

The applications operate through an authenticated application boundary instead of editing session credentials, SQLite, internal JSON or bot implementation files directly.

## Final architecture

```text
Android Remote Manager ───────────────┐
Windows Tauri Manager ────────────────┼── HTTPS + Bearer ── reverse proxy /manager/
Kali/Linux Tauri Manager ─────────────┘                         │
                                                               ▼
                                                127.0.0.1 Manager Agent
                                                    │          │
                                                    │          └── fixed systemd lifecycle
                                                    │              ghost-nexora-bot.service
                                                    ▼
                                             Control API V2
                                                    │
                                                    ▼
                                           Ghost Nexora Bot
```

The persistent Manager Agent is the host lifecycle boundary that was previously missing from the first Phase 7 draft. It now exists in `apps/manager-agent`, is installed by the VPS installer path, is protected by bearer authentication, binds to loopback, and can control only the fixed Ghost Nexora Bot service with a constrained action set.

This means Android can remotely request lifecycle actions even when the bot process itself is stopped, because the host Manager Agent remains available independently of the bot runtime.

## Control API V2

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

All `/v2/*` endpoints require the installation bearer token. Local services listen on loopback by default. Remote access must terminate TLS in a trusted reverse proxy; official clients reject plain HTTP for non-loopback hosts.

The legacy `/control` endpoint remains available for the existing Web operations console.

## Runtime lifecycle boundary

The final lifecycle model is split deliberately:

1. The in-process bot Control API exposes bot-owned operations and status.
2. The persistent Manager Agent owns host lifecycle actions that cannot safely be guaranteed by the process being stopped/restarted.
3. The Manager Agent accepts only the fixed runtime actions and the fixed service `ghost-nexora-bot.service`.
4. No API route accepts arbitrary executable paths, shell snippets or free-form process arguments.

`runtime/update` preserves the fixed `update-request` signal consumed by the existing privileged update flow.

Security controls covered by Phase 7 audits include:

- bearer authentication before protected routes;
- constant-time token comparison in the Manager Agent;
- loopback binding for host services;
- fixed service name;
- fixed lifecycle action allowlist;
- no `cmd.exe`, PowerShell command bridge, `/bin/sh`, `bash -c`, `sh -c` or user-composed shell command boundary;
- hardened systemd service configuration for the Manager Agent.

## Persistent Manager Agent

Relevant files:

- `apps/manager-agent/src/index.ts`
- `systemd/ghost-nexora-manager.service`
- `scripts/install-manager-api.sh`
- `scripts/v2-phase7-manager-agent-smoke.mjs`

The systemd unit runs with the privileges required to control the fixed bot service, while applying service hardening such as `NoNewPrivileges=true`, `ProtectSystem=strict` and a constrained writable state path.

The installer integrates the Manager Agent into the existing VPS/reverse-proxy deployment path. The updater/install flow keeps the manager endpoint under `/manager/` and proxies it to loopback rather than exposing the internal listener directly.

## Windows and Kali/Linux desktop application

`apps/desktop` is a single Tauri 2 + React/TypeScript application.

Current pinned line validated by Phase 7:

- Tauri runtime `2.11.5`;
- Tauri CLI `2.11.4`;
- React 19.

Security boundary:

- Rust performs authenticated Control API HTTP calls;
- remote HTTP is rejected and HTTPS is mandatory;
- native service actions accept only the constrained lifecycle actions;
- executable/service targets are fixed literals;
- no general shell is exposed to UI input.

Validated bundles:

- Windows: NSIS `.exe`;
- Kali/Debian/Ubuntu: `.deb`;
- Linux portable: AppImage.

The existing PowerShell installer remains a recovery/install alternative and was not removed.

### Reproducible desktop icon pipeline

The authoritative desktop application icon source is now:

`apps/desktop/app-icon.svg`

The previous binary PNG source was removed after CI proved that its PNG `IDAT` chunk had an invalid CRC. Native icon binaries are generated during validation/build through the official Tauri icon generator:

```text
tauri icon app-icon.svg
```

This produces the platform-specific files consumed by Tauri, including square PNGs, `icon.ico` and `icon.icns`. `tauri:check` and `tauri:build` both generate the icon set before Cargo/package operations, preventing a clean checkout from depending on untracked local icon binaries.

Tauri reference used for this repair: `https://v2.tauri.app/develop/icons/`.

## Android official Remote Manager

`apps/android` is the official native Android Remote Manager.

It is not Termux and it does not embed Node.js/Baileys on-device.

Validated toolchain:

- AGP `9.4.0`;
- Gradle `9.6.0`;
- JDK 17;
- Kotlin / Compose compiler `2.3.21`;
- `compileSdk 37`;
- `targetSdk 36`;
- `minSdk 33`;
- Compose BOM `2026.08.00`.

Security:

- bearer token encrypted with AES-256-GCM through Android Keystore;
- backups disabled;
- cleartext traffic globally disabled;
- local HTTP limited to loopback/emulator development;
- remote hosts require HTTPS in application code;
- QR/pairing material is not persisted by the secure token store;
- lifecycle actions travel through the authenticated Manager Agent / Control API boundary rather than executing Android-side shell commands.

The on-device WhatsApp bot runtime is **not** claimed by Phase 7. Termux Lite remains the supported on-device runtime path; the official Android app delivered here is a remote manager.

## CI evidence

### Validated implementation HEAD

`67afd98304922f4b218086b7cd5c86ee72c5be76`

### Phase 7 workflow

Run: `34780941051`

Successful jobs:

| Job | Job ID | Result |
| --- | ---: | --- |
| Contracts and regression | `103787716849` | success |
| Android Remote Manager | `103787716956` | success |
| Linux desktop | `103787716928` | success |
| Windows desktop | `103787716896` | success |

The contracts/regression job passed the complete Phase 0–7 chain, Termux Lite, command inventory and compatibility fingerprint.

### Main CI on the same implementation HEAD

Successful checks include:

- `validate` — `103787716848`;
- `windows-installer` — `103787716733`;
- `contracts-and-baseline` — `103787716837`.

### Artifacts

Artifacts from workflow `34780941051`:

| Artifact | Artifact ID | Digest |
| --- | ---: | --- |
| `v2-phase7-evidence` | `10325237288` | `sha256:1fe7c720e50bdbeae6de658c282979b518bc792fa5d8ea5777841381717deb1c` |
| `ghost-nexora-manager-android` | `10325046681` | `sha256:a056a73897453fd1ba87a8c9f46cc741c39561cb2a16b63915151b203e842044` |
| `ghost-nexora-manager-linux` | `10324833476` | `sha256:9207772f1091a1b16cd49301b28b1988fb297bad41358f1d1440fda8223f7a45` |
| `ghost-nexora-manager-windows` | `10324758616` | `sha256:80326c5ad2cfa9b3c89babe488235e7f5a12444cf0b100303a68acc1810c247b` |

Artifacts are retained by the Phase 7 workflow for 30 days. Each platform artifact includes the SHA-256 evidence generated by its job.

## Errors found and resolved while closing Phase 7

### 1. Windows NSIS could not find `icon.ico`

Previous failing job: `103227484911`.

Symptom: Tauri attempted to package the Windows application but the required Windows icon asset did not exist in a clean CI checkout.

Root cause: the original Phase 7 desktop project relied on an incomplete icon directory and did not reproducibly generate the platform-specific icon set.

Resolution: add an explicit Tauri icon-generation step shared by `tauri:check` and `tauri:build`, and declare the generated bundle icons in `tauri.conf.json`.

### 2. Linux AppImage could not find a square icon

Previous failing job: `103227484814`.

Symptom: the Linux `.deb` was successfully produced, but AppImage packaging stopped with `couldn't find a square icon to use as AppImage icon`.

Root cause: same incomplete desktop icon pipeline. The AppImage bundler requires an appropriate square icon.

Resolution: the generated Tauri icon set now contains the required square PNG assets and is declared in `bundle.icon`. The validated run produced both `.deb` and AppImage successfully.

### 3. First icon-pipeline repair exposed a corrupt PNG

Intermediate repair run: `34780752727`.

Observed error:

```text
failed to read and decode source image src-tauri/icons/icon.png
Format error decoding Png: CRC error
while decoding IDAT
```

Root cause: the old committed `icon.png` was structurally corrupt even though basic metadata readers could identify nominal dimensions.

Resolution:

- delete the corrupt PNG source;
- create `apps/desktop/app-icon.svg` as the authoritative vector source;
- generate all native icon binaries from that SVG during clean builds;
- extend `scripts/v2-phase7-official-apps-audit.mjs` so future changes must preserve the reproducible icon pipeline.

Final proof: both Windows NSIS and Linux AppImage packaging are green in run `34780941051`.

## Definition of done — final result

Phase 7 requirements are satisfied:

- [x] Control API V2 green;
- [x] persistent Manager Agent implemented and tested;
- [x] remote lifecycle works through an independent host-side service;
- [x] Phase 0–6 regression gates remain green;
- [x] Windows NSIS builds successfully;
- [x] Linux `.deb` builds successfully;
- [x] Linux AppImage builds successfully;
- [x] Android lint/tests pass;
- [x] Android debug and unsigned release APKs build successfully;
- [x] command registry fingerprint remains compatible;
- [x] Valley `.edit` parity remains protected by main CI;
- [x] artifacts contain SHA-256 evidence;
- [x] no official client exposes arbitrary shell execution;
- [x] desktop icon generation is reproducible from a valid source asset.

There is no known Phase 7 code blocker remaining at the validated implementation HEAD.

## What remains after Phase 7

The remaining V2 work belongs to **Phase 8 — production hardening and 2.0.0 release**, not to unfinished Phase 7 functionality.

Phase 8 should cover at minimum:

1. Production signing and release identity:
   - Android release signing and final APK/AAB policy;
   - Windows Authenticode/code-signing path when a signing identity is available;
   - release provenance for Linux artifacts.
2. Supply-chain evidence:
   - SBOM generation;
   - checksums/attestations in release assets;
   - dependency/security audit gates.
3. Release-channel hardening:
   - version transition to `2.0.0`;
   - upgrade compatibility from current installations without deleting persistent state;
   - release and rollback procedure;
   - final installer/updater verification for VPS, Termux, Windows and official managers.
4. Production stability gate:
   - long-running soak of at least 72 hours;
   - reconnect/restart/update recovery;
   - multi-platform WhatsApp/Telegram/Discord coexistence;
   - subbot isolation and no state leakage;
   - provider degradation/fallback observations;
   - memory/CPU/disk/log growth checks.
5. Final release documentation:
   - migration notes;
   - public V2 feature matrix;
   - known limitations;
   - release notes/changelog;
   - operator rollback and recovery instructions.

Any new issue discovered by Phase 8 soak testing should be documented in the Phase 8 handoff rather than reopening Phase 7 unless it directly invalidates a Phase 7 acceptance criterion.

## Exact handoff for a new chat

Use this repository and branch as the source of truth:

- repository: `Gh0stDeveloper/GhostNexoraBot`;
- Phase 7 branch: `feat/v2-phase-7-official-apps`;
- Phase 7 base: `feat/v2-phase-6-i18n`;
- validated implementation HEAD: `67afd98304922f4b218086b7cd5c86ee72c5be76`;
- validated Phase 7 run: `34780941051`;
- read this file first: `docs/v2/PHASE_7.md`.

Recommended continuation instruction for a new chat:

> Continue Ghost Nexora Bot from Phase 7. First inspect the current HEAD of `feat/v2-phase-7-official-apps` and read `docs/v2/PHASE_7.md`; do not assume the SHA without checking GitHub. Phase 7 implementation was validated at `67afd98304922f4b218086b7cd5c86ee72c5be76` with workflow `34780941051` and all Android/Windows/Linux/regression jobs green. Preserve the stacked V2 branch/PR chain and do not merge unless I explicitly ask. Start Phase 8: production hardening and release 2.0.0, including signing/release identity, SBOM/provenance, installer/updater migration safety, a >=72h soak gate, rollback/recovery and final release documentation.

The documentation commit containing this handoff follows the validated implementation HEAD and does not change the application/runtime implementation. Always query the live branch HEAD before starting the next phase.
