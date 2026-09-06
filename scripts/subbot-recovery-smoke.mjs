import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghost-subbot-recovery-'))
const dataDir = path.join(temp, 'main-data')
process.env.NEXORA_RUNTIME_PROFILE = 'full'
process.env.DATA_DIR = dataDir
process.env.SESSION_DIR = path.join(dataDir, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
delete process.env.NEXORA_INSTANCE_ROLE
delete process.env.NEXORA_GLOBAL_CONTROL_DB

const { economy } = await import('../apps/bot/dist/services/economy.js')
const owner = '5215551112222@s.whatsapp.net'
const duration = 7 * 86_400_000
const subbotExpiry = economy.grantEntitlement(owner, 'subbot_slot', duration, { source: 'smoke_purchase' })
const privateExpiry = economy.grantEntitlement(owner, 'private_access', duration, { source: 'smoke_gift' })
const subbotId = economy.createSubbot(owner, subbotExpiry)
economy.updateSubbot(subbotId, { phone: '5215551112222', status: 'online', lastSeenAt: Date.now() })
const fakeSession = path.join(dataDir, 'subbots', String(subbotId), 'session')
mkdirSync(fakeSession, { recursive: true })
writeFileSync(path.join(fakeSession, 'creds.json'), '{"registered":true}')
economy.createPortalToken(owner, subbotId)

const { runSubbotSessionRepairMigration, SUBBOT_SESSION_REPAIR_MIGRATION_ID } = await import('../apps/bot/dist/services/subbot-session-repair.js')
const first = runSubbotSessionRepairMigration()
assert.equal(first.ran, true)
assert.equal(first.reset, 1)

const repaired = economy.getActiveSubbot(owner)
assert.ok(repaired, 'active subbot row must survive the repair')
assert.equal(repaired.id, subbotId)
assert.equal(repaired.status, 'pending')
assert.equal(repaired.phone, null)
assert.equal(repaired.expiresAt, subbotExpiry)
assert.equal(economy.hasEntitlement(owner, 'subbot_slot'), subbotExpiry)
assert.equal(economy.hasEntitlement(owner, 'private_access'), privateExpiry)
assert.equal(existsSync(path.join(dataDir, 'subbots', String(subbotId), 'session', 'creds.json')), false)
assert.equal(Number(economy.db.prepare('SELECT COUNT(*) AS n FROM portal_tokens WHERE subbot_id IS NOT NULL').get().n), 0)
assert.equal(existsSync(path.join(dataDir, '.migrations', `${SUBBOT_SESSION_REPAIR_MIGRATION_ID}.done`)), true)
assert.equal(existsSync(path.join(dataDir, 'backups', `${SUBBOT_SESSION_REPAIR_MIGRATION_ID}.json`)), true)

const second = runSubbotSessionRepairMigration()
assert.equal(second.ran, false, 'migration must never wipe newly paired subbots twice')

// Separate process: emulate a real isolated subbot with its own DATA_DIR and
// verify that private/subbot entitlements are read and written in MainBot DB.
const bridgeRoot = path.join(temp, 'bridge')
const mainControl = path.join(bridgeRoot, 'main', 'ghostnexora.sqlite')
const sharedWallet = path.join(bridgeRoot, 'main', 'nexora-economy.sqlite')
const subData = path.join(bridgeRoot, 'subbot-7')
mkdirSync(path.dirname(mainControl), { recursive: true })

const childCode = String.raw`
  import assert from 'node:assert/strict';
  import { mkdirSync } from 'node:fs';
  import path from 'node:path';
  import { DatabaseSync } from 'node:sqlite';
  mkdirSync(path.dirname(process.env.NEXORA_GLOBAL_CONTROL_DB), { recursive: true });
  const control = new DatabaseSync(process.env.NEXORA_GLOBAL_CONTROL_DB);
  control.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entitlements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_jid TEXT NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL, metadata TEXT, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_entitlements_user_kind ON entitlements(user_jid,kind,expires_at);");
  const user = '5215553334444@s.whatsapp.net';
  const existingExpiry = Date.now() + 86400000;
  control.prepare('INSERT INTO entitlements(user_jid,kind,expires_at,metadata,created_at) VALUES(?,?,?,?,?)').run(user,'private_access',existingExpiry,'{"source":"main"}',Date.now());
  const { economy } = await import(${JSON.stringify(path.join(root, 'apps/bot/dist/services/economy.js'))});
  const { installSharedEntitlementBridge } = await import(${JSON.stringify(path.join(root, 'apps/bot/dist/services/entitlement-bridge.js'))});
  assert.equal(installSharedEntitlementBridge(), true);
  assert.equal(economy.hasEntitlement(user,'private_access'), existingExpiry);
  const granted = economy.grantEntitlement(user,'subbot_slot',86400000,{source:'staff_gift'});
  const row = control.prepare("SELECT MAX(expires_at) AS expiresAt FROM entitlements WHERE user_jid=? AND kind='subbot_slot'").get(user);
  assert.equal(Number(row.expiresAt), granted);
  console.log('shared entitlement bridge: OK');
`

const child = await new Promise((resolve, reject) => {
  const proc = spawn(process.execPath, ['--input-type=module', '-e', childCode], {
    cwd: root,
    env: {
      ...process.env,
      NEXORA_RUNTIME_PROFILE: 'full',
      NEXORA_INSTANCE_ROLE: 'subbot',
      NEXORA_SUBBOT_ID: '7',
      DATA_DIR: subData,
      SESSION_DIR: path.join(subData, 'session'),
      NEXORA_GLOBAL_CONTROL_DB: mainControl,
      NEXORA_GLOBAL_ECONOMY_DB: sharedWallet,
      OLLAMA_ENABLED: 'false',
      WEB_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  proc.stdout.on('data', (chunk) => { stdout += chunk })
  proc.stderr.on('data', (chunk) => { stderr += chunk })
  proc.once('error', reject)
  proc.once('exit', (code) => resolve({ code, stdout, stderr }))
})
assert.equal(child.code, 0, `shared entitlement child failed:\n${child.stdout}\n${child.stderr}`)

console.log('subbot recovery smoke: OK')
