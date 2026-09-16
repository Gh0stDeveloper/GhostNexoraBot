#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const root = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-release-'))
const stage = path.join(root, 'stage')
const releases = path.join(root, 'releases')
const dbFile = path.join(root, 'db', 'releases.sqlite')
mkdirSync(stage, { recursive: true })

const fixtures = [
  'GhostNexoraManager-2.0.0-android.apk',
  'GhostNexoraManager-2.0.0-windows-x64-setup.exe',
  'ghost-nexora-manager_2.0.0_amd64.deb',
  'GhostNexoraManager-2.0.0-linux-x86_64.AppImage',
  'ghost-nexora-manager-2.0.0-1.x86_64.rpm',
  'SHA256SUMS.txt',
  'SHA256SUMS.txt.asc',
  'GHOST-NEXORA-RELEASE-PUBLIC.asc',
]
for (const [index, file] of fixtures.entries()) writeFileSync(path.join(stage, file), `fixture-${index}-${file}\n`)

const env = {
  ...process.env,
  OFFICIAL_RELEASE_STAGE: stage,
  OFFICIAL_RELEASE_DIR: releases,
  OFFICIAL_RELEASE_DB: dbFile,
  OFFICIAL_RELEASE_VERSION: '2.0.0',
  OFFICIAL_RELEASE_CHANNEL: 'rc',
  OFFICIAL_SOURCE_SHA: '0123456789abcdef0123456789abcdef01234567',
  OFFICIAL_SOURCE_REF: 'feat/test-release',
  ANDROID_SIGNER_FINGERPRINT: 'aa'.repeat(32),
  WINDOWS_SIGNER_FINGERPRINT: 'bb'.repeat(32),
  WINDOWS_SIGNING_MODE: 'self-signed',
  LINUX_SIGNER_FINGERPRINT: 'cc'.repeat(20),
}
const result = spawnSync(process.execPath, ['scripts/release/publish-official-release.mjs'], { cwd: process.cwd(), env, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr || result.stdout)

const manifest = JSON.parse(readFileSync(path.join(releases, 'current.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.version, '2.0.0')
assert.equal(manifest.sourceSha, env.OFFICIAL_SOURCE_SHA)
assert.equal(manifest.artifacts.length, 5)
assert.deepEqual(new Set(manifest.artifacts.map((item) => item.kind)), new Set(['apk', 'nsis', 'deb', 'appimage', 'rpm']))
assert.equal(manifest.artifacts.find((item) => item.kind === 'nsis').signatureStatus, 'self-signed')
assert.equal(manifest.artifacts.find((item) => item.kind === 'apk').signerFingerprint, env.ANDROID_SIGNER_FINGERPRINT)
assert.ok(manifest.artifacts.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)))
assert.ok(manifest.artifacts.every((item) => !item.relativePath.includes('..')))

const db = new DatabaseSync(dbFile, { readOnly: true })
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM official_release_builds').get().count, 1)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM official_release_artifacts').get().count, 5)
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM official_signing_identities').get().count, 3)
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all().map((row) => String(row.sql ?? '')).join('\n').toLowerCase()
assert.doesNotMatch(schema, /password|private_key|keystore_blob|pfx_blob/)
db.close()

rmSync(root, { recursive: true, force: true })
console.log('[V2 DISTRIBUTION SMOKE] OK — manifest, artifacts, signing metadata and SQLite history are publishable without storing private signing material.')
