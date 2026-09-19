#!/usr/bin/env node
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-e13-backups-'))
const dataDir = path.join(temp, 'data')
const sessionDir = path.join(temp, 'session')

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: sessionDir,
  NEXORA_INSTANCE_ROLE: 'main',
  NEXORA_DISABLE_RESTORE_EXIT: 'true',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
  ADMIN_WEB_TOKEN: 'phase-e13-backup-smoke',
})
delete process.env.NEXORA_GLOBAL_CONTROL_DB
delete process.env.NEXORA_GLOBAL_ECONOMY_DB

try {
  await mkdir(dataDir, { recursive: true })
  await mkdir(sessionDir, { recursive: true })
  await writeFile(path.join(sessionDir, 'creds.json'), '{"session":"e13-main"}\n', 'utf8')
  await writeFile(path.join(dataDir, 'settings.json'), '{"phase":"e13"}\n', 'utf8')

  const { economy } = await import('../apps/bot/dist/services/economy.js')
  const backup = await import('../apps/bot/dist/services/backup-service.js')
  const restore = await import('../apps/bot/dist/services/restore-bootstrap.js')

  economy.db.exec(`
    CREATE TABLE IF NOT EXISTS restore_e13_unrelated(value TEXT NOT NULL);
    DELETE FROM restore_e13_unrelated;
    INSERT INTO restore_e13_unrelated(value) VALUES('before');

    CREATE TABLE IF NOT EXISTS ops_command_settings (
      instance_key TEXT NOT NULL,
      command_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      whatsapp INTEGER NOT NULL DEFAULT 1,
      discord INTEGER NOT NULL DEFAULT 1,
      telegram INTEGER NOT NULL DEFAULT 1,
      cooldown_ms INTEGER NOT NULL DEFAULT 0,
      allow_groups INTEGER NOT NULL DEFAULT 1,
      allow_private INTEGER NOT NULL DEFAULT 1,
      permission_mode TEXT NOT NULL DEFAULT 'inherit',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(instance_key, command_name)
    );
    INSERT OR REPLACE INTO ops_command_settings(
      instance_key,command_name,enabled,whatsapp,discord,telegram,cooldown_ms,
      allow_groups,allow_private,permission_mode,updated_at
    ) VALUES('main','menu',1,1,1,1,0,1,1,'inherit',1);
  `)

  economy.setGroupPolicy('120363000000000000@g.us', 'welcome', true)
  const subbotId = economy.createSubbot('5215550000099@s.whatsapp.net', Date.now() + 86_400_000)
  const subbotRoot = path.join(dataDir, 'subbots', String(subbotId))
  await mkdir(path.join(subbotRoot, 'session'), { recursive: true })
  await writeFile(path.join(subbotRoot, 'session', 'creds.json'), '{"session":"e13-subbot"}\n', 'utf8')
  await writeFile(path.join(subbotRoot, 'settings.json'), '{"subbot":"settings"}\n', 'utf8')
  const subbotDb = new DatabaseSync(path.join(subbotRoot, 'ghostnexora.sqlite'))
  subbotDb.exec("CREATE TABLE local_e13(value TEXT NOT NULL); INSERT INTO local_e13(value) VALUES('subbot-local');")
  subbotDb.close()

  economy.walletDb.exec(`
    CREATE TABLE IF NOT EXISTS e13_wallet_marker(value TEXT NOT NULL);
    DELETE FROM e13_wallet_marker;
    INSERT INTO e13_wallet_marker(value) VALUES('wallet-e13');
  `)

  const types = ['economy', 'configuration', 'subbots', 'sessions', 'groups', 'full']
  const created = new Map()
  for (const type of types) {
    const row = await backup.createOperationalBackup('manual', type)
    assert.equal(row.type, type)
    assert.match(row.sha256, /^[a-f0-9]{64}$/)
    assert.equal(row.verified, true)
    created.set(type, row)
  }

  const policy = backup.backupRetentionPolicy()
  assert.equal(policy.maxPerType.full, 14)
  assert.equal(policy.maxPerType.economy, 30)
  assert.equal(policy.automatic.economy, 6 * 60 * 60_000)
  assert.equal(policy.automatic.full, 24 * 60 * 60_000)

  const rows = await backup.listOperationalBackups()
  for (const type of types) assert.ok(rows.some((row) => row.type === type), `missing backup type ${type}`)

  const sessionsVerified = await backup.verifyOperationalBackup(created.get('sessions').id)
  assert.equal(sessionsVerified.type, 'sessions')
  assert.equal(sessionsVerified.sessionIncluded, true)

  const subbotsVerified = await backup.verifyOperationalBackup(created.get('subbots').id)
  assert.equal(subbotsVerified.type, 'subbots')
  assert.ok(subbotsVerified.files >= 2, 'subbot backup must include local DB/settings')
  assert.ok(subbotsVerified.tables >= 1, 'subbot backup must include global metadata tables')

  const fullVerified = await backup.verifyOperationalBackup(created.get('full').id)
  assert.equal(fullVerified.type, 'full')
  assert.equal(fullVerified.sessionIncluded, true)
  assert.ok(fullVerified.files >= 5, 'full backup should include databases, settings, sessions and subbot local data')

  const groupBackup = created.get('groups')
  const dryRun = await backup.testOperationalRestore(groupBackup.id)
  assert.equal(dryRun.type, 'groups')
  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.activeDataChanged, false)
  assert.equal(existsSync(restore.pendingRestorePath()), false, 'dry-run restore must not schedule a restore')
  assert.equal(economy.getGroupPolicy('120363000000000000@g.us').welcome, true)

  economy.setGroupPolicy('120363000000000000@g.us', 'welcome', false)
  economy.db.prepare("UPDATE restore_e13_unrelated SET value='after'").run()

  const prepared = await backup.prepareOperationalRestore(groupBackup.id)
  assert.equal(prepared.type, 'groups')
  assert.equal(prepared.restartScheduled, false)
  assert.ok(prepared.tables.some((name) => name === 'group_policies'))
  assert.equal(prepared.files.length, 0)

  economy.db.close()
  economy.walletDb.close()

  const applied = await restore.applyPendingRestoreBeforeRuntime()
  assert.equal(applied.applied, true)
  assert.equal(applied.backupType, 'groups')

  const mainDb = new DatabaseSync(path.join(dataDir, 'ghostnexora.sqlite'))
  try {
    const group = mainDb.prepare('SELECT welcome FROM group_policies WHERE group_jid = ?')
      .get('120363000000000000@g.us')
    assert.equal(Boolean(group?.welcome), true, 'group restore did not restore backed-up group data')
    const unrelated = mainDb.prepare('SELECT value FROM restore_e13_unrelated LIMIT 1').get()
    assert.equal(unrelated?.value, 'after', 'selective group restore modified unrelated data')
  } finally {
    mainDb.close()
  }

  assert.match(await readFile(path.join(sessionDir, 'creds.json'), 'utf8'), /e13-main/)
  assert.match(await readFile(path.join(subbotRoot, 'session', 'creds.json'), 'utf8'), /e13-subbot/)

  console.log('Phase E13 typed backups smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
