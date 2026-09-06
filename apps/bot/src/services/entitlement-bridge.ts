import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { economy } from './economy.js'

const now = () => Date.now()
let sharedDb: DatabaseSync | null = null

function digitsFromJid(jid: string) {
  return jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
}

function resolvedControlFile() {
  const configured = String(process.env.NEXORA_GLOBAL_CONTROL_DB ?? '').trim()
  if (!configured) return economy.file
  return path.resolve(configured)
}

export function entitlementDb() {
  const controlFile = resolvedControlFile()
  if (path.resolve(controlFile) === path.resolve(economy.file)) return economy.db
  if (sharedDb) return sharedDb

  sharedDb = new DatabaseSync(controlFile)
  sharedDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;')
  sharedDb.exec(`
    CREATE TABLE IF NOT EXISTS entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT NOT NULL,
      kind TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entitlements_user_kind
      ON entitlements(user_jid, kind, expires_at);
  `)
  return sharedDb
}

export function hasSharedEntitlement(userJid: string, kind: string, extraCandidates: string[] = []) {
  const db = entitlementDb()
  const stamp = now()
  const candidates = [...new Set([userJid, ...extraCandidates].filter(Boolean))]

  for (const candidate of candidates) {
    const row = db.prepare(
      'SELECT MAX(expires_at) AS expiresAt FROM entitlements WHERE user_jid = ? AND kind = ? AND expires_at > ?',
    ).get(candidate, kind, stamp) as { expiresAt?: number | null }
    const expiresAt = Number(row?.expiresAt ?? 0)
    if (expiresAt > stamp) return expiresAt
  }

  // Baileys can surface the same user as PN or LID. When the phone digits are
  // available, accept a matching stored entitlement regardless of JID suffix.
  const digitsList = [...new Set(candidates.map(digitsFromJid).filter((value) => value.length >= 8))]
  for (const digits of digitsList) {
    const rows = db.prepare(
      'SELECT user_jid AS userJid, expires_at AS expiresAt FROM entitlements WHERE kind = ? AND expires_at > ? AND user_jid LIKE ?',
    ).all(kind, stamp, `${digits}@%`) as Array<{ userJid: string; expiresAt: number }>
    let best = 0
    for (const row of rows) {
      if (digitsFromJid(row.userJid) === digits && Number(row.expiresAt) > best) best = Number(row.expiresAt)
    }
    if (best > stamp) return best
  }
  return null
}

export function grantSharedEntitlement(userJid: string, kind: string, durationMs: number, metadata?: Record<string, unknown>) {
  const db = entitlementDb()
  const active = db.prepare(
    'SELECT MAX(expires_at) AS expiresAt FROM entitlements WHERE user_jid = ? AND kind = ?',
  ).get(userJid, kind) as { expiresAt?: number | null }
  const base = Math.max(now(), Number(active?.expiresAt ?? 0))
  const expiresAt = base + Math.max(1, Math.floor(durationMs))
  db.prepare('INSERT INTO entitlements(user_jid, kind, expires_at, metadata, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, kind, expiresAt, metadata ? JSON.stringify(metadata) : null, now())
  return expiresAt
}

/**
 * Subbots keep their local cooldown/config DB, but access rights must come from
 * the MainBot control DB. Patching the two EconomyStore methods also makes
 * .buy use the shared entitlement store because purchase() calls
 * this.grantEntitlement() internally.
 */
export function installSharedEntitlementBridge() {
  const db = entitlementDb()
  if (db === economy.db) return false

  economy.hasEntitlement = ((userJid: string, kind: string, extraCandidates: string[] = []) =>
    hasSharedEntitlement(userJid, kind, extraCandidates)) as typeof economy.hasEntitlement
  economy.grantEntitlement = ((userJid: string, kind: string, durationMs: number, metadata?: Record<string, unknown>) =>
    grantSharedEntitlement(userJid, kind, durationMs, metadata)) as typeof economy.grantEntitlement
  return true
}
