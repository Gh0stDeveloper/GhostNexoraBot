#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-work-global-'))
const mainDir = path.join(temp, 'main')
const subDir = path.join(temp, 'subbot-7')
const sharedWallet = path.join(temp, 'nexora-economy.sqlite')
const user = '5215551112233@s.whatsapp.net'

mkdirSync(mainDir, { recursive: true })
mkdirSync(subDir, { recursive: true })

function run(dataDir, role, subbotId, source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    env: {
      ...process.env,
      ENV_FILE: path.join(temp, 'missing.env'),
      DATA_DIR: dataDir,
      SESSION_DIR: path.join(dataDir, 'session'),
      NEXORA_GLOBAL_ECONOMY_DB: sharedWallet,
      NEXORA_INSTANCE_ROLE: role,
      NEXORA_SUBBOT_ID: subbotId,
      OWNER_NUMBERS: '',
      ADMIN_WEB_TOKEN: 'economy-work-global-smoke',
      OLLAMA_ENABLED: 'false',
      WEB_ENABLED: 'false',
    },
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `child exit ${result.status}`)
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  return line ? JSON.parse(line) : null
}

try {
  const initial = run(mainDir, 'main', '', `
    const { economy } = await import('./apps/bot/dist/services/economy.js');
    console.log(JSON.stringify(economy.balance('${user}')));
  `)
  if (initial.wallet !== 250 || initial.bank !== 0) throw new Error(`unexpected initial wallet: ${JSON.stringify(initial)}`)

  const worked = run(subDir, 'subbot', '7', `
    const { professionsV2 } = await import('./apps/bot/dist/services/professions-v2.js');
    const result = professionsV2.work('${user}');
    if (!result.ok) throw new Error('work unexpectedly hit cooldown');
    console.log(JSON.stringify({ reward: result.reward, balance: result.balance }));
  `)
  const expectedWallet = 250 + Number(worked.reward)
  if (worked.balance.wallet !== expectedWallet) {
    throw new Error(`work response did not expose persisted wallet: ${JSON.stringify(worked)}`)
  }

  const visibleFromMain = run(mainDir, 'main', '', `
    const { economy } = await import('./apps/bot/dist/services/economy.js');
    console.log(JSON.stringify(economy.balance('${user}')));
  `)
  if (visibleFromMain.wallet !== expectedWallet || visibleFromMain.bank !== 0) {
    throw new Error(`MainBot did not see subbot work reward: ${JSON.stringify({ worked, visibleFromMain })}`)
  }

  const walletDb = new DatabaseSync(sharedWallet, { readOnly: true })
  const row = walletDb.prepare('SELECT wallet, bank FROM global_economy_users WHERE user_jid = ?').get(user)
  const ledger = walletDb.prepare("SELECT amount, instance_role AS role, instance_id AS instanceId FROM economy_global_ledger WHERE user_jid = ? AND kind = 'work_v2' ORDER BY id DESC LIMIT 1").get(user)
  walletDb.close()

  if (Number(row?.wallet ?? -1) !== expectedWallet) throw new Error(`global wallet row mismatch: ${JSON.stringify(row)}`)
  if (Number(ledger?.amount ?? -1) !== Number(worked.reward) || ledger?.role !== 'subbot' || Number(ledger?.instanceId ?? 0) !== 7) {
    throw new Error(`global work ledger mismatch: ${JSON.stringify(ledger)}`)
  }

  console.log('economy work global wallet smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
