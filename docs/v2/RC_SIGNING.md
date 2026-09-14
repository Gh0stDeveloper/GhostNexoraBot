# V2 Release Candidate signing

This document defines the temporary signing model used by the Phase 8 release-candidate workflow.

## Purpose

The repository cannot manufacture or persist production signing secrets. Production `v2.0.0` still requires permanent private credentials supplied through protected GitHub Actions secrets and the real 72-hour soak gate documented in `PHASE_8.md`.

To make a visible, installable release candidate available before those permanent credentials exist, `.github/workflows/v2-rc-release.yml` generates short-lived signing material inside GitHub-hosted runners. Private keys never leave the runner and are never committed or uploaded as artifacts.

## Android RC signing

The workflow generates a temporary JKS with `keytool` and exports these variables only inside the Android job:

- `GHOST_NEXORA_ANDROID_KEYSTORE`
- `GHOST_NEXORA_ANDROID_KEY_ALIAS`
- `GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD`
- `GHOST_NEXORA_ANDROID_KEY_PASSWORD`

The release APK is built through the normal Gradle release signing configuration and verified with `apksigner`. Only the public certificate and its fingerprint are published with the APK.

Because the private key is intentionally ephemeral, this RC APK is not the permanent upgrade identity for the final production Android application.

## Windows RC signing

The Windows runner creates a short-lived self-signed code-signing certificate using `New-SelfSignedCertificate`, temporarily trusts that certificate on the runner, signs the NSIS `.exe` with `Set-AuthenticodeSignature`, and verifies the result with `Get-AuthenticodeSignature`.

Only the public `.cer` certificate is attached to the prerelease. The private key/PFX is not exported as an artifact.

This proves that the packaging/signing path works, but it is not a publicly trusted production Authenticode identity.

## Linux RC signing

The Linux runner generates a temporary GPG signing key with no persistent private-key export. It hashes the `.deb` and AppImage artifacts, signs the checksum manifest with an armored detached signature, verifies that signature, and publishes the public GPG key alongside the binaries.

## Release candidate publication

A successful run publishes a GitHub prerelease named `v2.0.0-rc.<run_number>` targeting the exact Phase 8 commit that was built.

The prerelease contains:

- signed Android APK;
- Android public signing certificate and SHA-256 checksum;
- signed Windows NSIS installer;
- Windows public signing certificate and SHA-256 checksum;
- Linux `.deb` and AppImage;
- Linux SHA-256 manifest, detached GPG signature and public GPG key;
- CycloneDX SBOM and checksum;
- candidate metadata identifying the exact commit and workflow run.

## Security boundary

RC signing material is disposable by design. It must not be promoted to production identity and it must not replace the permanent secret variables required by `.github/workflows/v2-release.yml`.

The final `v2.0.0` release remains blocked until:

1. permanent Android keystore, Windows code-signing certificate and GPG key are configured as protected secrets;
2. the staging upgrade/rollback drill is recorded;
3. at least 72 continuous hours of soak complete on the exact candidate SHA;
4. the production release workflow verifies every final signature and provenance record.

No Phase 8 branch is merged to `main` by this RC publication process.
