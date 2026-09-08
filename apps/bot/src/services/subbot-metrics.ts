import type { DatabaseSync } from 'node:sqlite'
import { economy } from './economy.js'
import { entitlementDb } from './entitlement-bridge.js'

function controlDbs() {
  const databases: DatabaseSync[] = [economy.db]
  try {
    const shared = entitlementDb()
    if (shared !== economy.db) databases.push(shared)
  } catch {}
  return databases
}

function hasSubbotsTable(db: DatabaseSync) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subbots'").get())
  } catch {
    return false
  }
}

export function recordSubbotMessage(instanceId?: number) {
  if (!instanceId) return
  const timestamp = Date.now()
  for (const db of controlDbs()) {
    if (!hasSubbotsTable(db)) continue
    try {
      db.prepare('UPDATE subbots SET messages_processed = messages_processed + 1, last_seen_at = ? WHERE id = ?')
        .run(timestamp, instanceId)
    } catch {}
  }
}

export function recordSubbotDownload(instanceId: number | undefined, bytes: number) {
  if (!instanceId || !Number.isFinite(bytes) || bytes <= 0) return
  const timestamp = Date.now()
  const amount = Math.floor(bytes)
  for (const db of controlDbs()) {
    if (!hasSubbotsTable(db)) continue
    try {
      db.prepare('UPDATE subbots SET download_bytes = download_bytes + ?, last_seen_at = ? WHERE id = ?')
        .run(amount, timestamp, instanceId)
    } catch {}
  }
}
