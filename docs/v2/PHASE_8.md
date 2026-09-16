# V2 Phase 8 — Production hardening and 2.0.0 release

## Status

**Implementation branch:** `feat/v2-phase-8-production-release`  
**Base:** `feat/v2-phase-7-official-apps`  
**Target release:** `2.0.0`

Phase 8 converts the validated Phase 7 implementation into a production-release pipeline. It does **not** merge, squash, or rewrite the previous V2 phase chain.

Phase 7 is closed and green. Phase 8 must not be declared fully released until the operational release gates below are satisfied with real evidence. In particular, CI must never fake signing credentials or a 72-hour soak period.

## Release gates inherited from Phase 7

A `2.0.0` public release requires all of the following:

1. production signing and release identity;
2. SBOM plus artifact provenance/attestation;
3. migration-safe installer/updater behavior that preserves existing installations and secrets;
4. a tested rollback/recovery path;
5. at least 72 hours of soak/reliability validation;
6. final public/operator release documentation.

## 1. Production identity and signing

The official application/runtime identity is `2.0.0`.

### Android

- application id remains `com.ghostnexora.manager`;
- `versionCode = 2000000`;
- `versionName = 2.0.0`;
- release signing is read only from environment secrets;
- the keystore and passwords are never committed to Git;
- the production workflow verifies the generated APK with `apksigner`.

Required repository secrets for the production workflow:

- `GHOST_NEXORA_ANDROID_KEYSTORE_BASE64`;
- `GHOST_NEXORA_ANDROID_KEY_ALIAS`;
- `GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD`;
- `GHOST_NEXORA_ANDROID_KEY_PASSWORD`.

### Windows

The NSIS installer is built as `2.0.0` and Authenticode-signed before it is accepted as a production artifact.

Required repository secrets:

- `WINDOWS_CERTIFICATE_BASE64` — base64-encoded PFX;
- `WINDOWS_CERTIFICATE_PASSWORD`.

The workflow verifies that the final installer has a valid Authenticode signature. An unsigned installer remains suitable only for CI/regression and must not be published as the production 2.0.0 installer.

### Linux

The `.deb` and AppImage are accompanied by SHA-256 checksums and an armored detached GPG signature.

Required repository secrets:

- `GPG_PRIVATE_KEY`;
- `GPG_SIGNING_KEY_ID`.

## 2. SBOM and provenance

The release workflow generates a CycloneDX SBOM using the npm dependency graph and uploads it with the release evidence.

GitHub build provenance is generated for the release artifacts through GitHub artifact attestations. The workflow requires `id-token: write` and `attestations: write`; no long-lived attestation credential is stored in the repository.

Every published binary must be traceable to the exact Git commit used by the release workflow.

## 3. Migration-safe update path

Phase 8 introduces:

- `scripts/release-state.sh`;
- `scripts/release-update.sh`;
- `scripts/release-rollback.sh`.

The existing `scripts/update.sh`, Termux updater, Windows installer, first-install flow, and legacy supported paths remain present for compatibility.

The production release updater accepts only:

- a semantic release tag such as `v2.0.0`; or
- an explicit full 40-character commit SHA.

Before changing the active checkout it:

1. verifies the configured Git origin;
2. fetches and resolves the requested release target;
3. creates an isolated checkout;
4. installs dependencies there;
5. runs full typecheck/build;
6. runs the Phase 8 release gate in install mode;
7. records which Bot/Web/Manager services were active;
8. stops those runtime services so SQLite/session state is quiescent;
9. creates a protected snapshot of `.env`, legacy install-local state and current VPS state under `/var/lib/ghost-nexora-bot`, including `data`, sessions, database paths and downloads;
10. activates and builds the target;
11. restores persistent state and the previous service enablement/activity behavior.

If activation fails after the cutover begins, an `ERR` trap resets the installation to the previous SHA, rebuilds it, restores the persistent snapshot and restores the services that were active before the update.

The updater never accepts arbitrary shell fragments or executable paths from user input.

Production upgrade command after `v2.0.0` passes every production gate:

```bash
sudo bash /opt/ghost-nexora-bot/scripts/release-update.sh v2.0.0
```

Using `bash` explicitly keeps the procedure valid even on checkouts where Git file-mode metadata is unavailable.

## 4. Rollback/recovery

Snapshots are stored under:

`/var/lib/ghost-nexora-bot/releases/<UTC timestamp>`

with directory mode `0700` and a manifest containing the original commit SHA.

Rollback command:

```bash
sudo bash /opt/ghost-nexora-bot/scripts/release-rollback.sh latest
```

or, for a specific retained snapshot:

```bash
sudo bash /opt/ghost-nexora-bot/scripts/release-rollback.sh <snapshot-id>
```

Rollback only accepts snapshot IDs matching a constrained identifier grammar and only restores a Git commit recorded by a generated snapshot manifest.

