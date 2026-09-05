import { economy, COIN_SYMBOL } from './economy.js'

const localDb = economy.db
const globalDb = economy.walletDb
const now = () => Date.now()

const CRIME_COOLDOWN_MS = 3 * 60_000
const ROB_COOLDOWN_MS = 2 * 60_000

type CrimeScenario = {
  id: string
  label: string
  rewardMin: number
  rewardMax: number
  baseCatchChance: number
  fineMin: number
  fineMax: number
}

const CRIME_SCENARIOS: CrimeScenario[] = [
  { id: 'shop', label: 'hurto menor', rewardMin: 180, rewardMax: 420, baseCatchChance: 0.34, fineMin: 220, fineMax: 480 },
  { id: 'cashbox', label: 'robo a una caja registradora ficticia', rewardMin: 300, rewardMax: 760, baseCatchChance: 0.42, fineMin: 350, fineMax: 720 },
  { id: 'vehicle', label: 'robo de vehículo ficticio', rewardMin: 480, rewardMax: 1200, baseCatchChance: 0.5, fineMin: 600, fineMax: 1200 },
  { id: 'fraud', label: 'fraude financiero ficticio', rewardMin: 650, rewardMax: 1600, baseCatchChance: 0.56, fineMin: 800, fineMax: 1650 },
]

globalDb.exec(`
  CREATE TABLE IF NOT EXISTS economy_fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    source TEXT NOT NULL,
    original_amount INTEGER NOT NULL,
    balance_due INTEGER NOT NULL,
    reason TEXT NOT NULL,
    counterparty_jid TEXT,
    issued_at INTEGER NOT NULL,
    paid_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open'
  );
  CREATE INDEX IF NOT EXISTS idx_economy_fines_user_status ON economy_fines(user_jid, status, issued_at);

  CREATE TABLE IF NOT EXISTS economy_criminal_records (
    user_jid TEXT PRIMARY KEY,
    arrests INTEGER NOT NULL DEFAULT 0,
    successful_crimes INTEGER NOT NULL DEFAULT 0,
    successful_robs INTEGER NOT NULL DEFAULT 0,
    heat INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`)

localDb.exec(`
  CREATE TABLE IF NOT EXISTS economy_justice_cooldowns (
    user_jid TEXT NOT NULL,
    action TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY(user_jid, action)
  );
`)

function rand(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function cooldown(userJid: string, action: 'crime' | 'rob', duration: number) {
  const row = localDb.prepare('SELECT last_used AS lastUsed FROM economy_justice_cooldowns WHERE user_jid = ? AND action = ?').get(userJid, action) as { lastUsed?: number } | undefined
  return Math.max(0, Number(row?.lastUsed ?? 0) + duration - now())
}

function markCooldown(userJid: string, action: 'crime' | 'rob') {
  localDb.prepare(`
    INSERT INTO economy_justice_cooldowns(user_jid, action, last_used) VALUES(?, ?, ?)
    ON CONFLICT(user_jid, action) DO UPDATE SET last_used = excluded.last_used
  `).run(userJid, action, now())
}

function ensureRecord(userJid: string) {
  globalDb.prepare('INSERT OR IGNORE INTO economy_criminal_records(user_jid, updated_at) VALUES(?, ?)').run(userJid, now())
}

function rawRecord(userJid: string) {
  ensureRecord(userJid)
  return globalDb.prepare(`SELECT arrests, successful_crimes AS successfulCrimes, successful_robs AS successfulRobs, heat, updated_at AS updatedAt
    FROM economy_criminal_records WHERE user_jid = ?`).get(userJid) as {
      arrests: number
      successfulCrimes: number
      successfulRobs: number
      heat: number
      updatedAt: number
    }
}

function record(userJid: string) {
  const current = rawRecord(userJid)
  const elapsed = Math.max(0, now() - current.updatedAt)
  const decay = Math.floor(elapsed / (20 * 60_000))
  const heat = Math.max(0, current.heat - decay)
  if (heat !== current.heat) {
    globalDb.prepare('UPDATE economy_criminal_records SET heat = ?, updated_at = ? WHERE user_jid = ?').run(heat, now(), userJid)
  }
  return { ...current, heat }
}

function outstandingFineTotal(userJid: string) {
  const row = globalDb.prepare("SELECT COALESCE(SUM(balance_due), 0) AS total FROM economy_fines WHERE user_jid = ? AND status = 'open'").get(userJid) as { total?: number }
  return Number(row.total ?? 0)
}

function issueFine(userJid: string, source: 'crime' | 'rob', baseAmount: number, reason: string, counterpartyJid?: string) {
  economy.balance(userJid)
  const criminal = record(userJid)
  const wealth = economy.balance(userJid).total
  const recidivism = 1 + Math.min(0.7, criminal.arrests * 0.07)
  const wealthSurcharge = Math.min(650, Math.floor(wealth * 0.025))
  const amount = Math.max(100, Math.floor(baseAmount * recidivism) + wealthSurcharge)

  const result = globalDb.prepare(`INSERT INTO economy_fines(user_jid, source, original_amount, balance_due, reason, counterparty_jid, issued_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)`).run(userJid, source, amount, amount, reason, counterpartyJid ?? null, now())
  globalDb.prepare(`UPDATE economy_criminal_records
    SET arrests = arrests + 1, heat = MIN(100, heat + 18), updated_at = ? WHERE user_jid = ?`).run(now(), userJid)
  return { id: Number(result.lastInsertRowid), amount, due: outstandingFineTotal(userJid) }
}

function credit(userJid: string, amount: number, kind: string, note: string) {
  economy.balance(userJid)
  localDb.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, userJid)
  localDb.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)').run(userJid, kind, amount, note, now())
  globalDb.prepare('INSERT INTO economy_global_ledger(user_jid, kind, amount, note, instance_role, instance_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(userJid, kind, amount, note, process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main', Number(process.env.NEXORA_SUBBOT_ID || 0) || null, now())
}

