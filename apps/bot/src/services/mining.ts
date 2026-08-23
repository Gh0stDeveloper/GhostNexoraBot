import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()
export const MINER_BASE_PRICE = 10_000
export const MINER_HOURLY_YIELD = 25
export const MINER_MAX_COUNT = 5
export const MINER_OFFLINE_CAP_MS = 24 * 60 * 60_000

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_miners (
    user_jid TEXT PRIMARY KEY,
    miner_count INTEGER NOT NULL DEFAULT 0,
    last_claimed_at INTEGER NOT NULL,
    total_mined INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`)

function state(userJid: string) {
  economy.balance(userJid)
  db.prepare('INSERT OR IGNORE INTO economy_miners(user_jid, miner_count, last_claimed_at, updated_at) VALUES(?, 0, ?, ?)').run(userJid, now(), now())
  return db.prepare('SELECT miner_count as count, last_claimed_at as lastClaimedAt, total_mined as totalMined FROM economy_miners WHERE user_jid = ?').get(userJid) as
    { count: number; lastClaimedAt: number; totalMined: number }
}

export function minerPrice(currentCount: number) {
  return Math.floor(MINER_BASE_PRICE * Math.pow(1.35, Math.max(0, currentCount)))
}

function pendingFor(row: { count: number; lastClaimedAt: number }) {
  if (row.count <= 0) return 0
  const elapsed = Math.min(MINER_OFFLINE_CAP_MS, Math.max(0, now() - Number(row.lastClaimedAt)))
  return Math.floor(row.count * MINER_HOURLY_YIELD * (elapsed / 3_600_000))
}

function credit(userJid: string, amount: number) {
  if (amount <= 0) return
  economy.balance(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'miner_yield', amount, 'NXC passive miner', now())
}

function debitTotal(userJid: string, amount: number) {
  const balance = economy.balance(userJid)
  if (balance.total < amount) throw new Error(`Necesitas ${amount.toLocaleString('es-MX')} ${COIN_SYMBOL}.`)
  const walletUse = Math.min(balance.wallet, amount)
  const bankUse = amount - walletUse
  db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank - ? WHERE user_jid = ?').run(walletUse, bankUse, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'miner_purchase', -amount, 'NXC miner', now())
}

export const mining = {
  summary(userJid: string) {
    const row = state(userJid)
    return {
      ...row,
      pending: pendingFor(row),
      hourly: row.count * MINER_HOURLY_YIELD,
      nextPrice: row.count < MINER_MAX_COUNT ? minerPrice(row.count) : null,
      capHours: MINER_OFFLINE_CAP_MS / 3_600_000,
    }
  },

  collect(userJid: string) {
    const row = state(userJid)
    const amount = pendingFor(row)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (amount > 0) credit(userJid, amount)
      db.prepare('UPDATE economy_miners SET last_claimed_at = ?, total_mined = total_mined + ?, updated_at = ? WHERE user_jid = ?')
        .run(now(), amount, now(), userJid)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { amount, balance: economy.balance(userJid), ...this.summary(userJid) }
  },

  buy(userJid: string) {
    const before = state(userJid)
    if (before.count >= MINER_MAX_COUNT) throw new Error(`Ya tienes el máximo de ${MINER_MAX_COUNT} mineros.`)
    const pending = pendingFor(before)
    const price = minerPrice(before.count)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (pending > 0) credit(userJid, pending)
      debitTotal(userJid, price)
      db.prepare(`UPDATE economy_miners SET miner_count = miner_count + 1, last_claimed_at = ?, total_mined = total_mined + ?, updated_at = ? WHERE user_jid = ?`)
        .run(now(), pending, now(), userJid)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { price, collectedBeforePurchase: pending, balance: economy.balance(userJid), ...this.summary(userJid) }
  },
}
