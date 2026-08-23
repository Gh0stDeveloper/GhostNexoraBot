import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()
const ONE_MINUTE = 60_000

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_action_cooldowns (
    user_jid TEXT NOT NULL,
    action TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY(user_jid, action)
  );
`)

function cooldown(userJid: string, action: string, durationMs = ONE_MINUTE) {
  const row = db.prepare('SELECT last_used as lastUsed FROM economy_action_cooldowns WHERE user_jid = ? AND action = ?').get(userJid, action) as { lastUsed?: number } | undefined
  return Math.max(0, Number(row?.lastUsed ?? 0) + durationMs - now())
}

function mark(userJid: string, action: string) {
  db.prepare(`INSERT INTO economy_action_cooldowns(user_jid, action, last_used) VALUES(?, ?, ?)
    ON CONFLICT(user_jid, action) DO UPDATE SET last_used = excluded.last_used`).run(userJid, action, now())
}

function ledger(userJid: string, kind: string, amount: number, counterparty?: string, note?: string) {
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(userJid, kind, amount, counterparty ?? null, note ?? null, now())
}

export const economyV2 = {
  credit(userJid: string, amount: number, reason = 'admin_grant') {
    const value = Math.floor(amount)
    if (!Number.isFinite(value) || value <= 0) throw new Error('La cantidad debe ser mayor a 0.')
    economy.balance(userJid)
    db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
    ledger(userJid, reason, value, undefined, 'credited by bot staff')
    return economy.balance(userJid)
  },

  rob(thiefJid: string, victimJid: string) {
    if (thiefJid === victimJid) throw new Error('No puedes robarte a ti mismo.')
    economy.balance(thiefJid); economy.balance(victimJid)
    const remaining = cooldown(thiefJid, 'rob')
    if (remaining) return { ok: false as const, remaining }
    mark(thiefJid, 'rob')
    const victim = economy.balance(victimJid)
    if (victim.wallet < 50) return { ok: true as const, success: false as const, amount: 0, reason: 'empty' as const, balance: economy.balance(thiefJid) }
    const success = Math.random() < 0.45
    if (!success) {
      const penalty = Math.min(economy.balance(thiefJid).wallet, 35 + Math.floor(Math.random() * 66))
      if (penalty > 0) {
        db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(penalty, thiefJid)
        ledger(thiefJid, 'rob_penalty', -penalty, victimJid)
      }
      return { ok: true as const, success: false as const, amount: penalty, reason: 'failed' as const, balance: economy.balance(thiefJid) }
    }
    const amount = Math.max(20, Math.min(800, Math.floor(victim.wallet * (0.05 + Math.random() * 0.2))))
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(amount, victimJid)
      db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, thiefJid)
      ledger(thiefJid, 'rob_gain', amount, victimJid)
      ledger(victimJid, 'rob_loss', -amount, thiefJid)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    return { ok: true as const, success: true as const, amount, reason: 'success' as const, balance: economy.balance(thiefJid) }
  },

  crime(userJid: string) {
    economy.balance(userJid)
    const remaining = cooldown(userJid, 'crime')
    if (remaining) return { ok: false as const, remaining }
    mark(userJid, 'crime')
    const success = Math.random() < 0.48
    if (success) {
      const amount = 220 + Math.floor(Math.random() * 781)
      db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, userJid)
      ledger(userJid, 'crime_gain_v2', amount)
      return { ok: true as const, success: true as const, amount, balance: economy.balance(userJid) }
    }
    const penalty = Math.min(economy.balance(userJid).wallet, 80 + Math.floor(Math.random() * 221))
    if (penalty) {
      db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(penalty, userJid)
      ledger(userJid, 'crime_penalty_v2', -penalty)
    }
    return { ok: true as const, success: false as const, amount: penalty, balance: economy.balance(userJid) }
  },

  daring(userJid: string) {
    economy.balance(userJid)
    const remaining = cooldown(userJid, 'daring')
    if (remaining) return { ok: false as const, remaining }
    mark(userJid, 'daring')
    const success = Math.random() < 0.68
    const amount = success ? 180 + Math.floor(Math.random() * 521) : Math.min(economy.balance(userJid).wallet, 40 + Math.floor(Math.random() * 121))
    db.prepare(`UPDATE economy_users SET wallet = wallet ${success ? '+' : '-'} ? WHERE user_jid = ?`).run(amount, userJid)
    ledger(userJid, success ? 'daring_gain_v2' : 'daring_penalty_v2', success ? amount : -amount)
    return { ok: true as const, success, amount, balance: economy.balance(userJid) }
  },

  transfer(fromJid: string, toJid: string, amount: number) {
    return economy.transfer(fromJid, toJid, amount)
  },

  globalTop(limit = 10) { return economy.top(limit) },

  format(value: number) { return `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}` },
}
