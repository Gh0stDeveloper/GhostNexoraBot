#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-economy-smoke-'))
const mainDir = path.join(temp, 'main')
const subDir = path.join(mainDir, 'subbots', '1')
const shared = path.join(mainDir, 'nexora-economy.sqlite')
const user = '5215550001234@s.whatsapp.net'

function seedLegacy(dir, wallet, bank) {
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, 'ghostnexora.sqlite'))
  db.exec(`
    CREATE TABLE economy_users (
      user_jid TEXT PRIMARY KEY,
      wallet INTEGER NOT NULL DEFAULT 250,
      bank INTEGER NOT NULL DEFAULT 0,
      last_work INTEGER NOT NULL DEFAULT 0,
      last_rob INTEGER NOT NULL DEFAULT 0,
      profession TEXT NOT NULL DEFAULT 'developer',
      created_at INTEGER NOT NULL
    );
  `)
  db.prepare('INSERT INTO economy_users(user_jid, wallet, bank, created_at) VALUES(?, ?, ?, ?)')
    .run(user, wallet, bank, Date.now())
  db.close()
}

function runEconomy(env, statement) {
  const source = `
    const { economy } = await import('./apps/bot/dist/services/economy.js');
    await import('./apps/bot/dist/services/economy-wallet-reconcile.js');
    ${statement}
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    env: {
      ...process.env,
      ENV_FILE: path.join(temp, 'nonexistent.env'),
      DATA_DIR: env.DATA_DIR,
      SESSION_DIR: path.join(env.DATA_DIR, 'session'),
      NEXORA_GLOBAL_ECONOMY_DB: shared,
      NEXORA_INSTANCE_ROLE: env.NEXORA_INSTANCE_ROLE || 'main',
      NEXORA_SUBBOT_ID: env.NEXORA_SUBBOT_ID || '',
      OWNER_NUMBERS: '',
      ADMIN_WEB_TOKEN: 'ci-economy-smoke-token',
    },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`economy child failed (${result.status}):\n${result.stderr || result.stdout}`)
  }
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  return line ? JSON.parse(line) : null
}

try {
  seedLegacy(mainDir, 1000, 100)

  const first = runEconomy({ DATA_DIR: mainDir }, `console.log(JSON.stringify(economy.balance('${user}')));`)
  if (first.wallet !== 1000 || first.bank !== 100 || first.total !== 1100) {
    throw new Error(`main migration mismatch: ${JSON.stringify(first)}`)
  }

  // Simula una billetera histórica creada por un subbot después del primer arranque.
  seedLegacy(subDir, 500, 100)
  const sub = runEconomy(
    { DATA_DIR: subDir, NEXORA_INSTANCE_ROLE: 'subbot', NEXORA_SUBBOT_ID: '1' },
    `
      const before = economy.balance('${user}');
      economy.db.prepare('UPDATE economy_users SET wallet = wallet + 75 WHERE user_jid = ?').run('${user}');
      const after = economy.balance('${user}');
      console.log(JSON.stringify({ before, after }));
    `,
  )

  // Conserva exactamente los dos saldos históricos: 1100 main + 600 sub = 1700.
  if (sub.before.total !== 1700 || sub.before.wallet !== 1500 || sub.before.bank !== 200) {
    throw new Error(`subbot merge mismatch: ${JSON.stringify(sub.before)}`)
  }
  if (sub.after.total !== 1775 || sub.after.wallet !== 1575 || sub.after.bank !== 200) {
    throw new Error(`subbot shared mutation mismatch: ${JSON.stringify(sub.after)}`)
  }

  // Reiniciar MainBot no debe volver a sumar ninguna fuente ya migrada.
  const final = runEconomy({ DATA_DIR: mainDir }, `console.log(JSON.stringify(economy.balance('${user}')));`)
  if (final.total !== 1775 || final.wallet !== 1575 || final.bank !== 200) {
    throw new Error(`idempotency/global visibility mismatch: ${JSON.stringify(final)}`)
  }

  const db = new DatabaseSync(shared, { readOnly: true })
  const markers = db.prepare('SELECT source_id AS sourceId FROM wallet_migrations ORDER BY source_id').all()
  const reconciled = db.prepare('SELECT source_id AS sourceId FROM wallet_fullsum_sources ORDER BY source_id').all()
  db.close()
  const ids = markers.map((row) => row.sourceId)
  const fullIds = reconciled.map((row) => row.sourceId)
  if (!ids.includes('main') || !ids.includes('subbot:1') || !fullIds.includes('main') || !fullIds.includes('subbot:1')) {
    throw new Error(`migration markers missing: ${JSON.stringify({ ids, fullIds })}`)
  }

  console.log('economy global wallet smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
