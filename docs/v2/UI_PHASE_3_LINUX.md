# UI Phase 3 — Linux local-first desktop

## Objective

The official Linux `.deb` and AppImage are no longer treated as remote-only dashboards. On Linux, Ghost Nexora Manager is the primary installer, launcher and controller for a per-user Ghost Nexora Bot runtime.

## Runtime layout

```text
~/.local/share/ghost-nexora/
├── bot/                 # pinned Git checkout
├── runtime/
│   ├── node/            # per-user Node.js 24 when system Node is insufficient
│   └── bin/yt-dlp
├── state/
│   ├── .env             # mode 0600
│   ├── source-ref
│   ├── session/
│   └── data/
├── downloads/
├── logs/
└── run/
```

The application uses `XDG_DATA_HOME` and `XDG_CONFIG_HOME` when the desktop environment defines them.

## First run

1. Detect system prerequisites.
2. Request PolicyKit authorization only if OS packages such as Git/FFmpeg/Python are missing.
3. Prepare a Node.js 24 runtime inside the user profile if the installed Node/npm versions are too old.
4. Download a local `yt-dlp` binary.
5. Clone `Gh0stDeveloper/GhostNexoraBot` and pin the exact branch/tag/SHA embedded in the desktop build.
6. Create the private runtime `.env` outside the repository.
7. Force `WEB_ENABLED=false` and `OLLAMA_ENABLED=false` for the initial local install.
8. Install only the bot workspace dependencies and build the runtime.
9. Create `ghost-nexora-bot.service` under `~/.config/systemd/user` when the user systemd instance is available.
10. Fall back to a PID-managed background process when `systemd --user` is unavailable.
11. Start the bot and connect the desktop UI directly to `http://127.0.0.1:3001` with the generated local token kept in application memory.

## Linux UX

Linux defaults to **Local mode**. It does not request a Manager Agent URL or token during normal use.

The app exposes:

- local install state;
- start / stop / restart;
- safe Git update with rollback;
- repair/rebuild;
- WhatsApp QR or phone-code pairing;
- platform controls;
- metrics and logs;
- local filesystem paths;
- source ref and current commit;
- Web opt-in;
- optional remote-server mode.

## Web policy

The Next.js dashboard is OFF by default. Enabling it from Settings:

1. installs the Web workspace dependencies;
2. builds Next.js;
3. changes `WEB_ENABLED=true`;
4. starts a per-user Web service;
5. binds it to `127.0.0.1:3000` only.

Disabling Web stops the service, restores `WEB_ENABLED=false`, and restarts the bot so its public configuration reflects the change.

No Nginx, public domain or TLS configuration is installed in local mode.

## Updates and rollback

Persistent session/data/downloads/logs live outside the Git checkout. During an update the runtime:

1. records the previous commit;
2. stops the bot when needed;
3. fetches the pinned source ref;
4. checks out the fetched commit detached;
5. reinstalls dependencies and rebuilds;
6. recreates the per-user unit;
7. restarts the bot if it was running.

If the update/build fails, the previous commit is restored and rebuilt before returning an error.

## Security boundary

The Tauri bridge does not expose a generic terminal. It accepts only:

- `probe`
- `install`
- `start`
- `stop`
- `restart`
- `update`
- `repair`
- `web-on`
- `web-off`
- `connection`
- `owner-set`

The embedded runtime script rejects unsupported source refs and does not use `eval`, `bash -c`, `sh -c`, PowerShell or `cmd.exe`.

The bot token is stored only in `state/.env` with mode `0600`. The desktop frontend obtains it through the native bridge only for the current process and does not persist it in localStorage.

## Remote mode

`Administrar otro servidor` remains available for VPS/remote installations. Existing rules remain unchanged:

- HTTPS required outside loopback;
- Control API allowlist only;
- access token in memory only;
- no arbitrary remote process execution.

## Validation

Phase 3 is complete only after the exact final commit passes:

- TypeScript typecheck and Vite build;
- Linux local runtime audit;
- Bash syntax validation;
- Rust/Tauri check;
- `.deb` build;
- AppImage build;
- Phase 7 official-app boundary tests;
- Phase 8 release regressions;
- Android and Windows regressions from the stacked phases.
