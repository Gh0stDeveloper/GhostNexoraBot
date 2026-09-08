import type { DatabaseSync } from 'node:sqlite'
import { economy } from './economy.js'
import { entitlementDb } from './entitlement-bridge.js'

function hasSubbotsTable(db: DatabaseSync) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='subbots'").get())
  } catch {
    return false
  }
}

function metricsDb() {
  // En un worker aislado entitlementDb() apunta al control DB del MainBot.
  // Es la fuente que leen /admin y /subbot, por lo que una sola escritura ahí
  // evita duplicar I/O en la SQLite local de la instancia.
  try {
    const shared = entitlementDb()
    if (hasSubbotsTable(shared)) return shared
  } catch {}
  return economy.db
}

export function recordSubbotMessage(instanceId?: number) {
  if (!instanceId) return
  const db = metricsDb()
  if (!hasSubbotsTable(db)) return
  try {
    db.prepare('UPDATE subbots SET messages_processed = messages_processed + 1, last_seen_at = ? WHERE id = ?')
      .run(Date.now(), instanceId)
  } catch {}
}

export function recordSubbotDownload(instanceId: number | undefined, bytes: number) {
  if (!instanceId || !Number.isFinite(bytes) || bytes <= 0) return
  const db = metricsDb()
  if (!hasSubbotsTable(db)) return
  try {
    db.prepare('UPDATE subbots SET download_bytes = download_bytes + ?, last_seen_at = ? WHERE id = ?')
      .run(Math.floor(bytes), Date.now(), instanceId)
  } catch {}
}
