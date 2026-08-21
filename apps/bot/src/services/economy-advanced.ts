import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()

function walletDebit(userJid: string, amount: number, kind: string, note?: string) {
  const value = Math.floor(amount)
  if (value <= 0) throw new Error('Cantidad inválida.')
  const balance = economy.balance(userJid)
  if (balance.wallet < value) throw new Error(`Necesitas ${value.toLocaleString('es-MX')} ${COIN_SYMBOL} en la cartera.`)
  db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(value, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, kind, -value, note ?? null, now())
}

function walletCredit(userJid: string, amount: number, kind: string, note?: string) {
  const value = Math.max(0, Math.floor(amount))
  economy.balance(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, kind, value, note ?? null, now())
}

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_advanced_users (
    user_jid TEXT PRIMARY KEY,
    last_daily INTEGER NOT NULL DEFAULT 0,
    last_crime INTEGER NOT NULL DEFAULT 0,
    last_slut INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS economy_investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    principal INTEGER NOT NULL,
    return_amount INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    matures_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_invest_user ON economy_investments(user_jid, status);
  CREATE TABLE IF NOT EXISTS economy_cda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    principal INTEGER NOT NULL,
    return_amount INTEGER NOT NULL,
    term_days INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    matures_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_cda_user ON economy_cda(user_jid, status);
  CREATE TABLE IF NOT EXISTS economy_bank_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    principal INTEGER NOT NULL,
    balance_due INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_bank_loan_user ON economy_bank_loans(user_jid, status);
  CREATE TABLE IF NOT EXISTS economy_peer_loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lender_jid TEXT NOT NULL,
    borrower_jid TEXT NOT NULL,
    principal INTEGER NOT NULL,
    balance_due INTEGER NOT NULL,
    interest_bp INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS idx_peer_borrower ON economy_peer_loans(borrower_jid, status);
`)

function ensureAdvancedUser(userJid: string) {
  economy.balance(userJid)
  db.prepare('INSERT OR IGNORE INTO economy_advanced_users(user_jid) VALUES(?)').run(userJid)
}

function cooldown(userJid: string, column: 'last_daily' | 'last_crime' | 'last_slut', cooldownMs: number) {
  ensureAdvancedUser(userJid)
  const row = db.prepare(`SELECT ${column} AS lastValue FROM economy_advanced_users WHERE user_jid = ?`).get(userJid) as { lastValue?: number }
  return Math.max(0, Number(row.lastValue ?? 0) + cooldownMs - now())
}

export const advancedEconomy = {
  summary(userJid: string) {
    const activeInvestment = db.prepare(`SELECT COALESCE(SUM(principal), 0) AS total FROM economy_investments WHERE user_jid = ? AND status = 'active'`).get(userJid) as { total?: number }
    const activeCda = db.prepare(`SELECT COALESCE(SUM(principal), 0) AS total FROM economy_cda WHERE user_jid = ? AND status = 'active'`).get(userJid) as { total?: number }
    const bankDebt = db.prepare(`SELECT COALESCE(SUM(balance_due), 0) AS total FROM economy_bank_loans WHERE user_jid = ? AND status = 'active'`).get(userJid) as { total?: number }
    const peerDebt = db.prepare(`SELECT COALESCE(SUM(balance_due), 0) AS total FROM economy_peer_loans WHERE borrower_jid = ? AND status = 'active'`).get(userJid) as { total?: number }
    return {
      investments: Number(activeInvestment.total ?? 0),
      cda: Number(activeCda.total ?? 0),
      debt: Number(bankDebt.total ?? 0) + Number(peerDebt.total ?? 0),
    }
  },

  daily(userJid: string) {
    const remaining = cooldown(userJid, 'last_daily', 24 * 60 * 60_000)
    if (remaining > 0) return { ok: false as const, remaining }
    const reward = 300 + Math.floor(Math.random() * 401)
    db.prepare('UPDATE economy_advanced_users SET last_daily = ? WHERE user_jid = ?').run(now(), userJid)
    walletCredit(userJid, reward, 'daily')
    return { ok: true as const, reward, balance: economy.balance(userJid) }
  },

  crime(userJid: string) {
    const remaining = cooldown(userJid, 'last_crime', 45 * 60_000)
    if (remaining > 0) return { ok: false as const, remaining }
    db.prepare('UPDATE economy_advanced_users SET last_crime = ? WHERE user_jid = ?').run(now(), userJid)
    const success = Math.random() < 0.48
    if (success) {
      const amount = 220 + Math.floor(Math.random() * 781)
      walletCredit(userJid, amount, 'crime_gain')
      return { ok: true as const, success: true as const, amount, balance: economy.balance(userJid) }
    }
    const wallet = economy.balance(userJid).wallet
    const penalty = Math.min(wallet, 80 + Math.floor(Math.random() * 221))
    if (penalty > 0) walletDebit(userJid, penalty, 'crime_penalty')
    return { ok: true as const, success: false as const, amount: penalty, balance: economy.balance(userJid) }
  },

  daringWork(userJid: string) {
    const remaining = cooldown(userJid, 'last_slut', 30 * 60_000)
    if (remaining > 0) return { ok: false as const, remaining }
    db.prepare('UPDATE economy_advanced_users SET last_slut = ? WHERE user_jid = ?').run(now(), userJid)
    const success = Math.random() < 0.68
    if (success) {
      const amount = 180 + Math.floor(Math.random() * 521)
      walletCredit(userJid, amount, 'daring_work')
      return { ok: true as const, success: true as const, amount, balance: economy.balance(userJid) }
    }
    const penalty = Math.min(economy.balance(userJid).wallet, 40 + Math.floor(Math.random() * 121))
    if (penalty > 0) walletDebit(userJid, penalty, 'daring_work_penalty')
    return { ok: true as const, success: false as const, amount: penalty, balance: economy.balance(userJid) }
  },

  investment(userJid: string) {
    return db.prepare(`SELECT id, principal, return_amount AS returnAmount, started_at AS startedAt, matures_at AS maturesAt
      FROM economy_investments WHERE user_jid = ? AND status = 'active' ORDER BY id DESC LIMIT 1`)
      .get(userJid) as { id: number; principal: number; returnAmount: number; startedAt: number; maturesAt: number } | undefined
  },

  startInvestment(userJid: string, amount: number, hours = 6) {
    if (this.investment(userJid)) throw new Error('Ya tienes una inversión activa. Usa .invest status o .invest collect.')
    const safeHours = Math.max(1, Math.min(24, Math.floor(hours)))
    walletDebit(userJid, amount, 'investment_open')
    const rate = -15 + Math.floor(Math.random() * 51)
    const returnAmount = Math.max(1, Math.floor(amount * (1 + rate / 100)))
    const maturesAt = now() + safeHours * 60 * 60_000
    const result = db.prepare(`INSERT INTO economy_investments(user_jid, principal, return_amount, started_at, matures_at)
      VALUES(?, ?, ?, ?, ?)`).run(userJid, Math.floor(amount), returnAmount, now(), maturesAt)
    return { id: Number(result.lastInsertRowid), amount: Math.floor(amount), returnAmount, rate, maturesAt, hours: safeHours }
  },

  collectInvestment(userJid: string) {
    const item = this.investment(userJid)
    if (!item) throw new Error('No tienes una inversión activa.')
    if (item.maturesAt > now()) return { ok: false as const, remaining: item.maturesAt - now(), item }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`UPDATE economy_investments SET status = 'collected' WHERE id = ?`).run(item.id)
      walletCredit(userJid, item.returnAmount, 'investment_collect', `investment:${item.id}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true as const, item, profit: item.returnAmount - item.principal, balance: economy.balance(userJid) }
  },

  cda(userJid: string) {
    return db.prepare(`SELECT id, principal, return_amount AS returnAmount, term_days AS termDays, started_at AS startedAt, matures_at AS maturesAt
      FROM economy_cda WHERE user_jid = ? AND status = 'active' ORDER BY id DESC LIMIT 1`)
      .get(userJid) as { id: number; principal: number; returnAmount: number; termDays: number; startedAt: number; maturesAt: number } | undefined
  },

  startCda(userJid: string, days: number, amount: number) {
    if (this.cda(userJid)) throw new Error('Ya tienes un plazo fijo activo.')
    const rates: Record<number, number> = { 3: 3, 6: 7, 9: 12, 12: 18 }
    const rate = rates[days]
    if (!rate) throw new Error('Los plazos disponibles son 3, 6, 9 o 12 días.')
    walletDebit(userJid, amount, 'cda_open')
    const returnAmount = Math.floor(amount * (1 + rate / 100))
    const maturesAt = now() + days * 86400_000
    const result = db.prepare(`INSERT INTO economy_cda(user_jid, principal, return_amount, term_days, started_at, matures_at)
      VALUES(?, ?, ?, ?, ?, ?)`).run(userJid, Math.floor(amount), returnAmount, days, now(), maturesAt)
    return { id: Number(result.lastInsertRowid), amount: Math.floor(amount), returnAmount, rate, days, maturesAt }
  },

  collectCda(userJid: string) {
    const item = this.cda(userJid)
    if (!item) throw new Error('No tienes un plazo fijo activo.')
    if (item.maturesAt > now()) return { ok: false as const, remaining: item.maturesAt - now(), item }
    db.prepare(`UPDATE economy_cda SET status = 'collected' WHERE id = ?`).run(item.id)
    walletCredit(userJid, item.returnAmount, 'cda_collect', `cda:${item.id}`)
    return { ok: true as const, item, balance: economy.balance(userJid) }
  },

  cancelCda(userJid: string) {
    const item = this.cda(userJid)
    if (!item) throw new Error('No tienes un plazo fijo activo.')
    const refund = Math.max(1, Math.floor(item.principal * 0.92))
    db.prepare(`UPDATE economy_cda SET status = 'cancelled' WHERE id = ?`).run(item.id)
    walletCredit(userJid, refund, 'cda_cancel', `cda:${item.id}`)
    return { item, refund, penalty: item.principal - refund, balance: economy.balance(userJid) }
  },

  bankLoan(userJid: string) {
    return db.prepare(`SELECT id, principal, balance_due AS balanceDue, created_at AS createdAt, due_at AS dueAt
      FROM economy_bank_loans WHERE user_jid = ? AND status = 'active' ORDER BY id DESC LIMIT 1`).get(userJid) as
      { id: number; principal: number; balanceDue: number; createdAt: number; dueAt: number } | undefined
  },

  requestBankLoan(userJid: string, amount: number) {
    if (this.bankLoan(userJid)) throw new Error('Ya tienes un préstamo bancario activo.')
    const balance = economy.balance(userJid)
    const maxLoan = Math.max(1000, Math.min(10000, 1000 + Math.floor(balance.total * 0.5)))
    const value = Math.floor(amount)
    if (value < 100 || value > maxLoan) throw new Error(`Puedes pedir entre 100 y ${maxLoan.toLocaleString('es-MX')} ${COIN_SYMBOL}.`)
    const due = Math.ceil(value * 1.12)
    const dueAt = now() + 7 * 86400_000
    db.prepare(`INSERT INTO economy_bank_loans(user_jid, principal, balance_due, created_at, due_at) VALUES(?, ?, ?, ?, ?)`)
      .run(userJid, value, due, now(), dueAt)
    walletCredit(userJid, value, 'bank_loan')
    return { amount: value, due, dueAt, maxLoan, balance: economy.balance(userJid) }
  },

  lend(lenderJid: string, borrowerJid: string, amount: number, interestPercent = 5) {
    if (lenderJid === borrowerJid) throw new Error('No puedes prestarte a ti mismo.')
    const rate = Math.max(0, Math.min(25, Math.floor(interestPercent)))
    const value = Math.floor(amount)
    if (value < 50) throw new Error(`El préstamo mínimo es 50 ${COIN_SYMBOL}.`)
    economy.transfer(lenderJid, borrowerJid, value)
    const due = Math.ceil(value * (1 + rate / 100))
    const result = db.prepare(`INSERT INTO economy_peer_loans(lender_jid, borrower_jid, principal, balance_due, interest_bp, created_at)
      VALUES(?, ?, ?, ?, ?, ?)`).run(lenderJid, borrowerJid, value, due, rate * 100, now())
    return { id: Number(result.lastInsertRowid), amount: value, due, rate }
  },

  debts(userJid: string) {
    const bank = this.bankLoan(userJid)
    const peers = db.prepare(`SELECT id, lender_jid AS lenderJid, principal, balance_due AS balanceDue, interest_bp AS interestBp, created_at AS createdAt
      FROM economy_peer_loans WHERE borrower_jid = ? AND status = 'active' ORDER BY created_at ASC`).all(userJid) as Array<{
        id: number; lenderJid: string; principal: number; balanceDue: number; interestBp: number; createdAt: number
      }>
    return { bank, peers }
  },

  payDebt(userJid: string, requestedAmount?: number) {
    const debts = this.debts(userJid)
    const firstPeer = debts.peers[0]
    const target = debts.bank ? { type: 'bank' as const, due: debts.bank.balanceDue, id: debts.bank.id } : firstPeer ? { type: 'peer' as const, due: firstPeer.balanceDue, id: firstPeer.id, lenderJid: firstPeer.lenderJid } : null
    if (!target) throw new Error('No tienes deudas activas.')
    const wallet = economy.balance(userJid).wallet
    const wanted = requestedAmount && requestedAmount > 0 ? Math.floor(requestedAmount) : target.due
    const amount = Math.min(wanted, target.due, wallet)
    if (amount <= 0) throw new Error('No tienes saldo en la cartera para pagar la deuda.')
    walletDebit(userJid, amount, 'debt_payment', `${target.type}:${target.id}`)
    const remaining = target.due - amount
    if (target.type === 'bank') {
      db.prepare(`UPDATE economy_bank_loans SET balance_due = ?, status = ? WHERE id = ?`).run(remaining, remaining <= 0 ? 'paid' : 'active', target.id)
    } else {
      db.prepare(`UPDATE economy_peer_loans SET balance_due = ?, status = ? WHERE id = ?`).run(remaining, remaining <= 0 ? 'paid' : 'active', target.id)
      walletCredit(target.lenderJid!, amount, 'peer_loan_payment', `loan:${target.id}`)
    }
    return { type: target.type, amount, remaining, lenderJid: target.type === 'peer' ? target.lenderJid : undefined, balance: economy.balance(userJid) }
  },
}
