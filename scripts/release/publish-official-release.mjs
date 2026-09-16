#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function sha256(file) {
  const hash = createHash('sha256')
  hash.update(readFileSync(file))
  return hash.digest('hex')
}

function classify(filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.apk')) return { id: 'android-apk', platform: 'android', distro: 'android-13+', arch: 'universal', kind: 'apk' }
  if (lower.endsWith('.exe')) return { id: 'windows-x64', platform: 'windows', distro: 'windows-10-11', arch: 'x64', kind: 'nsis' }
  if (lower.endsWith('.deb')) return { id: 'linux-deb-x64', platform: 'linux', distro: 'ubuntu-debian', arch: 'amd64', kind: 'deb' }
  if (lower.endsWith('.appimage')) return { id: 'linux-appimage-x64', platform: 'linux', distro: 'linux-universal', arch: 'x86_64', kind: 'appimage' }
  if (lower.endsWith('.rpm')) return { id: 'linux-rpm-x64', platform: 'linux', distro: 'fedora-rhel', arch: 'x86_64', kind: 'rpm' }
  return null
}

function signingFor(kind) {
  if (kind === 'apk') return {
    signed: true,
    signatureStatus: 'trusted',
    signerFingerprint: process.env.ANDROID_SIGNER_FINGERPRINT || null,
  }
  if (kind === 'nsis') {
    const mode = process.env.WINDOWS_SIGNING_MODE === 'trusted' ? 'trusted' : 'self-signed'
    return { signed: true, signatureStatus: mode, signerFingerprint: process.env.WINDOWS_SIGNER_FINGERPRINT || null }
  }
  return {
    signed: true,
    signatureStatus: 'gpg',
    signerFingerprint: process.env.LINUX_SIGNER_FINGERPRINT || null,
  }
}

const stageDir = path.resolve(required('OFFICIAL_RELEASE_STAGE'))
const releaseDir = path.resolve(required('OFFICIAL_RELEASE_DIR'))
const dbFile = path.resolve(required('OFFICIAL_RELEASE_DB'))
const version = required('OFFICIAL_RELEASE_VERSION').replace(/^v/, '')
const sourceSha = required('OFFICIAL_SOURCE_SHA')
const sourceRef = required('OFFICIAL_SOURCE_REF')
const channel = ['stable', 'beta', 'rc'].includes(process.env.OFFICIAL_RELEASE_CHANNEL ?? '') ? process.env.OFFICIAL_RELEASE_CHANNEL : 'rc'

if (!existsSync(stageDir)) throw new Error('release_stage_missing')
if (!/^[0-9A-Za-z._+-]+$/.test(version)) throw new Error('invalid_release_version')
if (!/^[a-f0-9]{7,64}$/i.test(sourceSha)) throw new Error('invalid_source_sha')

mkdirSync(releaseDir, { recursive: true })
mkdirSync(path.dirname(dbFile), { recursive: true })
const relativeRoot = path.join(`v${version}`, sourceSha.slice(0, 12))
const targetDir = path.join(releaseDir, relativeRoot)
mkdirSync(targetDir, { recursive: true })

const artifacts = []
for (const filename of readdirSync(stageDir).sort()) {
  const source = path.join(stageDir, filename)
  if (!statSync(source).isFile()) continue
  const target = path.join(targetDir, filename)
  copyFileSync(source, target)
  const classification = classify(filename)
  if (!classification) continue
  const stat = statSync(target)
  const signing = signingFor(classification.kind)
  artifacts.push({
    ...classification,
    filename,
    relativePath: path.posix.join(relativeRoot.replaceAll(path.sep, '/'), filename),
    sizeBytes: stat.size,
    sha256: sha256(target),
    ...signing,
  })
}

if (artifacts.length === 0) throw new Error('no_publishable_artifacts')

