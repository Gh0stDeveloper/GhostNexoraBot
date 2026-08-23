import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()
export const MINER_BASE_PRICE = 10_000
export const MINER_HOURLY_YIELD = 25
export const MINER_MAX_COUNT = 5
export const MINER_OFFLINE_CAP_MS = 24 * 60 * 60_000

export const MINER_SUBSCRIPTION_PLANS = {
  '1d': { label: '1 día', durationMs: 86400_000, price: 500 },
  '7d': { label: '7 días', durationMs: 7 * 86400_000, price: 2_800 },
  '15d': { label: '15 días', durationMs: 15 * 86400_000, price: 5_500 },
  '1m': { label: '1 mes', durationMs: 30 * 86400_000, price: 10_000 },
} as const

export type MinerSubscriptionPlanId = keyof typeof MINER_SUBSCRIPTION_PLANS

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_miners (
    user_jid TEXT PRIMARY KEY,
    miner_count INTEGER NOT NULL DEFAULT 0,
    last_claimed_at INTEGER NOT NULL,
    total_mined INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS economy_miner_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    price INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_miner_subscriptions_user_expiry
    ON economy_miner_subscriptions(user_jid, expires_at);
`)

function state(userJid: string) {
  economy.balance(userJid)
  db.prepare('INSERT OR IGNORE INTO economy_miners(user_jid, miner_count, last_claimed_at, updated_at) VALUES(?, 0, ?, ?)').run(userJid, now(), now())
  return db.prepare('SELECT miner_count as legacyCount, last_claimed_at as lastClaimedAt, total_mined as totalMined FROM economy_miners WHERE user_jid = ?').get(userJid) as
    { legacyCount: number; lastClaimedAt: number; totalMined: number }
}

export function minerPrice(currentCount: number) {
  return Math.floor(MINER_BASE_PRICE * Math.pow(1.35, Math.max(0, currentCount)))
}

function activeSubscriptions(userJid: string, at = now()) {
  return db.prepare(`SELECT id, plan_id as planId, starts_at as startsAt, expires_at as expiresAt, price
    FROM economy_miner_subscriptions WHERE user_jid = ? AND expires_at > ? ORDER BY expires_at ASC`)
    .all(userJid, at) as Array<{ id: number; planId: string; startsAt: number; expiresAt: number; price: number }>
}

function pendingFor(userJid: string, row: { legacyCount: number; lastClaimedAt: number }) {
  const end = now()
  const start = Math.max(Number(row.lastClaimedAt), end - MINER_OFFLINE_CAP_MS)
  if (end <= start) return 0

  const hours = (end - start) / 3_600_000
  let amount = Math.max(0, Number(row.legacyCount)) * MINER_HOURLY_YIELD * hours

  const subscriptions = db.prepare(`SELECT starts_at as startsAt, expires_at as expiresAt
    FROM economy_miner_subscriptions
    WHERE user_jid = ? AND expires_at > ? AND starts_at < ?`)
    .all(userJid, start, end) as Array<{ startsAt: number; expiresAt: number }>

  for (const subscription of subscriptions) {
    const overlapStart = Math.max(start, Number(subscription.startsAt))
    const overlapEnd = Math.min(end, Number(subscription.expiresAt))
    if (overlapEnd > overlapStart) {
      amount += MINER_HOURLY_YIELD * ((overlapEnd - overlapStart) / 3_600_000)
    }
  }
  return Math.floor(amount)
}

function credit(userJid: string, amount: number) {
  if (amount <= 0) return
  economy.balance(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'miner_yield', amount, 'NXC passive miner', now())
}

function debitTotal(userJid: string, amount: number, note = 'NXC miner subscription') {
  const balance = economy.balance(userJid)
  if (balance.total < amount) throw new Error(`Necesitas ${amount.toLocaleString('es-MX')} ${COIN_SYMBOL}.`)
  const walletUse = Math.min(balance.wallet, amount)
  const bankUse = amount - walletUse
  db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank - ? WHERE user_jid = ?').run(walletUse, bankUse, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'miner_subscription', -amount, note, now())
}

export const mining = {
  summary(userJid: string) {
    const row = state(userJid)
    const subscriptions = activeSubscriptions(userJid)
    const subscriptionCount = subscriptions.length
    const legacyCount = Math.max(0, Number(row.legacyCount))
    const count = Math.min(MINER_MAX_COUNT, legacyCount + subscriptionCount)
    return {
      count,
      legacyCount,
      subscriptionCount,
      subscriptions,
      lastClaimedAt: row.lastClaimedAt,
      totalMined: row.totalMined,
      pending: pendingFor(userJid, row),
      hourly: count * MINER_HOURLY_YIELD,
      nextPrice: legacyCount < MINER_MAX_COUNT ? minerPrice(legacyCount) : null,
      capHours: MINER_OFFLINE_CAP_MS / 3_600_000,
      nextExpiry: subscriptions[0]?.expiresAt ?? null,
      availableSlots: Math.max(0, MINER_MAX_COUNT - count),
    }
  },

  collect(userJid: string) {
    const row = state(userJid)
    const amount = pendingFor(userJid, row)
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

  // Compatibilidad con instalaciones antiguas que compraron mineros permanentes.
  // La interfaz V5 ya no vende nuevos mineros permanentes.
  buy(userJid: string) {
    const before = state(userJid)
    const current = this.summary(userJid)
    if (current.count >= MINER_MAX_COUNT) throw new Error(`Ya tienes el máximo de ${MINER_MAX_COUNT} mineros.`)
    const pending = pendingFor(userJid, before)
    const price = minerPrice(before.legacyCount)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (pending > 0) credit(userJid, pending)
      debitTotal(userJid, price, 'Legacy permanent NXC miner')
      db.prepare(`UPDATE economy_miners SET miner_count = miner_count + 1, last_claimed_at = ?, total_mined = total_mined + ?, updated_at = ? WHERE user_jid = ?`)
        .run(now(), pending, now(), userJid)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { price, collectedBeforePurchase: pending, balance: economy.balance(userJid), ...this.summary(userJid) }
  },

  purchaseSubscription(userJid: string, planId: MinerSubscriptionPlanId, quantity = 1) {
    const plan = MINER_SUBSCRIPTION_PLANS[planId]
    if (!plan) throw new Error('Plan de minero inválido.')
    const qty = Math.max(1, Math.min(MINER_MAX_COUNT, Math.floor(quantity)))
    const beforeRow = state(userJid)
    const before = this.summary(userJid)
    if (qty > before.availableSlots) {
      throw new Error(`Solo tienes ${before.availableSlots} espacio(s) disponible(s). El máximo es ${MINER_MAX_COUNT} mineros activos.`)
    }
    const pending = pendingFor(userJid, beforeRow)
    const totalPrice = plan.price * qty
    const startsAt = now()
    const expiresAt = startsAt + plan.durationMs

    db.exec('BEGIN IMMEDIATE')
    try {
      if (pending > 0) credit(userJid, pending)
      debitTotal(userJid, totalPrice, `miner:${planId} x${qty}`)
      db.prepare('UPDATE economy_miners SET last_claimed_at = ?, total_mined = total_mined + ?, updated_at = ? WHERE user_jid = ?')
        .run(startsAt, pending, startsAt, userJid)
      const insert = db.prepare(`INSERT INTO economy_miner_subscriptions(user_jid, plan_id, starts_at, expires_at, price, created_at)
        VALUES(?, ?, ?, ?, ?, ?)`)
      for (let i = 0; i < qty; i += 1) insert.run(userJid, planId, startsAt, expiresAt, plan.price, startsAt)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    return {
      planId,
      plan,
      quantity: qty,
      totalPrice,
      startsAt,
      expiresAt,
      collectedBeforePurchase: pending,
      balance: economy.balance(userJid),
      ...this.summary(userJid),
    }
  },
}
