import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghost-wallet-atomic-'))
const dataDir = path.join(temp, 'data')
Object.assign(process.env, {
  NEXORA_RUNTIME_PROFILE: 'full',
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})
delete process.env.NEXORA_INSTANCE_ROLE
delete process.env.NEXORA_GLOBAL_ECONOMY_DB

const { economy } = await import('../apps/bot/dist/services/economy.js')
const { installAtomicWalletBridge } = await import('../apps/bot/dist/services/wallet-atomic.js')
installAtomicWalletBridge()

const sender = '5215559000001@s.whatsapp.net'
const receiverA = '5215559000002@s.whatsapp.net'
const receiverB = '5215559000003@s.whatsapp.net'
for (const jid of [sender, receiverA, receiverB]) economy.balance(jid)
economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 5000, bank = 0, updated_at = ? WHERE user_jid = ?').run(Date.now(), sender)
economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 250, bank = 0, updated_at = ? WHERE user_jid IN (?, ?)').run(Date.now(), receiverA, receiverB)

const childCode = String.raw`
  const { economy } = await import(${JSON.stringify(path.join(root, 'apps/bot/dist/services/economy.js'))});
  const { installAtomicWalletBridge } = await import(${JSON.stringify(path.join(root, 'apps/bot/dist/services/wallet-atomic.js'))});
  installAtomicWalletBridge();
  try {
    economy.transfer(process.env.FROM_JID, process.env.TO_JID, 4000);
    process.exit(0);
  } catch (error) {
    if (/suficientes|saldo cambió/i.test(error instanceof Error ? error.message : String(error))) process.exit(2);
    console.error(error);
    process.exit(3);
  }
`

function transferChild(toJid) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', childCode], {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        SESSION_DIR: path.join(dataDir, 'session'),
        FROM_JID: sender,
        TO_JID: toJid,
        OLLAMA_ENABLED: 'false',
        WEB_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr.on('data', (chunk) => { stderr += chunk })
    proc.once('error', reject)
    proc.once('exit', (code) => resolve({ code, stderr }))
  })
}

const results = await Promise.all([transferChild(receiverA), transferChild(receiverB)])
assert.equal(results.filter((item) => item.code === 0).length, 1, `exactly one concurrent 4000 NXC transfer must succeed: ${JSON.stringify(results)}`)
assert.equal(results.filter((item) => item.code === 2).length, 1, `the other transfer must fail for insufficient funds: ${JSON.stringify(results)}`)

const senderAfter = economy.balance(sender)
const aAfter = economy.balance(receiverA)
const bAfter = economy.balance(receiverB)
assert.equal(senderAfter.wallet, 1000)
assert.equal(aAfter.wallet + bAfter.wallet, 4500)
assert.ok(aAfter.wallet === 4250 || bAfter.wallet === 4250)
assert.ok(aAfter.wallet === 250 || bAfter.wallet === 250)
assert.equal(senderAfter.wallet + aAfter.wallet + bAfter.wallet, 5500, 'transfer must conserve total NXC')

const purchase = economy.purchase(sender, 500, 'private_access', 86_400_000, { product: 'smoke-private' })
assert.equal(economy.balance(sender).wallet, 500)
assert.equal(economy.hasEntitlement(sender, 'private_access'), purchase.expiresAt)

const ledgerOut = economy.walletDb.prepare("SELECT COUNT(*) AS n FROM economy_global_ledger WHERE user_jid = ? AND kind = 'transfer_out'").get(sender)
const ledgerPurchase = economy.walletDb.prepare("SELECT COUNT(*) AS n FROM economy_global_ledger WHERE user_jid = ? AND kind = 'purchase'").get(sender)
assert.equal(Number(ledgerOut.n), 1)
assert.equal(Number(ledgerPurchase.n), 1)

console.log('wallet atomic smoke: OK')