function transferRob(thiefJid: string, victimJid: string, amount: number) {
  localDb.exec('BEGIN IMMEDIATE')
  try {
    const victim = economy.balance(victimJid)
    const actual = Math.max(0, Math.min(amount, victim.wallet))
    if (actual <= 0) throw new Error('La víctima ya no tiene NXC disponibles en la cartera.')
    localDb.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(actual, victimJid)
    localDb.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(actual, thiefJid)
    localDb.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)').run(thiefJid, 'rob_gain_realistic', actual, victimJid, 'economy justice', now())
    localDb.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)').run(victimJid, 'rob_loss_realistic', -actual, thiefJid, 'economy justice', now())
    localDb.exec('COMMIT')
    return actual
  } catch (error) {
    localDb.exec('ROLLBACK')
    throw error
  }
}

export const economyJustice = {
  fineSummary(userJid: string) {
    const rows = globalDb.prepare(`SELECT id, source, original_amount AS originalAmount, balance_due AS balanceDue, reason, counterparty_jid AS counterpartyJid, issued_at AS issuedAt
      FROM economy_fines WHERE user_jid = ? AND status = 'open' ORDER BY issued_at ASC LIMIT 10`).all(userJid) as Array<{
        id: number
        source: string
        originalAmount: number
        balanceDue: number
        reason: string
        counterpartyJid: string | null
        issuedAt: number
      }>
    return { total: rows.reduce((sum, row) => sum + row.balanceDue, 0), rows, record: record(userJid) }
  },

  payFine(userJid: string, requestedAmount?: number) {
    const summary = this.fineSummary(userJid)
    if (summary.total <= 0) throw new Error('No tienes multas pendientes.')
    const balance = economy.balance(userJid)
    const available = balance.total
    if (available <= 0) throw new Error(`No tienes ${COIN_SYMBOL} disponibles para pagar la multa.`)
    const requested = requestedAmount === undefined ? summary.total : Math.floor(requestedAmount)
    if (!Number.isFinite(requested) || requested <= 0) throw new Error('Indica una cantidad válida para pagar.')
    const paid = Math.min(summary.total, requested, available)
    const walletUse = Math.min(balance.wallet, paid)
    const bankUse = paid - walletUse

    globalDb.exec('BEGIN IMMEDIATE')
    try {
      globalDb.prepare('UPDATE global_economy_users SET wallet = wallet - ?, bank = bank - ?, updated_at = ? WHERE user_jid = ?')
        .run(walletUse, bankUse, now(), userJid)
      let remainingPayment = paid
      const fines = globalDb.prepare("SELECT id, balance_due AS balanceDue FROM economy_fines WHERE user_jid = ? AND status = 'open' ORDER BY issued_at ASC").all(userJid) as Array<{ id: number; balanceDue: number }>
      for (const fine of fines) {
        if (remainingPayment <= 0) break
        const applied = Math.min(remainingPayment, fine.balanceDue)
        const next = fine.balanceDue - applied
        globalDb.prepare("UPDATE economy_fines SET balance_due = ?, status = ?, paid_at = CASE WHEN ? = 0 THEN ? ELSE paid_at END WHERE id = ?")
          .run(next, next === 0 ? 'paid' : 'open', next, now(), fine.id)
        remainingPayment -= applied
      }
      globalDb.prepare('INSERT INTO economy_global_ledger(user_jid, kind, amount, note, instance_role, instance_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .run(userJid, 'fine_payment', -paid, 'justice fine payment', process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main', Number(process.env.NEXORA_SUBBOT_ID || 0) || null, now())
      globalDb.exec('COMMIT')
    } catch (error) {
      globalDb.exec('ROLLBACK')
      throw error
    }

    return { paid, remaining: outstandingFineTotal(userJid), balance: economy.balance(userJid) }
  },

  crime(userJid: string) {
    economy.balance(userJid)
    const fineDue = outstandingFineTotal(userJid)
    if (fineDue > 0) return { ok: false as const, reason: 'fine_due' as const, fineDue }
    const remaining = cooldown(userJid, 'crime', CRIME_COOLDOWN_MS)
    if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, remaining }
    markCooldown(userJid, 'crime')

    const criminal = record(userJid)
    const scenario = CRIME_SCENARIOS[Math.floor(Math.random() * CRIME_SCENARIOS.length)]!
    const catchChance = clamp(scenario.baseCatchChance + criminal.heat * 0.002 + criminal.arrests * 0.012, 0.25, 0.82)
    const caught = Math.random() < catchChance

    if (caught) {
      const fine = issueFine(userJid, 'crime', rand(scenario.fineMin, scenario.fineMax), scenario.label)
      return {
        ok: true as const,
        success: false as const,
        scenario: scenario.label,
        fine,
        catchChance,
        record: record(userJid),
        balance: economy.balance(userJid),
      }
    }

    const reward = rand(scenario.rewardMin, scenario.rewardMax)
    credit(userJid, reward, 'crime_gain_realistic', scenario.label)
    globalDb.prepare(`UPDATE economy_criminal_records
      SET successful_crimes = successful_crimes + 1, heat = MIN(100, heat + 7), updated_at = ? WHERE user_jid = ?`).run(now(), userJid)
    return {
      ok: true as const,
      success: true as const,
      scenario: scenario.label,
      amount: reward,
      catchChance,
      record: record(userJid),
      balance: economy.balance(userJid),
    }
  },

  rob(thiefJid: string, victimJid: string) {
    if (thiefJid === victimJid) throw new Error('No puedes robarte a ti mismo.')
    economy.balance(thiefJid)
    economy.balance(victimJid)
    const fineDue = outstandingFineTotal(thiefJid)
    if (fineDue > 0) return { ok: false as const, reason: 'fine_due' as const, fineDue }
    const remaining = cooldown(thiefJid, 'rob', ROB_COOLDOWN_MS)
    if (remaining > 0) return { ok: false as const, reason: 'cooldown' as const, remaining }
    markCooldown(thiefJid, 'rob')

    const victim = economy.balance(victimJid)
    if (victim.wallet < 75) return { ok: true as const, success: false as const, reason: 'empty' as const, amount: 0, balance: economy.balance(thiefJid) }

    const criminal = record(thiefJid)
    const caughtChance = clamp(0.48 + criminal.heat * 0.002 + criminal.arrests * 0.012, 0.35, 0.82)
    const potential = Math.max(25, Math.min(1000, Math.floor(victim.wallet * (0.06 + Math.random() * 0.17))))
    const caught = Math.random() < caughtChance

    if (caught) {
      const fineBase = rand(180, 420) + Math.min(500, Math.floor(potential * 0.4))
      const fine = issueFine(thiefJid, 'rob', fineBase, 'intento de robo a otro usuario', victimJid)
      return {
        ok: true as const,
        success: false as const,
        reason: 'caught' as const,
        amount: 0,
        fine,
        caughtChance,
        record: record(thiefJid),
        balance: economy.balance(thiefJid),
      }
    }

    const amount = transferRob(thiefJid, victimJid, potential)
    globalDb.prepare(`UPDATE economy_criminal_records
      SET successful_robs = successful_robs + 1, heat = MIN(100, heat + 10), updated_at = ? WHERE user_jid = ?`).run(now(), thiefJid)
    return {
      ok: true as const,
      success: true as const,
      reason: 'success' as const,
      amount,
      caughtChance,
      record: record(thiefJid),
      balance: economy.balance(thiefJid),
    }
  },

  record,
}
