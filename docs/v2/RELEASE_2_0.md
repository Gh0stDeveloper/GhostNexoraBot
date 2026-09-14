# Ghost Nexora Bot 2.0.0

Ghost Nexora Bot 2.0.0 is the production release target for the V2 multi-platform architecture completed through Phases 0–8.

## Highlights

- WhatsApp remains the compatibility baseline, including the existing special `.edit` behavior.
- Telegram and Discord adapters are integrated behind the shared V2 platform contracts.
- User-facing i18n boundaries are preserved across bot and Web surfaces.
- Official Android Remote Manager is available for authenticated remote management.
- Official Windows and Linux desktop managers are built with Tauri 2.
- Persistent Manager Agent provides the fixed host lifecycle boundary for start/stop/restart/update operations.
- Control API V2 remains the supported boundary for official manager applications.
- Termux Lite remains supported and isolated from the full runtime profile.
- Production release artifacts use signing, checksums, SBOM generation and build provenance.
- The production VPS update path adds persistent-state snapshots and automatic/manual rollback support.

## Upgrade safety

For a production release upgrade, use the release updater after `v2.0.0` has passed all Phase 8 production gates:

```bash
sudo /opt/ghost-nexora-bot/scripts/release-update.sh v2.0.0
```

The updater validates the release before activation and preserves existing `.env`, runtime state, sessions and application data in a protected rollback snapshot.

If recovery is required:

```bash
sudo /opt/ghost-nexora-bot/scripts/release-rollback.sh latest
```

Do not delete `/var/lib/ghost-nexora-bot/releases` until the upgraded installation has been verified and an appropriate retention window has passed.

## Artifact verification

Production artifacts are expected to include:

- Android signed APK + SHA-256 checksum + GitHub provenance;
- Windows Authenticode-signed NSIS `.exe` + SHA-256 checksum + GitHub provenance;
- Linux `.deb` and AppImage + SHA-256 checksum list + armored GPG signature + GitHub provenance;
- CycloneDX SBOM + SHA-256 checksum + GitHub provenance.

Unsigned artifacts produced by regression CI are test artifacts only and must not be represented as the production 2.0.0 distribution.

## Operator validation before publishing

Confirm all of the following against the exact candidate commit:

- Phase 0–8 CI is green;
- production signing secrets are configured in GitHub Actions;
- Android signature verification passes;
- Windows Authenticode verification passes;
- Linux GPG checksum verification passes;
- SBOM and attestations are generated;
- staging upgrade and rollback drills are recorded;
- at least 72 continuous hours of soak have elapsed;
- soak evidence contains no release-blocking reliability issue;
- the release tag points to the same candidate commit that completed the soak.

If runtime code changes after the soak begins, restart the 72-hour soak window.

## Compatibility

Phase 8 does not intentionally remove supported Phase 7 installation paths. Existing VPS, Termux Lite and Windows installation/update routes remain available while the new release-safe VPS updater is introduced for production tag transitions.

## Security

Never commit Android keystores, Windows PFX certificates, private GPG keys, signing passwords, bearer tokens, WhatsApp session credentials or production `.env` files. Production signing material is consumed only through GitHub Actions secrets or protected host-side secret storage.
