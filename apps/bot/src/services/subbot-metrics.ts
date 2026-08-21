import { economy } from './economy.js'

export function recordSubbotMessage(instanceId?: number) {
  if (!instanceId) return
  economy.db.prepare('UPDATE subbots SET messages_processed = messages_processed + 1, last_seen_at = ? WHERE id = ?')
    .run(Date.now(), instanceId)
}

export function recordSubbotDownload(instanceId: number | undefined, bytes: number) {
  if (!instanceId || !Number.isFinite(bytes) || bytes <= 0) return
  economy.db.prepare('UPDATE subbots SET download_bytes = download_bytes + ?, last_seen_at = ? WHERE id = ?')
    .run(Math.floor(bytes), Date.now(), instanceId)
}
