#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const read = (file) => readFileSync(file, 'utf8')
const [releaseLib, downloadsPage, catalogApi, downloadApi, builder, signer, publisher, installer, cli, envExample, pkg] = [
  'apps/web/lib/releases.ts',
  'apps/web/app/downloads/page.tsx',
  'apps/web/app/api/releases/route.ts',
  'apps/web/app/api/releases/download/route.ts',
  'scripts/release/build-official-apps.sh',
  'scripts/release/sign-windows.sh',
  'scripts/release/publish-official-release.mjs',
  'scripts/install-cli.mjs',
  'scripts/ghostnexorabot.mjs',
  '.env.example',
  'package.json',
].map(read)

for (const file of ['scripts/release/build-official-apps.sh', 'scripts/release/sign-windows.sh']) {
  const syntax = spawnSync('bash', ['-n', file], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, `${file} must pass bash -n: ${syntax.stderr}`)
}

// Public Web is read-only with respect to the build/signing boundary.
assert.match(downloadsPage, /artifactFor\(release\.artifacts, 'nsis'\)/)
assert.match(downloadsPage, /artifactFor\(release\.artifacts, 'apk'\)/)
assert.match(downloadsPage, /artifactFor\(release\.artifacts, 'deb'\)/)
assert.match(downloadsPage, /artifactFor\(release\.artifacts, 'rpm'\)/)
assert.match(downloadsPage, /artifactFor\(release\.artifacts, 'appimage'\)/)
assert.match(downloadsPage, /artifact\.unavailable/)
assert.match(catalogApi, /publicReleaseCatalog\(\)/)
assert.match(downloadApi, /resolveReleaseArtifact\(id\)/)
assert.match(downloadApi, /Accept-Ranges/)
assert.match(downloadApi, /Content-Range/)
assert.match(downloadApi, /X-Ghost-Nexora-SHA256/)
const httpRoutes = `${catalogApi}\n${downloadApi}`
assert.doesNotMatch(httpRoutes, /node:child_process|child_process|spawnSync|execSync|execFileSync|fork\s*\(|gradle\s|cargo\s|keytool\s|gpg\s|osslsigncode\s|npm\s+run\s+tauri/i, 'HTTP release routes must never build or sign artifacts')
assert.match(releaseLib, /relativePath\.includes\('\.\.'\)/)
assert.match(releaseLib, /file\.startsWith\(`\$\{root\}\$\{path\.sep\}`\)/)
assert.match(releaseLib, /path\.basename\(filename\) !== filename/)
assert.doesNotMatch(releaseLib, /OFFICIAL_SIGNING|KEYSTORE|PFX_PASSWORD|GPG_KEY_PASSPHRASE/, 'Web release reader must not know signing-secret locations or passwords')

// VPS builder owns build and signing operations with persistent identities.
assert.match(builder, /release-secrets/)
assert.match(builder, /chmod 0600 "\$\{SIGNING_ENV\}"/)
assert.match(builder, /install -d -m 0700/)
assert.match(builder, /keytool -genkeypair/)
assert.match(builder, /ghost-nexora-android-release\.p12/)
assert.match(builder, /ghost-nexora-windows-release\.pfx/)
assert.match(builder, /GNUPGHOME=.*gpg/)
assert.match(builder, /cargo-xwin/)
assert.match(builder, /x86_64-pc-windows-msvc/)
assert.match(builder, /platforms;android-37\.0/)
assert.doesNotMatch(builder, /platforms;android-37['"]/) 
assert.match(builder, /build-tools;37\.0\.0/)
assert.match(builder, /assembleRelease/)
assert.match(builder, /apksigner.*verify/)
assert.match(builder, /--bundles deb,appimage,rpm/)
assert.match(builder, /--bundles nsis/)
assert.match(builder, /phase_done\(\)/)
assert.match(builder, /mark_phase\(\)/)
assert.match(builder, /already completed|ya estaba completado/i)
assert.doesNotMatch(builder, /rm -rf "\$\{BUILD_ROOT:\?\}\/\$\{SOURCE_SHA:0:12\}"/, 'Same-SHA staging must survive a failed phase for resume')
assert.match(builder, /FAILED_PHASES=\(\)/)
assert.match(builder, /if \( build_android \); then/)
assert.match(builder, /if \( build_linux \); then/)
assert.match(builder, /if \( build_windows \); then/)
assert.match(builder, /se publicarán igualmente las aplicaciones disponibles/i)
assert.match(builder, /PUBLISHABLE_COUNT/)
assert.match(builder, /Ninguna plataforma produjo un artefacto publicable/)
assert.match(builder, /Distribución parcial publicada correctamente/)
assert.match(builder, /SHA256SUMS\.txt/)
assert.match(builder, /publish-official-release\.mjs/)
assert.match(signer, /osslsigncode/)
assert.match(signer, /openssl pkcs12/)
assert.match(signer, /-CAfile "\$\{VERIFY_CERT\}"/)
assert.match(signer, /-ignore-timestamp/)
assert.match(signer, /Authenticode verification failed/)
assert.doesNotMatch(builder, /cp .*SIGNING_DIR.*RELEASE_DIR|cp .*release-secrets.*releases/, 'Private signing files must never be copied into public releases')

// Publisher accepts a healthy subset, records completeness, and never publishes an empty catalog.
assert.match(publisher, /official_release_builds/)
assert.match(publisher, /official_release_artifacts/)
assert.match(publisher, /official_signing_identities/)
assert.doesNotMatch(publisher, /password\s+TEXT|private_key\s+|keystore_blob|pfx_blob/i, 'Release DB schema must not store signing secrets')
assert.match(publisher, /artifacts\.length === 0/)
assert.match(publisher, /no_publishable_artifacts/)
assert.match(publisher, /releaseStatus/)
assert.match(publisher, /availableKinds/)
assert.match(publisher, /missingKinds/)
assert.doesNotMatch(publisher, /required_artifact_missing_/)
assert.match(publisher, /\.current\.\$\{process\.pid\}\.json/)
assert.match(publisher, /renameSync\(tmpCurrent/)

// VPS installs/updates auto-schedule builds, while retaining an operator opt-out.
assert.match(installer, /installOfficialDistributionBuilder/)
assert.match(installer, /NEXORA_RUNTIME_PROFILE/)
assert.match(installer, /WEB_ENABLED/)
assert.match(installer, /ghost-nexora-release-build\.service/)
assert.match(installer, /ghost-nexora-release-build\.timer/)
assert.match(installer, /GHOST_NEXORA_RELEASE_BUILD_ACTIVE=1/)
assert.match(installer, /scripts\/\(install\|update\)\[\.\]sh/)
assert.doesNotMatch(installer, /scripts\/\(install\|update\)\\\\\.sh/)
assert.match(cli, /release-build/)
assert.match(cli, /GHOST_NEXORA_RELEASE_BUILD_ACTIVE/)
assert.match(envExample, /OFFICIAL_DISTRIBUTION_ENABLED=true/)
assert.match(envExample, /OFFICIAL_RELEASE_DIR=/)
assert.match(envExample, /OFFICIAL_SIGNING_ENV=/)
assert.match(pkg, /"release:vps"/)

console.log('[V2 DISTRIBUTION AUDIT] OK — VPS builds isolate platform failures, publish every healthy artifact, resume same-SHA phases, and keep signing material root-only.')
