import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from '../config.js'
import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.walletDb
const DAY = 86_400_000
const DEFAULT_SCORE = 650
const MIN_SCORE = 300
const MAX_SCORE = 850
const MAX_LATE_DAYS = 30
const LATE_FEE_CAP_BP = 3500
const now = () => Date.now()

export type BankLoanStatus = 'active' | 'delinquent' | 'defaulted' | 'paid'

type BankProfile = {
  userJid: string
  creditScore: number
  completedLoans: number
  lateLoans: number
  defaults: number
  createdAt: number
  updatedAt: number
}

type BankLoanRow = {
  id: number
  sourceKey: string | null
  userJid: string
  principal: number
  interestBp: number
  originalDue: number
  balanceDue: number
  createdAt: number
  dueAt: number
  status: BankLoanStatus
  lateFeeTotal: number
  lateDaysApplied: number
}

type CreditTier = {
  label: string
  minScore: number
  interestBp: number
  multiplier: number
  cap: number
  termDays: number
}

const CREDIT_TIERS: CreditTier[] = [
  { label: 'Excelente', minScore: 800, interestBp: 500, multiplier: 1.50, cap: 100_000, termDays: 14 },
  { label: 'Muy bueno', minScore: 750, interestBp: 650, multiplier: 1.25, cap: 75_000, termDays: 14 },
  { label: 'Bueno', minScore: 700, interestBp: 800, multiplier: 1.00, cap: 50_000, termDays: 10 },
  { label: 'Estándar', minScore: 650, interestBp: 1000, multiplier: 0.75, cap: 30_000, termDays: 10 },
  { label: 'Riesgo medio', minScore: 600, interestBp: 1350, multiplier: 0.50, cap: 15_000, termDays: 7 },
  { label: 'Alto riesgo', minScore: 300, interestBp: 1800, multiplier: 0.30, cap: 8_000, termDays: 7 },
]

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_profiles (
    user_jid TEXT PRIMARY KEY,
    credit_score INTEGER NOT NULL DEFAULT ${DEFAULT_SCORE},
    completed_loans INTEGER NOT NULL DEFAULT 0,
    late_loans INTEGER NOT NULL DEFAULT 0,
    defaults INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bank_loans_v10 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT UNIQUE,
    user_jid TEXT NOT NULL,
    principal INTEGER NOT NULL,
    interest_bp INTEGER NOT NULL,
    original_due INTEGER NOT NULL,
    balance_due INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    late_fee_total INTEGER NOT NULL DEFAULT 0,
    late_days_applied INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bank_loans_v10_user_status
    ON bank_loans_v10(user_jid, status, due_at);

  CREATE TABLE IF NOT EXISTS bank_events_v10 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    loan_id INTEGER,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    balance_after INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bank_events_v10_user
    ON bank_events_v10(user_jid, created_at DESC);

  CREATE TABLE IF NOT EXISTS bank_migrations_v10 (
    source_id TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    loans_migrated INTEGER NOT NULL DEFAULT 0,
    migrated_at INTEGER NOT NULL
  );
`)

function clampScore(value: number) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(value)))
}

function tierFor(score: number) {
  return CREDIT_TIERS.find((tier) => score >= tier.minScore) ?? CREDIT_TIERS[CREDIT_TIERS.length - 1]!
}

function ensureWallet(userJid: string) {
  const stamp = now()
  db.prepare(`INSERT OR IGNORE INTO global_economy_users(user_jid, wallet, bank, created_at, updated_at)
    VALUES(?, 250, 0, ?, ?)`).run(userJid, stamp, stamp)
}

function walletBalance(userJid: string) {
  ensureWallet(userJid)
  const row = db.prepare('SELECT wallet, bank FROM global_economy_users WHERE user_jid = ?').get(userJid) as { wallet: number; bank: number }
  const wallet = Number(row.wallet ?? 0)
  const bank = Number(row.bank ?? 0)
  return { wallet, bank, total: wallet + bank }
}

function ensureProfile(userJid: string): BankProfile {
  ensureWallet(userJid)
  const stamp = now()
  db.prepare(`INSERT OR IGNORE INTO bank_profiles(user_jid, credit_score, created_at, updated_at)
    VALUES(?, ?, ?, ?)`).run(userJid, DEFAULT_SCORE, stamp, stamp)
  return db.prepare(`SELECT user_jid AS userJid, credit_score AS creditScore,
    completed_loans AS completedLoans, late_loans AS lateLoans, defaults,
    created_at AS createdAt, updated_at AS updatedAt
    FROM bank_profiles WHERE user_jid = ?`).get(userJid) as BankProfile
}

function bankEvent(userJid: string, loanId: number | null, kind: string, amount = 0, balanceAfter: number | null = null, note?: string) {
  db.prepare(`INSERT INTO bank_events_v10(user_jid, loan_id, kind, amount, balance_after, note, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)`).run(userJid, loanId, kind, Math.trunc(amount), balanceAfter, note ?? null, now())
}

function globalLedger(userJid: string, kind: string, amount: number, note?: string) {
  db.prepare(`INSERT INTO economy_global_ledger(user_jid, kind, amount, note, instance_role, instance_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)`).run(
      userJid,
      kind,
      Math.trunc(amount),
      note ?? null,
      process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main',
      Number(process.env.NEXORA_SUBBOT_ID || 0) || null,
      now(),
    )
}

function changeScore(userJid: string, delta: number, reason: string, loanId?: number) {
  const profile = ensureProfile(userJid)
  const next = clampScore(profile.creditScore + delta)
  if (next === profile.creditScore) return next
  db.prepare('UPDATE bank_profiles SET credit_score = ?, updated_at = ? WHERE user_jid = ?').run(next, now(), userJid)
  bankEvent(userJid, loanId ?? null, 'credit_score', delta, null, `${reason}:${profile.creditScore}->${next}`)
  return next
}

function openLoansRaw(userJid: string) {
  return db.prepare(`SELECT id, source_key AS sourceKey, user_jid AS userJid, principal,
    interest_bp AS interestBp, original_due AS originalDue, balance_due AS balanceDue,
    created_at AS createdAt, due_at AS dueAt, status,
    late_fee_total AS lateFeeTotal, late_days_applied AS lateDaysApplied
    FROM bank_loans_v10
    WHERE user_jid = ? AND status IN ('active', 'delinquent', 'defaulted') AND balance_due > 0
    ORDER BY due_at ASC, id ASC`).all(userJid) as BankLoanRow[]
}

function applyDelinquency(userJid: string) {
  ensureProfile(userJid)
  db.exec('BEGIN IMMEDIATE')
  try {
    const stamp = now()
    const loans = openLoansRaw(userJid)
    for (const loan of loans) {
      if (loan.balanceDue <= 0 || stamp <= loan.dueAt) continue
      const overdueDays = Math.min(MAX_LATE_DAYS, Math.max(1, Math.floor((stamp - loan.dueAt) / DAY) + 1))
      const newDays = Math.max(0, overdueDays - loan.lateDaysApplied)
      if (!newDays) continue

      const firstLate = loan.lateDaysApplied === 0
      const enteringDefault = overdueDays >= MAX_LATE_DAYS && loan.status !== 'defaulted'
      const feeCap = Math.ceil(loan.principal * LATE_FEE_CAP_BP / 10_000)
      const feeRoom = Math.max(0, feeCap - loan.lateFeeTotal)
      const lateFee = Math.min(feeRoom, Math.ceil(loan.balanceDue * 0.01 * newDays))
      const nextBalance = loan.balanceDue + lateFee
      const nextStatus: BankLoanStatus = enteringDefault || loan.status === 'defaulted' ? 'defaulted' : 'delinquent'

      db.prepare(`UPDATE bank_loans_v10 SET balance_due = ?, status = ?,
        late_fee_total = late_fee_total + ?, late_days_applied = ?, updated_at = ? WHERE id = ?`)
        .run(nextBalance, nextStatus, lateFee, overdueDays, stamp, loan.id)

      if (firstLate) {
        db.prepare('UPDATE bank_profiles SET late_loans = late_loans + 1, updated_at = ? WHERE user_jid = ?').run(stamp, userJid)
        changeScore(userJid, -20, 'primer_atraso', loan.id)
      }
      changeScore(userJid, -Math.min(30, newDays * 2), 'dias_mora', loan.id)
      if (enteringDefault) {
        db.prepare('UPDATE bank_profiles SET defaults = defaults + 1, updated_at = ? WHERE user_jid = ?').run(stamp, userJid)
        changeScore(userJid, -60, 'default_30_dias', loan.id)
      }
      if (lateFee > 0) {
        bankEvent(userJid, loan.id, 'late_fee', lateFee, nextBalance, `${newDays} día(s) nuevos de mora`)
        globalLedger(userJid, 'bank_late_fee', -lateFee, `loan:${loan.id}`)
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function creditWallet(userJid: string, amount: number, kind: string, note?: string) {
  const value = Math.max(0, Math.floor(amount))
  ensureWallet(userJid)
  db.prepare('UPDATE global_economy_users SET wallet = wallet + ?, updated_at = ? WHERE user_jid = ?').run(value, now(), userJid)
  globalLedger(userJid, kind, value, note)
}

function debitFunds(userJid: string, requested: number) {
  const balance = walletBalance(userJid)
  const amount = Math.min(Math.max(0, Math.floor(requested)), balance.total)
  if (amount <= 0) throw new Error('No tienes NXC disponibles para realizar el pago.')
  const walletUse = Math.min(balance.wallet, amount)
  const bankUse = amount - walletUse
  db.prepare('UPDATE global_economy_users SET wallet = wallet - ?, bank = bank - ?, updated_at = ? WHERE user_jid = ?')
    .run(walletUse, bankUse, now(), userJid)
  return { amount, walletUse, bankUse }
}

function legacyRows(source: DatabaseSync) {
  if (!source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='economy_bank_loans'").get()) return []
  return source.prepare(`SELECT id, user_jid AS userJid, principal, balance_due AS balanceDue,
    created_at AS createdAt, due_at AS dueAt, status FROM economy_bank_loans ORDER BY id`).all() as Array<{
      id: number
      userJid: string
      principal: number
      balanceDue: number
      createdAt: number
      dueAt: number
      status: string
    }>
}

function migrateLegacySource(source: DatabaseSync, sourceId: string, sourceFile: string) {
  if (db.prepare('SELECT 1 FROM bank_migrations_v10 WHERE source_id = ?').get(sourceId)) return
  const rows = legacyRows(source)
  let migrated = 0
  for (const row of rows) {
    ensureProfile(row.userJid)
    const status: BankLoanStatus = row.status === 'paid' || row.balanceDue <= 0 ? 'paid' : 'active'
    const originalDue = Math.max(Number(row.balanceDue), Math.ceil(Number(row.principal) * 1.12))
    const result = db.prepare(`INSERT OR IGNORE INTO bank_loans_v10(
      source_key, user_jid, principal, interest_bp, original_due, balance_due,
      created_at, due_at, status, updated_at
    ) VALUES(?, ?, ?, 1200, ?, ?, ?, ?, ?, ?)`).run(
      `${sourceId}:${row.id}`,
      row.userJid,
      Number(row.principal),
      originalDue,
      Math.max(0, Number(row.balanceDue)),
      Number(row.createdAt) || now(),
      Number(row.dueAt) || now(),
      status,
      now(),
    )
    if (Number(result.changes) > 0) migrated += 1
  }
  db.prepare(`INSERT OR IGNORE INTO bank_migrations_v10(source_id, source_file, loans_migrated, migrated_at)
    VALUES(?, ?, ?, ?)`).run(sourceId, sourceFile, migrated, now())
}

function migrateLegacyBanking() {
  const role = process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main'
  const sourceId = role === 'subbot' ? `subbot:${process.env.NEXORA_SUBBOT_ID || path.basename(config.dataDir)}` : 'main'
  migrateLegacySource(economy.db, sourceId, economy.file)

  if (role !== 'main') return
  const root = path.join(config.dataDir, 'subbots')
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sourceFile = path.join(root, entry.name, 'ghostnexora.sqlite')
    if (!existsSync(sourceFile)) continue
    const childId = `subbot:${entry.name}`
    if (db.prepare('SELECT 1 FROM bank_migrations_v10 WHERE source_id = ?').get(childId)) continue
    let source: DatabaseSync | null = null
    try {
      source = new DatabaseSync(sourceFile, { readOnly: true })
      migrateLegacySource(source, childId, sourceFile)
    } catch {
      // El worker del subbot volverá a intentar su migración al iniciar.
    } finally {
      try { source?.close() } catch {}
    }
  }
}

migrateLegacyBanking()

function eligibility(userJid: string) {
  applyDelinquency(userJid)
  const profile = ensureProfile(userJid)
  const tier = tierFor(profile.creditScore)
  const balance = walletBalance(userJid)
  const behaviorBonus = Math.min(10_000, profile.completedLoans * 500)
  const defaultPenalty = profile.defaults * 1_000
  const calculated = 1_000 + Math.floor(balance.total * tier.multiplier) + behaviorBonus - defaultPenalty
  const maxLoan = Math.max(500, Math.min(tier.cap, calculated))
  return { profile, tier, balance, maxLoan, minLoan: 250 }
}

export const bankingV10 = {
  eligibility,

  status(userJid: string) {
    const credit = eligibility(userJid)
    const loans = openLoansRaw(userJid)
    const totalDebt = loans.reduce((sum, loan) => sum + loan.balanceDue, 0)
    return { ...credit, loans, totalDebt }
  },

  quote(userJid: string, amount: number) {
    const credit = eligibility(userJid)
    const value = Math.floor(amount)
    if (!Number.isFinite(value) || value < credit.minLoan) throw new Error(`El préstamo mínimo es ${credit.minLoan} ${COIN_SYMBOL}.`)
    if (value > credit.maxLoan) throw new Error(`Tu límite actual es ${credit.maxLoan.toLocaleString('es-MX')} ${COIN_SYMBOL}.`)
    const interest = Math.ceil(value * credit.tier.interestBp / 10_000)
    return {
      amount: value,
      interest,
      totalDue: value + interest,
      interestPercent: credit.tier.interestBp / 100,
      termDays: credit.tier.termDays,
      dueAt: now() + credit.tier.termDays * DAY,
      ...credit,
    }
  },

  requestLoan(userJid: string, amount: number) {
    applyDelinquency(userJid)
    if (openLoansRaw(userJid).length) throw new Error('Debes liquidar tus deudas bancarias pendientes antes de solicitar otro préstamo.')
    const quote = this.quote(userJid, amount)
    const stamp = now()
    db.exec('BEGIN IMMEDIATE')
    try {
      if (openLoansRaw(userJid).length) throw new Error('Ya existe una deuda bancaria activa.')
      const dueAt = stamp + quote.termDays * DAY
      const result = db.prepare(`INSERT INTO bank_loans_v10(
        user_jid, principal, interest_bp, original_due, balance_due, created_at, due_at, status, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, 'active', ?)`).run(
        userJid,
        quote.amount,
        quote.tier.interestBp,
        quote.totalDue,
        quote.totalDue,
        stamp,
        dueAt,
        stamp,
      )
      const loanId = Number(result.lastInsertRowid)
      creditWallet(userJid, quote.amount, 'bank_loan_v10', `loan:${loanId}`)
      bankEvent(userJid, loanId, 'loan_opened', quote.amount, quote.totalDue, `score:${quote.profile.creditScore};rate:${quote.interestPercent}%`)
      db.exec('COMMIT')
      return { ...quote, loanId, dueAt, balance: walletBalance(userJid) }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  },

  pay(userJid: string, requestedAmount?: number) {
    applyDelinquency(userJid)
    const initial = openLoansRaw(userJid)
    if (!initial.length) throw new Error('No tienes préstamos bancarios pendientes.')
    const totalDebt = initial.reduce((sum, loan) => sum + loan.balanceDue, 0)
    const available = walletBalance(userJid).total
    const wanted = requestedAmount && requestedAmount > 0 ? Math.floor(requestedAmount) : totalDebt
    const payable = Math.min(wanted, totalDebt, available)
    if (payable <= 0) throw new Error('No tienes NXC disponibles para pagar el préstamo.')

    db.exec('BEGIN IMMEDIATE')
    try {
      const loans = openLoansRaw(userJid)
      const debit = debitFunds(userJid, payable)
      let remainingPayment = debit.amount
      const settled: number[] = []
      for (const loan of loans) {
        if (remainingPayment <= 0) break
        const applied = Math.min(remainingPayment, loan.balanceDue)
        const nextDue = loan.balanceDue - applied
        const paid = nextDue <= 0
        db.prepare('UPDATE bank_loans_v10 SET balance_due = ?, status = ?, updated_at = ? WHERE id = ?')
          .run(nextDue, paid ? 'paid' : loan.status, now(), loan.id)
        bankEvent(userJid, loan.id, 'payment', -applied, nextDue, `wallet:${debit.walletUse};bank:${debit.bankUse}`)
        remainingPayment -= applied

        if (paid) {
          settled.push(loan.id)
          const onTime = loan.lateDaysApplied === 0
          const early = onTime && now() + DAY < loan.dueAt
          db.prepare('UPDATE bank_profiles SET completed_loans = completed_loans + 1, updated_at = ? WHERE user_jid = ?').run(now(), userJid)
          changeScore(userJid, onTime ? (early ? 25 : 18) : 5, early ? 'pago_anticipado' : onTime ? 'pago_puntual' : 'deuda_regularizada', loan.id)
          bankEvent(userJid, loan.id, 'loan_paid', 0, 0, onTime ? 'on_time' : 'late')
        }
      }
      globalLedger(userJid, 'bank_loan_payment_v10', -debit.amount, `loans:${loans.map((loan) => loan.id).join(',')}`)
      db.exec('COMMIT')
      const remaining = openLoansRaw(userJid).reduce((sum, loan) => sum + loan.balanceDue, 0)
      return {
        amount: debit.amount,
        walletUsed: debit.walletUse,
        bankUsed: debit.bankUse,
        remaining,
        settled,
        profile: ensureProfile(userJid),
        balance: walletBalance(userJid),
      }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  },

  history(userJid: string, limit = 8) {
    ensureProfile(userJid)
    return db.prepare(`SELECT id, loan_id AS loanId, kind, amount, balance_after AS balanceAfter,
      note, created_at AS createdAt FROM bank_events_v10
      WHERE user_jid = ? ORDER BY created_at DESC LIMIT ?`).all(userJid, Math.max(1, Math.min(20, limit))) as Array<{
        id: number
        loanId: number | null
        kind: string
        amount: number
        balanceAfter: number | null
        note: string | null
        createdAt: number
      }>
  },

  deposit(userJid: string, amount: number) {
    return economy.deposit(userJid, amount)
  },

  withdraw(userJid: string, amount: number) {
    return economy.withdraw(userJid, amount)
  },
}
