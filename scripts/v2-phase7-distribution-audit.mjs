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
assert.match(builder, /assembleRelease/)
assert.match(builder, /apksigner.*verify/)
assert.match(builder, /--bundles deb,appimage,rpm/)
assert.match(builder, /--bundles nsis/)
assert.match(builder, /SHA256SUMS\.txt/)
assert.match(builder, /publish-official-release\.mjs/)
assert.match(signer, /osslsigncode/)
assert.match(signer, /verify -in/)
assert.doesNotMatch(builder, /cp .*SIGNING_DIR.*RELEASE_DIR|cp .*release-secrets.*releases/, 'Private signing files must never be copied into public releases')

// Publisher only stores release metadata/fingerprints in SQLite.
assert.match(publisher, /official_release_builds/)
assert.match(publisher, /official_release_artifacts/)
assert.match(publisher, /official_signing_identities/)
assert.doesNotMatch(publisher, /password\s+TEXT|private_key\s+|keystore_blob|pfx_blob/i, 'Release DB schema must not store signing secrets')
assert.match(publisher, /\.current\.\$\{process\.pid\}\.json/)
assert.match(publisher, /renameSync\(tmpCurrent/)

// VPS installs/updates auto-schedule builds, while retaining an operator opt-out.
assert.match(installer, /installOfficialDistributionBuilder/)
assert.match(installer, /NEXORA_RUNTIME_PROFILE/)
assert.match(installer, /WEB_ENABLED/)
assert.match(installer, /ghost-nexora-release-build\.service/)
assert.match(installer, /ghost-nexora-release-build\.timer/)
assert.match(installer, /GHOST_NEXORA_RELEASE_BUILD_ACTIVE=1/)
assert.match(cli, /release-build/)
assert.match(cli, /GHOST_NEXORA_RELEASE_BUILD_ACTIVE/)
assert.match(envExample, /OFFICIAL_DISTRIBUTION_ENABLED=true/)
assert.match(envExample, /OFFICIAL_RELEASE_DIR=/)
assert.match(envExample, /OFFICIAL_SIGNING_ENV=/)
assert.match(pkg, /"release:vps"/)

console.log('[V2 DISTRIBUTION AUDIT] OK — official download Web is read-only, VPS builds are fixed, and persistent signing material remains root-only outside public artifacts/SQLite.')