Before manual rollback changes the current installation, it stops the runtime services and creates a **rescue snapshot of the current state**. If the requested rollback itself fails, the script attempts to restore that rescue SHA/state and the services that were active before rollback. The rescue snapshot is retained after a successful rollback for an additional recovery path.

CI also runs `scripts/v2-phase8-release-state-smoke.sh`, which creates temporary install/VPS state, snapshots `.env`, legacy data, VPS database data and WhatsApp session data, mutates them, restores the snapshot and verifies byte-level test contents are back to the originals.

Before public release, perform at least one staging exercise covering:

1. upgrade from the current production version to the candidate;
2. verification that `.env`, sessions, database/data and downloads remain present;
3. forced activation/build failure;
4. automatic rollback;
5. manual rollback from the retained snapshot;
6. verification that WhatsApp session, Web state, Manager Agent and optional LLM/Web enablement remain correct.

Record the staging run URL/log in the release evidence.

## 5. 72-hour soak gate

A production `2.0.0` publication requires a real continuous soak of **at least 72 hours** on the candidate commit.

The start timestamp is supplied to the production workflow as ISO-8601 input. `scripts/v2-phase8-release-gate.mjs --mode=release` calculates elapsed wall-clock time and refuses publication before 72 hours have actually elapsed.

Recommended soak observations:

- bot service uptime/restarts;
- WhatsApp reconnect behavior;
- memory and CPU trend;
- browser proxy health;
- Manager Agent health and authorization failures;
- Web health when enabled;
- SQLite/data integrity;
- command regression sampling;
- optional LLM worker behavior when enabled;
- no loss of session credentials across controlled service restarts.

A timestamp alone is not sufficient release evidence. Attach the operator/staging log or monitoring export to the release record.

## 6. Release workflow

Two workflows are introduced:

### `V2 Phase 8`

PR/push validation. It runs without production secrets and protects the code-level release invariants, snapshot/restore behavior, regression surface and platform buildability.

### `V2 Production Release`

Manual production workflow. It requires the real signing secrets and a valid 72-hour soak start timestamp. It builds signed platform artifacts, checks signatures, generates checksums/SBOM/provenance and optionally publishes the GitHub release.

Production release must be run against the exact candidate ref that completed the soak. Do not switch the candidate SHA after the soak starts; any runtime-affecting change resets the soak clock.

## Required production workflow secrets

| Secret | Purpose |
| --- | --- |
| `GHOST_NEXORA_ANDROID_KEYSTORE_BASE64` | Android release keystore |
| `GHOST_NEXORA_ANDROID_KEY_ALIAS` | Android signing alias |
| `GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD` | Android keystore password |
| `GHOST_NEXORA_ANDROID_KEY_PASSWORD` | Android key password |
| `WINDOWS_CERTIFICATE_BASE64` | Windows Authenticode PFX |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |
| `GPG_PRIVATE_KEY` | Linux checksum signing key |
| `GPG_SIGNING_KEY_ID` | Linux signing key id/fingerprint |

## Acceptance checklist

Code/CI gates:

- [ ] full workspace typecheck/build succeeds;
- [ ] Phase 0–7 regression gates remain green;
- [ ] `npm run v2:release-gate` succeeds;
- [ ] release snapshot/restore smoke succeeds;
- [ ] Android lint/tests/build succeeds;
- [ ] Linux Tauri bundles build;
- [ ] Windows NSIS bundle builds;
- [ ] migration/rollback scripts pass syntax/audit checks.

Production-only gates:

- [ ] Android production APK is signed and verified;
- [ ] Windows NSIS installer is Authenticode-signed and verified;
- [ ] Linux checksums are GPG-signed and verified;
- [ ] CycloneDX SBOM is attached;
- [ ] GitHub build provenance attestations exist;
- [ ] upgrade/automatic rollback/manual rollback staging drill is recorded;
- [ ] 72-hour soak has elapsed on the exact candidate SHA;
- [ ] soak evidence shows no release-blocking reliability issue;
- [ ] release notes/operator docs are finalized;
- [ ] `v2.0.0` tag/release is created only after all previous boxes are satisfied.

## Do not weaken these gates

Do not:

- commit signing keys, certificates, passwords or tokens;
- replace the 72-hour check with a CI sleep or mocked clock;
- publish unsigned binaries as production artifacts;
- remove legacy supported install/update paths merely to simplify the release;
- remove WhatsApp/Termux/Valley `.edit` regression coverage;
- merge the stacked V2 PR chain unless explicitly requested.

## Continuation / handoff

Use this repository and branch as the Phase 8 source of truth:

- repository: `Gh0stDeveloper/GhostNexoraBot`;
- Phase 8 branch: `feat/v2-phase-8-production-release`;
- Phase 8 base: `feat/v2-phase-7-official-apps`;
- read `docs/v2/PHASE_8.md` first;
- verify the branch HEAD and Actions state before making any further change;
- if any runtime-affecting commit is added after soak begins, restart the 72-hour soak clock;
- do not merge unless explicitly requested.
