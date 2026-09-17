import { openBotDb } from './runtime'

export type GroupInsight = {
  groupJid: string
  name: string
  description: string | null
  pictureUrl: string | null
  createdAt: number
  participantCount: number
  adminCount: number
  announce: boolean
  restrictMode: boolean
  messagesToday: number
  messages7d: number
  messages30d: number
  activeToday: number
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function columns(db: NonNullable<ReturnType<typeof openBotDb>>, table: string) {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name?: string }>).map((row) => String(row.name ?? '')))
}

export function readGroupInsights(instanceKey: string, limit = 25): GroupInsight[] {
  const db = openBotDb()
  if (!db) return []
  try {
    if (!tableExists(db, 'ops_groups')) return []
    const groupColumns = columns(db, 'ops_groups')
    const hasStats = tableExists(db, 'ops_group_daily_stats')
    const hasSenders = tableExists(db, 'ops_group_daily_senders')
    const today = Math.floor(Date.now() / 86_400_000)
    const description = groupColumns.has('description') ? 'g.description' : 'NULL'
    const picture = groupColumns.has('picture_url') ? 'g.picture_url' : 'NULL'
    const created = groupColumns.has('created_at') ? 'g.created_at' : '0'
    const statsJoin = hasStats ? 'LEFT JOIN ops_group_daily_stats s ON s.instance_key = g.instance_key AND s.group_jid = g.group_jid AND s.day >= ?' : ''
    const statsFields = hasStats
      ? `COALESCE(SUM(CASE WHEN s.day = ? THEN s.messages ELSE 0 END), 0) AS messagesToday,
         COALESCE(SUM(CASE WHEN s.day >= ? THEN s.messages ELSE 0 END), 0) AS messages7d,
         COALESCE(SUM(s.messages), 0) AS messages30d`
      : '0 AS messagesToday, 0 AS messages7d, 0 AS messages30d'
    // SQL placeholders appear first in SELECT, then JOIN, then WHERE/LIMIT.
    const params: Array<string | number> = []
    if (hasStats) params.push(today, today - 6, today - 29)
    params.push(instanceKey, Math.max(1, Math.min(100, limit)))

    const rows = db.prepare(`SELECT g.group_jid AS groupJid, g.name, ${description} AS description,
        ${picture} AS pictureUrl, ${created} AS createdAt,
        g.participant_count AS participantCount, g.admin_count AS adminCount,
        g.announce, g.restrict_mode AS restrictMode, ${statsFields}
      FROM ops_groups g
      ${statsJoin}
      WHERE g.instance_key = ?
      GROUP BY g.group_jid
      ORDER BY messages7d DESC, g.name COLLATE NOCASE ASC
      LIMIT ?`).all(...params) as unknown as Array<Record<string, string | number | null>>

    const active = new Map<string, number>()
    if (hasSenders) {
      const activeRows = db.prepare(`SELECT group_jid AS groupJid, COUNT(*) AS activeToday
        FROM ops_group_daily_senders WHERE instance_key = ? AND day = ? GROUP BY group_jid`).all(instanceKey, today) as unknown as Array<{ groupJid: string; activeToday: number }>
      for (const row of activeRows) active.set(String(row.groupJid), Number(row.activeToday ?? 0))
    }

    return rows.map((row) => ({
      groupJid: String(row.groupJid),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      pictureUrl: row.pictureUrl ? String(row.pictureUrl) : null,
      createdAt: Number(row.createdAt ?? 0),
      participantCount: Number(row.participantCount ?? 0),
      adminCount: Number(row.adminCount ?? 0),
      announce: Boolean(row.announce),
      restrictMode: Boolean(row.restrictMode),
      messagesToday: Number(row.messagesToday ?? 0),
      messages7d: Number(row.messages7d ?? 0),
      messages30d: Number(row.messages30d ?? 0),
      activeToday: active.get(String(row.groupJid)) ?? 0,
    }))
  } catch {
    return []
  } finally {
    db.close()
  }
}
