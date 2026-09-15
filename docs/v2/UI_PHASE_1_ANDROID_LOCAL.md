# V2 UI Phase 1 — Android local runtime

## Scope

This phase changes the official Android application from a remote-only manager into a **local-first Ghost Nexora Bot controller**.

The Android application remains a native Kotlin/Jetpack Compose UI. The bot itself runs inside the installed Termux environment, which provides Node.js, Git, FFmpeg and the process environment required by Baileys and the existing Termux Lite runtime.

Remote Manager support is retained as an optional secondary mode for VPS/other installations. It is no longer required for normal Android operation.

## Architecture

```text
Ghost Nexora Android (Compose)
        |
        | com.termux.permission.RUN_COMMAND
        v
Termux RunCommandService
        |
        | fixed Ghost Nexora command surface
        v
$PREFIX/bin/ghostnexora
        |
        +-- install/update repository + dependencies
        +-- start / stop / restart
        +-- WhatsApp pair QR / code
        +-- status / logs
        +-- bot settings
        +-- optional loopback Web Lite
        |
        v
Ghost Nexora Bot · termux-lite
```

The app does not expose a user-controlled shell. It can only invoke predefined Ghost Nexora operations through `LocalRuntimeBridge.kt`. Runtime arguments that contain user data are validated before execution.

## First-run flow

1. Detect Termux.
2. If missing, direct the user to the F-Droid Termux package.
3. Require the Termux `RUN_COMMAND` permission.
4. Require Termux `allow-external-apps=true` as mandated by the Termux RUN_COMMAND API.
5. Run the fixed installer bootstrap.
6. Install/update required packages in Termux.
7. Clone `Gh0stDeveloper/GhostNexoraBot`.
8. Run `scripts/install-termux.sh` non-interactively.
9. Install dependencies and build `dist-termux`.
10. Install the fixed `ghostnexora` command.
11. Start the local runtime.
12. Return status to the Compose dashboard.

GitHub Actions builds inject the source branch/tag into `BuildConfig.GHOST_NEXORA_SOURCE_REF`. This means an APK created from a feature branch tests the exact branch it came from. Normal builds outside CI default to `main`.

## Persistent storage

Default Termux paths remain compatible with Termux Lite:

```text
$HOME/GhostNexoraBot/       repository/runtime
$HOME/.ghostnexora/session/ WhatsApp session
$HOME/.ghostnexora/data/    application data
$HOME/.ghostnexora/logs/    runtime logs
$HOME/.ghostnexora/run/     pid/pairing state
```

Updates do not intentionally remove session or data directories.

## Android UI

The Phase 1 navigation remains:

- Home
- Pair
- Activity
- Settings

### Home

Home now represents the local server lifecycle. It distinguishes:

- Termux missing;
- RUN_COMMAND permission required;
- Termux external-app configuration required;
- runtime not installed;
- installation in progress;
- server ready;
- runtime offline/starting/online.

When ready, Home exposes the constrained local actions:

- start;
- stop;
- restart;
- update.

It also shows runtime version, Node version, pairing state, Web state and platform status.

### WhatsApp pairing

`apps/bot/src/pair.ts` now supports a machine-readable event mode without removing the human CLI flow.

The Android app starts pairing in the background using:

- `app-pair-start qr`
- `app-pair-start code <phone>`
- `app-pair-status`
- `app-pair-cancel`

Pair events include raw QR data, phone pairing code, accepted state, linked state and errors. Compose renders the QR natively with ZXing.

The local bot is stopped for pairing when necessary and restarted automatically when the pairing process finishes if it had previously been running.

### Activity

The app retrieves the latest local runtime logs with `app-logs`. It does not attach an unbounded `tail -f` process through Android.

### Settings

Settings includes:

- bot display name;
- command prefix;
- Spanish/English runtime language;
- local engine/version status;
- persistent storage paths;
- local Web toggle;
- optional remote Manager credentials.

Remote credentials continue to use Android Keystore through the existing secure token store, and non-loopback remote control still requires HTTPS.

## Local Web policy

The local Web is **OFF by default**.

`scripts/install-termux.sh` writes:

```text
TERMUX_LOCAL_WEB_ENABLED=false
```

When the user enables Web from Android Settings, `ghostnexora web on` changes that flag and restarts the runtime if necessary.

Android/Termux Lite does **not** start or install the Next.js workspace, Nginx or systemd. The optional Web surface is a lightweight status page served by the existing loopback health server at:

```text
http://127.0.0.1:3001/
```

It is bound to loopback and is intended for the local device only.

## Local command boundary

The Android UI can request only these local operations:

```text
start
stop
restart
update
app-status
app-logs
app-pair-start
app-pair-status
app-pair-cancel
app-config-set
web on|off
```

`LocalRuntimeBridge.kt` always targets the fixed Termux executable paths and does not accept executable paths or arbitrary command strings from UI input.

The one-time install command is also fixed application code. It clones only the Ghost Nexora repository and invokes the repository's own Termux installer.

## Termux requirements

The integration uses the official Termux `RUN_COMMAND` service. A compatible Termux installation must support command results through PendingIntent (Termux >= 0.109 behavior).

The user must:

1. install Termux;
2. grant `com.termux.permission.RUN_COMMAND` to Ghost Nexora Bot;
3. configure `allow-external-apps=true` in Termux properties.

These are one-time environment requirements. Daily start/stop/update/pair/log/config operations are performed from the Ghost Nexora Android UI.

## Runtime profile and limitations

Android uses `NEXORA_RUNTIME_PROFILE=termux-lite`.

By design this profile keeps mobile resource use lower and does not enable:

- Ollama/LLM runtime;
- the full Next.js Web workspace;
- Nginx;
- systemd;
- the VPS browser proxy.

Subbots and the existing Termux-compatible command surface remain available according to the Termux Lite implementation.

## Security properties

- Android backups remain disabled.
- Global cleartext traffic remains disabled except explicit loopback rules.
- Remote Manager HTTP remains rejected outside loopback/emulator development.
- Remote bearer credentials remain Android-Keystore protected.
- Termux result service is not exported.
- Local command paths are fixed.
- No `Runtime.getRuntime()` or `ProcessBuilder` shell bridge exists in Android.
- Local Web is disabled by default and loopback-bound when enabled.
- Pairing QR/code material is transient and read from the local pairing process rather than stored by the Android token store.

## Branch policy

Implementation branch:

`feat/v2-ui-phase-1-android-local-runtime`

It is stacked on:

`feat/v2-ui-phase-1-android`

This phase must remain unmerged until explicitly approved. Phase 2 Windows and Phase 3 Linux should use the same local-first product model while adapting the runtime manager to each desktop operating system.
