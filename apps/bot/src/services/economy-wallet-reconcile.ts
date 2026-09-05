import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { economy } from './economy.js'

const db = economy.walletDb
const STARTER = 250

// EconomyStore historically deducted the duplicated starter grant when a second
// legacy database for the same user was merged. Product semantics now require
// preserving the exact balance that was visible in every historical MainBot /
// subbot wallet. This reconciler restores only the difference that was omitted.
// It is idempotent per source and remains useful for subbots that come online
// after the MainBot migration has already completed.
db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_fullsum_seen_users (
    user_jid TEXT PRIMARY KEY,
    first_source_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wallet_fullsum_sources (
    source_id TEXT PRIMARY KEY,
    reconciled_at INTEGER NOT NULL
  );
`)

type Migration = { sourceId: string; sourceFile: string; migratedAt: number }
type LegacyRow = { userJid: string; wallet: number; bank: number }

function legacyRows(file: string): LegacyRow[] {
  if (!existsSync(file)) return []
  let source: DatabaseSync | null = null
  try {
    source = new DatabaseSync(file, { readOnly: true })
    const exists = source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='economy_users'").get()
    if (!exists) return []
    return source.prepare('SELECT user_jid AS userJid, wallet, bank FROM economy_users').all() as LegacyRow[]
  } finally {
    try { source?.close() } catch {}
  }
}

function omittedContribution(walletRaw: number, bankRaw: number) {
  const wallet = Math.max(0, Number(walletRaw || 0))
  const bank = Math.max(0, Number(bankRaw || 0))
  const total = wallet + bank
  const contributionAfterOldDedup = Math.max(0, total - STARTER)
  const bankAfterOldDedup = Math.min(bank, contributionAfterOldDedup)
  const walletAfterOldDedup = contributionAfterOldDedup - bankAfterOldDedup
  return {
    wallet: Math.max(0, wallet - walletAfterOldDedup),
    bank: Math.max(0, bank - bankAfterOldDedup),
  }
}

export function reconcileHistoricalWalletSums() {
  const migrations = db.prepare(`
    SELECT source_id AS sourceId, source_file AS sourceFile, migrated_at AS migratedAt
    FROM wallet_migrations
    ORDER BY CASE WHEN source_id = 'main' THEN 0 ELSE 1 END, migrated_at ASC, source_id ASC
  `).all() as Migration[]

  for (const migration of migrations) {
    if (db.prepare('SELECT 1 FROM wallet_fullsum_sources WHERE source_id = ?').get(migration.sourceId)) continue
    const rows = legacyRows(migration.sourceFile)

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const seen = db.prepare('SELECT first_source_id AS firstSourceId FROM wallet_fullsum_seen_users WHERE user_jid = ?').get(row.userJid) as { firstSourceId?: string } | undefined
        if (!seen) {
          db.prepare('INSERT INTO wallet_fullsum_seen_users(user_jid, first_source_id, created_at) VALUES(?, ?, ?)')
            .run(row.userJid, migration.sourceId, Date.now())
          continue
        }
        if (seen.firstSourceId === migration.sourceId) continue

        const missing = omittedContribution(row.wallet, row.bank)
        const amount = missing.wallet + missing.bank
        if (amount <= 0) continue
        db.prepare('UPDATE global_economy_users SET wallet = wallet + ?, bank = bank + ?, updated_at = ? WHERE user_jid = ?')
          .run(missing.wallet, missing.bank, Date.now(), row.userJid)
        db.prepare(`INSERT INTO economy_global_ledger(user_jid, kind, amount, note, instance_role, instance_id, created_at)
          VALUES(?, 'legacy_fullsum_reconcile', ?, ?, ?, ?, ?)`).run(
            row.userJid,
            amount,
            `source:${migration.sourceId}`,
            migration.sourceId.startsWith('subbot:') ? 'subbot' : 'main',
            Number(migration.sourceId.split(':')[1] || 0) || null,
            Date.now(),
          )
      }
      db.prepare('INSERT INTO wallet_fullsum_sources(source_id, reconciled_at) VALUES(?, ?)').run(migration.sourceId, Date.now())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

reconcileHistoricalWalletSums()
