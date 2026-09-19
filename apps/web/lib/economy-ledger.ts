import type { DatabaseSync } from 'node:sqlite'
import { openBotDb, openGlobalEconomyDb } from './runtime'

export type EconomyLedgerFilters = {
  instanceKey: string
  user: string
  kind: string
  source: string
  days: number
  limit?: number
}

export type EconomyLedgerTransaction = {
  transactionId: string
  userJid: string
  displayName: string | null
  kind: string
  amount: number
  walletDelta: number
  bankDelta: number
  walletBefore: number | null
  bankBefore: number | null
  balanceBefore: number | null
  walletAfter: number
  bankAfter: number
  balanceAfter: number
  source: string
  counterpartyJid: string | null
  note: string | null
  instanceRole: string | null
  instanceId: number | null
  attributed: boolean
  createdAt: number
}

export type EconomyLedgerSnapshot = {
  available: boolean
  rows: EconomyLedgerTransaction[]
  totals: {
    transactions: number
    credits: number
    debits: number
    net: number
    unattributed: number
  }
  kinds: string[]
  sources: string[]
}

function tableExists(db: DatabaseSync, name: string) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
  } catch {
    return false
  }
}

function normalizeDays(value: number) {
  if (!Number.isFinite(value)) return 7
  return [1, 7, 30, 90].includes(Math.trunc(value)) ? Math.trunc(value) : 7
}

function displayNames(userJids: string[]) {
  const map = new Map<string, string>()
  if (!userJids.length) return map
  const db = openBotDb()
  if (!db) return map
  try {
    if (!tableExists(db, 'ops_user_metrics')) return map
    const wanted = new Set(userJids)
    const rows = db.prepare(`SELECT user_jid AS userJid, display_name AS displayName, last_at AS lastAt
      FROM ops_user_metrics
      WHERE display_name IS NOT NULL AND TRIM(display_name) <> ''
      ORDER BY last_at DESC LIMIT 5000`).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      const userJid = String(row.userJid ?? '')
      if (!wanted.has(userJid) || map.has(userJid)) continue
      map.set(userJid, String(row.displayName ?? '').trim())
    }
    return map
  } finally {
    db.close()
  }
}

function instanceClause(instanceKey: string, params: Array<string | number>) {
  if (instanceKey === 'main') {
    return "(instance_role = 'main' OR instance_role IS NULL)"
  }
  const match = /^subbot:(\d+)$/.exec(instanceKey)
  if (!match?.[1]) return '1 = 0'
  params.push(Number(match[1]))
  return "instance_role = 'subbot' AND instance_id = ?"
}

