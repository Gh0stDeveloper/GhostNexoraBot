import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS group_control_v9 (
    group_jid TEXT PRIMARY KEY,
    anti_view_once INTEGER NOT NULL DEFAULT 0,
    restricted_mode INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`)

function ensure(groupJid: string) {
  db.prepare('INSERT OR IGNORE INTO group_control_v9(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
}

function update(groupJid: string, field: 'anti_view_once' | 'restricted_mode', enabled: boolean) {
  ensure(groupJid)
  db.prepare(`UPDATE group_control_v9 SET ${field} = ?, updated_at = ? WHERE group_jid = ?`).run(enabled ? 1 : 0, now(), groupJid)
}

export const groupControlsV9 = {
  get(groupJid: string) {
    ensure(groupJid)
    const row = db.prepare('SELECT anti_view_once AS antiViewOnce, restricted_mode AS restrictedMode FROM group_control_v9 WHERE group_jid = ?').get(groupJid) as { antiViewOnce: number; restrictedMode: number }
    return { antiViewOnce: Boolean(row?.antiViewOnce), restrictedMode: Boolean(row?.restrictedMode) }
  },

  setAntiViewOnce(groupJid: string, enabled: boolean) {
    update(groupJid, 'anti_view_once', enabled)
    return this.get(groupJid)
  },

  setRestrictedMode(groupJid: string, enabled: boolean) {
    update(groupJid, 'restricted_mode', enabled)
    return this.get(groupJid)
  },
}

export function isViewOnceMessage(message: any) {
  const content = message?.message
  if (!content) return false
  return Boolean(content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension)
}