const expectedKinds = ['apk', 'nsis', 'deb', 'appimage']
const availableKinds = [...new Set(artifacts.map((artifact) => artifact.kind))].sort()
const missingKinds = expectedKinds.filter((kind) => !availableKinds.includes(kind))
const releaseStatus = missingKinds.length === 0 ? 'complete' : 'partial'
const publishedAt = new Date().toISOString()
const manifest = {
  schemaVersion: 1,
  product: 'Ghost Nexora Manager',
  version,
  channel,
  sourceSha,
  sourceRef,
  publishedAt,
  releaseStatus,
  availableKinds,
  missingKinds,
  signing: {
    android: process.env.ANDROID_SIGNER_FINGERPRINT || null,
    windows: process.env.WINDOWS_SIGNER_FINGERPRINT || null,
    linux: process.env.LINUX_SIGNER_FINGERPRINT || null,
  },
  artifacts,
}

const versionManifest = path.join(targetDir, 'release.json')
writeFileSync(versionManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
const tmpCurrent = path.join(releaseDir, `.current.${process.pid}.json`)
writeFileSync(tmpCurrent, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
renameSync(tmpCurrent, path.join(releaseDir, 'current.json'))

const db = new DatabaseSync(dbFile)
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS official_release_builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    channel TEXT NOT NULL,
    source_sha TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    published_at TEXT NOT NULL,
    manifest_path TEXT NOT NULL,
    UNIQUE(version, source_sha)
  );
  CREATE TABLE IF NOT EXISTS official_release_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id INTEGER NOT NULL,
    artifact_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    distro TEXT NOT NULL,
    arch TEXT NOT NULL,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    signature_status TEXT NOT NULL,
    signer_fingerprint TEXT,
    FOREIGN KEY(build_id) REFERENCES official_release_builds(id) ON DELETE CASCADE,
    UNIQUE(build_id, artifact_id)
  );
  CREATE TABLE IF NOT EXISTS official_signing_identities (
    kind TEXT PRIMARY KEY,
    fingerprint TEXT,
    mode TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

db.prepare(`
  INSERT INTO official_release_builds(version, channel, source_sha, source_ref, published_at, manifest_path)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(version, source_sha) DO UPDATE SET channel=excluded.channel, source_ref=excluded.source_ref, published_at=excluded.published_at, manifest_path=excluded.manifest_path
`).run(version, channel, sourceSha, sourceRef, publishedAt, path.relative(releaseDir, versionManifest))
const build = db.prepare('SELECT id FROM official_release_builds WHERE version=? AND source_sha=?').get(version, sourceSha)
if (!build || typeof build.id !== 'number') throw new Error('release_build_row_missing')
db.prepare('DELETE FROM official_release_artifacts WHERE build_id=?').run(build.id)
const insertArtifact = db.prepare(`
  INSERT INTO official_release_artifacts(build_id, artifact_id, platform, distro, arch, kind, filename, relative_path, size_bytes, sha256, signature_status, signer_fingerprint)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
for (const artifact of artifacts) {
  insertArtifact.run(build.id, artifact.id, artifact.platform, artifact.distro, artifact.arch, artifact.kind, artifact.filename, artifact.relativePath, artifact.sizeBytes, artifact.sha256, artifact.signatureStatus, artifact.signerFingerprint)
}
const identity = db.prepare(`
  INSERT INTO official_signing_identities(kind, fingerprint, mode, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(kind) DO UPDATE SET fingerprint=excluded.fingerprint, mode=excluded.mode, updated_at=excluded.updated_at
`)
identity.run('android', process.env.ANDROID_SIGNER_FINGERPRINT || null, 'persistent-keystore', publishedAt)
identity.run('windows', process.env.WINDOWS_SIGNER_FINGERPRINT || null, process.env.WINDOWS_SIGNING_MODE === 'trusted' ? 'trusted-certificate' : 'persistent-self-signed', publishedAt)
identity.run('linux', process.env.LINUX_SIGNER_FINGERPRINT || null, 'persistent-gpg', publishedAt)
db.close()

console.log(JSON.stringify({
  ok: true,
  version,
  sourceSha,
  publishedAt,
  releaseStatus,
  availableKinds,
  missingKinds,
  artifacts: artifacts.map(({ id, filename, sha256: hash }) => ({ id, filename, sha256: hash })),
}, null, 2))