export function readEconomyLedger(filters: EconomyLedgerFilters): EconomyLedgerSnapshot {
  const db = openGlobalEconomyDb()
  const empty: EconomyLedgerSnapshot = {
    available: false,
    rows: [],
    totals: { transactions: 0, credits: 0, debits: 0, net: 0, unattributed: 0 },
    kinds: [],
    sources: [],
  }
  if (!db) return empty

  try {
    if (!tableExists(db, 'economy_transactions')) return empty

    const params: Array<string | number> = []
    const clauses = [instanceClause(filters.instanceKey, params)]
    const days = normalizeDays(filters.days)
    clauses.push('created_at >= ?')
    params.push(Date.now() - days * 86_400_000)

    const user = filters.user.trim().slice(0, 160)
    if (user) {
      const digits = user.replace(/\D/g, '')
      if (digits.length >= 4) {
        clauses.push("(LOWER(user_jid) LIKE LOWER(?) OR REPLACE(REPLACE(SUBSTR(user_jid, 1, INSTR(user_jid, '@') - 1), ':', ''), '+', '') LIKE ?)")
        params.push(`%${user}%`, `%${digits}%`)
      } else {
        clauses.push('LOWER(user_jid) LIKE LOWER(?)')
        params.push(`%${user}%`)
      }
    }

    const kind = filters.kind.trim().slice(0, 80)
    if (kind) {
      clauses.push('kind = ?')
      params.push(kind)
    }

    const source = filters.source.trim().slice(0, 80)
    if (source) {
      clauses.push('source = ?')
      params.push(source)
    }

    const where = clauses.join(' AND ')
    const limit = Math.max(25, Math.min(500, Math.trunc(filters.limit ?? 200)))

    const rawRows = db.prepare(`SELECT
        transaction_id AS transactionId,
        user_jid AS userJid,
        kind,
        amount,
        wallet_delta AS walletDelta,
        bank_delta AS bankDelta,
        wallet_before AS walletBefore,
        bank_before AS bankBefore,
        balance_before AS balanceBefore,
        wallet_after AS walletAfter,
        bank_after AS bankAfter,
        balance_after AS balanceAfter,
        source,
        counterparty_jid AS counterpartyJid,
        note,
        instance_role AS instanceRole,
        instance_id AS instanceId,
        legacy_ledger_id AS legacyLedgerId,
        created_at AS createdAt
      FROM economy_transactions
      WHERE ${where}
      ORDER BY created_at DESC, transaction_id DESC
      LIMIT ?`).all(...params, limit) as Array<Record<string, unknown>>

    const summary = db.prepare(`SELECT
        COUNT(*) AS transactions,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS credits,
        COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS debits,
        COALESCE(SUM(amount), 0) AS net,
        COALESCE(SUM(CASE WHEN source = 'automatic_guard' THEN 1 ELSE 0 END), 0) AS unattributed
      FROM economy_transactions
      WHERE ${where}`).get(...params) as Record<string, unknown> | undefined

    const kindParams: Array<string | number> = []
    const kindWhere = instanceClause(filters.instanceKey, kindParams)
    const kinds = (db.prepare(`SELECT DISTINCT kind FROM economy_transactions
      WHERE ${kindWhere}
      ORDER BY kind COLLATE NOCASE ASC LIMIT 200`).all(...kindParams) as Array<{ kind?: string }>)
      .map((row) => String(row.kind ?? '')).filter(Boolean)

    const sourceParams: Array<string | number> = []
    const sourceWhere = instanceClause(filters.instanceKey, sourceParams)
    const sources = (db.prepare(`SELECT DISTINCT source FROM economy_transactions
      WHERE ${sourceWhere}
      ORDER BY source COLLATE NOCASE ASC LIMIT 200`).all(...sourceParams) as Array<{ source?: string }>)
      .map((row) => String(row.source ?? '')).filter(Boolean)

    const names = displayNames(rawRows.map((row) => String(row.userJid ?? '')))

    return {
      available: true,
      rows: rawRows.map((row) => ({
        transactionId: String(row.transactionId ?? ''),
        userJid: String(row.userJid ?? ''),
        displayName: names.get(String(row.userJid ?? '')) ?? null,
        kind: String(row.kind ?? ''),
        amount: Number(row.amount ?? 0),
        walletDelta: Number(row.walletDelta ?? 0),
        bankDelta: Number(row.bankDelta ?? 0),
        walletBefore: row.walletBefore === null || row.walletBefore === undefined ? null : Number(row.walletBefore),
        bankBefore: row.bankBefore === null || row.bankBefore === undefined ? null : Number(row.bankBefore),
        balanceBefore: row.balanceBefore === null || row.balanceBefore === undefined ? null : Number(row.balanceBefore),
        walletAfter: Number(row.walletAfter ?? 0),
        bankAfter: Number(row.bankAfter ?? 0),
        balanceAfter: Number(row.balanceAfter ?? 0),
        source: String(row.source ?? ''),
        counterpartyJid: row.counterpartyJid ? String(row.counterpartyJid) : null,
        note: row.note ? String(row.note) : null,
        instanceRole: row.instanceRole ? String(row.instanceRole) : null,
        instanceId: row.instanceId === null || row.instanceId === undefined ? null : Number(row.instanceId),
        attributed: row.source !== 'automatic_guard' || row.legacyLedgerId !== null && row.legacyLedgerId !== undefined,
        createdAt: Number(row.createdAt ?? 0),
      })),
      totals: {
        transactions: Number(summary?.transactions ?? 0),
        credits: Number(summary?.credits ?? 0),
        debits: Number(summary?.debits ?? 0),
        net: Number(summary?.net ?? 0),
        unattributed: Number(summary?.unattributed ?? 0),
      },
      kinds,
      sources,
    }
  } finally {
    db.close()
  }
}
