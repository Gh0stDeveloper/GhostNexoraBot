import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { economy } from './economy.js'
import { reconcileHistoricalWalletSums } from './economy-wallet-reconcile.js'
import { logger } from '../utils/logger.js'

const MIGRATION_ID = 'subbot-session-reset-2026-09-v1'

function markerPath() {
  return path.join(config.dataDir, '.migrations', `${MIGRATION_ID}.done`)
}

function snapshotPath() {
  return path.join(config.dataDir, 'backups', `${MIGRATION_ID}.json`)
}

function tableExists(name: string) {
  return Boolean(economy.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

/**
 * Repairs the broken generation of subbot sessions introduced by older builds.
 *
 * Durable business state is preserved:
 * - Nexora wallet/bank are reconciled before any old subbot directory is removed.
 * - entitlements/subbot_slot purchases and staff grants are NOT deleted.
 * - subbots rows and expires_at are retained so users do not repurchase.
 *
 * Ephemeral runtime state is reset exactly once:
 * - WhatsApp credentials under data/subbots/*
 * - linked phone/status
 * - portal tokens
 * - old runtime counters
 */
export function runSubbotSessionRepairMigration() {
  if (process.env.NEXORA_INSTANCE_ROLE === 'subbot') return { ran: false, reason: 'subbot_worker' as const }

  const marker = markerPath()
  if (existsSync(marker)) return { ran: false, reason: 'already_applied' as const }

  // EconomyStore has already scanned stored subbot databases by this point.
  // Run the idempotent full-sum reconciler once more immediately before the
  // destructive runtime cleanup so historical NXC can never be lost.
  reconcileHistoricalWalletSums()

  mkdirSync(path.dirname(marker), { recursive: true })
  mkdirSync(path.dirname(snapshotPath()), { recursive: true })

  if (!tableExists('subbots')) {
    writeFileSync(marker, JSON.stringify({ migration: MIGRATION_ID, appliedAt: Date.now(), rows: 0, reason: 'no_subbots_table' }, null, 2))
    return { ran: true, reset: 0, active: 0 }
  }

  const stamp = Date.now()
  const rows = economy.listSubbots()
  const activeRows = rows.filter((row) => row.expiresAt > stamp && row.status !== 'revoked')
  const activeEntitlements = tableExists('entitlements')
    ? economy.db.prepare(`SELECT id, user_jid AS userJid, kind, expires_at AS expiresAt, metadata, created_at AS createdAt
        FROM entitlements
        WHERE kind IN ('subbot_slot', 'private_access') AND expires_at > ?
        ORDER BY expires_at DESC`).all(stamp)
    : []

  // Human-readable recovery snapshot. It intentionally contains no WhatsApp
  // credentials, tokens, cookies or other secrets.
  writeFileSync(snapshotPath(), JSON.stringify({
    migration: MIGRATION_ID,
    createdAt: stamp,
    subbots: rows,
    activeEntitlements,
  }, null, 2), { mode: 0o600 })

  economy.db.exec('BEGIN IMMEDIATE')
  try {
    economy.db.prepare(`UPDATE subbots
      SET phone = NULL,
          status = 'pending',
          last_seen_at = ?,
          messages_processed = 0,
          download_bytes = 0
      WHERE expires_at > ? AND status != 'revoked'`).run(stamp, stamp)

    economy.db.prepare(`UPDATE subbots
      SET status = 'expired', last_seen_at = ?
      WHERE expires_at <= ? AND status NOT IN ('revoked', 'expired')`).run(stamp, stamp)

    if (tableExists('portal_tokens')) {
      economy.db.prepare('DELETE FROM portal_tokens WHERE subbot_id IS NOT NULL').run()
    }
    economy.db.exec('COMMIT')
  } catch (error) {
    economy.db.exec('ROLLBACK')
    throw error
  }

  const subbotData = path.join(config.dataDir, 'subbots')
  rmSync(subbotData, { recursive: true, force: true })
  mkdirSync(subbotData, { recursive: true })

  const result = {
    migration: MIGRATION_ID,
    appliedAt: Date.now(),
    reset: activeRows.length,
    totalRows: rows.length,
    snapshot: snapshotPath(),
  }
  writeFileSync(marker, JSON.stringify(result, null, 2), { mode: 0o600 })
  logger.warn(result, 'one-time subbot session repair applied; active users must pair again')
  return { ran: true, reset: activeRows.length, active: activeRows.length }
}

export const SUBBOT_SESSION_REPAIR_MIGRATION_ID = MIGRATION_ID
