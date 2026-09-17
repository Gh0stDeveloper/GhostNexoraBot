#!/usr/bin/env node
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-backup-restore-'))
process.env.DATA_DIR = path.join(temp, 'data')
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.NEXORA_INSTANCE_ROLE = 'main'
process.env.NEXORA_DISABLE_RESTORE_EXIT = 'true'
process.env.OLLAMA_ENABLED = 'false'
delete process.env.NEXORA_GLOBAL_CONTROL_DB
delete process.env.NEXORA_GLOBAL_ECONOMY_DB

try {
  await mkdir(process.env.DATA_DIR, { recursive: true })
  await mkdir(process.env.SESSION_DIR, { recursive: true })
  const sessionMarker = path.join(process.env.SESSION_DIR, 'creds.json')
  await writeFile(sessionMarker, '{"session":"must-survive"}\n', 'utf8')
  const settingsPath = path.join(process.env.DATA_DIR, 'settings.json')
  await writeFile(settingsPath, '{"smoke":"backup-state"}\n', 'utf8')

  const { economy } = await import('../apps/bot/dist/services/economy.js')
  const backup = await import('../apps/bot/dist/services/backup-service.js')
  const restore = await import('../apps/bot/dist/services/restore-bootstrap.js')

  economy.db.exec('CREATE TABLE IF NOT EXISTS restore_smoke(value TEXT NOT NULL); DELETE FROM restore_smoke; INSERT INTO restore_smoke(value) VALUES(\'backup-state\');')
  economy.walletDb.exec('CREATE TABLE IF NOT EXISTS restore_wallet_smoke(value TEXT NOT NULL); DELETE FROM restore_wallet_smoke; INSERT INTO restore_wallet_smoke(value) VALUES(\'wallet-backup-state\');')

  const created = await backup.createOperationalBackup('manual')
  assert.match(created.fileName, /^ghostnexora-backup-.*\.gnb-backup\.gz$/)

  economy.db.exec("UPDATE restore_smoke SET value='mutated-state'")
  economy.walletDb.exec("UPDATE restore_wallet_smoke SET value='wallet-mutated-state'")
  await writeFile(settingsPath, '{"smoke":"mutated-state"}\n', 'utf8')

  const prepared = await backup.prepareOperationalRestore(created.id)
  assert.equal(prepared.backupId, created.id)
  assert.equal(prepared.sessionRestored, false)
  assert.equal(prepared.restartScheduled, false)
  assert.ok(prepared.files.includes('ghostnexora.sqlite'))
  assert.ok(prepared.files.includes('nexora-economy.sqlite'))

  economy.db.close()
  economy.walletDb.close()

  const applied = await restore.applyPendingRestoreBeforeRuntime()
  assert.equal(applied.applied, true)
  assert.equal(applied.backupId, created.id)

  const restoredMain = new DatabaseSync(path.join(process.env.DATA_DIR, 'ghostnexora.sqlite'))
  const restoredWallet = new DatabaseSync(path.join(process.env.DATA_DIR, 'nexora-economy.sqlite'))
  try {
    assert.equal(restoredMain.prepare('SELECT value FROM restore_smoke LIMIT 1').get().value, 'backup-state')
    assert.equal(restoredWallet.prepare('SELECT value FROM restore_wallet_smoke LIMIT 1').get().value, 'wallet-backup-state')
  } finally {
    restoredMain.close()
    restoredWallet.close()
  }

  assert.match(await readFile(settingsPath, 'utf8'), /backup-state/)
  assert.match(await readFile(sessionMarker, 'utf8'), /must-survive/)
  const result = JSON.parse(await readFile(path.join(process.env.DATA_DIR, 'restore', 'last-result.json'), 'utf8'))
  assert.equal(result.ok, true)
  assert.equal(result.sessionRestored, false)
  assert.ok(Array.isArray(result.files) && result.files.includes('ghostnexora.sqlite'))

  console.log('backup restore smoke: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
