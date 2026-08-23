import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

export type GroupStats = {
  groupJid: string
  messages: number
  commands: number
  uniqueUsers: number
  firstSeenAt: number
  lastActivityAt: number
  economyTotal: number
  topUsers: Array<{ userJid: string; messages: number; commands: number }>
}

export type Achievement = {
  id: string
  label: string
  description: string
  titleId: string
  title: string
}

const achievements: Achievement[] = [
  { id: 'first_steps', label: 'Primeros pasos', description: 'Usa al menos 10 comandos.', titleId: 'explorer', title: 'Explorador/a Nexora' },
  { id: 'social_100', label: 'Voz del grupo', description: 'Envía 100 mensajes en grupos.', titleId: 'voice', title: 'Voz de Nexora' },
  { id: 'worker_25', label: 'Profesional', description: 'Completa 25 trabajos.', titleId: 'professional', title: 'Profesional Nexora' },
  { id: 'wealth_10k', label: 'Capital inicial', description: 'Alcanza 10,000 NXC de patrimonio líquido.', titleId: 'investor', title: 'Inversionista' },
  { id: 'wealth_100k', label: 'Magnate', description: 'Alcanza 100,000 NXC de patrimonio líquido.', titleId: 'magnate', title: 'Magnate Nexora' },
  { id: 'reputation_10', label: 'Confiable', description: 'Alcanza 10 puntos de reputación.', titleId: 'trusted', title: 'Miembro Confiable' },
  { id: 'clan_member', label: 'Comunidad', description: 'Forma parte de un clan.', titleId: 'guildmate', title: 'Compañero/a de Gremio' },
  { id: 'market_5', label: 'Comerciante', description: 'Completa 5 ventas en el mercado.', titleId: 'merchant', title: 'Mercader Nexora' },
  { id: 'raid_win', label: 'Cazajefes', description: 'Participa en una raid completada.', titleId: 'raider', title: 'Cazajefes' },
  { id: 'commands_500', label: 'Usuario veterano', description: 'Usa 500 comandos.', titleId: 'veteran', title: 'Veterano/a Nexora' },
]

db.exec(`
  CREATE TABLE IF NOT EXISTS group_activity_v4 (
    group_jid TEXT PRIMARY KEY,
    messages INTEGER NOT NULL DEFAULT 0,
    commands INTEGER NOT NULL DEFAULT 0,
    first_seen_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_user_activity_v4 (
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    commands INTEGER NOT NULL DEFAULT 0,
    first_seen_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    PRIMARY KEY(group_jid, user_jid)
  );
  CREATE TABLE IF NOT EXISTS user_period_activity_v4 (
    user_jid TEXT NOT NULL,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    commands INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_jid, period_type, period_key)
  );
  CREATE TABLE IF NOT EXISTS reputation_events_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_jid TEXT NOT NULL,
    to_jid TEXT NOT NULL,
    value INTEGER NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rep_target_v4 ON reputation_events_v4(to_jid, created_at);
  CREATE INDEX IF NOT EXISTS idx_rep_sender_v4 ON reputation_events_v4(from_jid, created_at);
  CREATE TABLE IF NOT EXISTS user_achievements_v4 (
    user_jid TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(user_jid, achievement_id)
  );
  CREATE TABLE IF NOT EXISTS user_titles_v4 (
    user_jid TEXT NOT NULL,
    title_id TEXT NOT NULL,
    title TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    equipped INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_jid, title_id)
  );
  CREATE TABLE IF NOT EXISTS seasons_v4 (
    season_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS season_rankings_v4 (
    season_key TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    score INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    snapshot_at INTEGER NOT NULL,
    PRIMARY KEY(season_key, user_jid)
  );
`)

function dayKey(at = new Date()) {
  return at.toISOString().slice(0, 10)
}

function weekKey(at = new Date()) {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const activityPeriods = { dayKey, weekKey }

export function observeGroupActivity(groupJid: string, userJid: string, isGroup: boolean, isCommand: boolean) {
  if (!isGroup) return
  const timestamp = now()
  db.prepare(`INSERT INTO group_activity_v4(group_jid, messages, commands, first_seen_at, last_activity_at)
    VALUES(?, 1, ?, ?, ?)
    ON CONFLICT(group_jid) DO UPDATE SET
      messages = messages + 1,
      commands = commands + excluded.commands,
      last_activity_at = excluded.last_activity_at`)
    .run(groupJid, isCommand ? 1 : 0, timestamp, timestamp)
  db.prepare(`INSERT INTO group_user_activity_v4(group_jid, user_jid, messages, commands, first_seen_at, last_activity_at)
    VALUES(?, ?, 1, ?, ?, ?)
    ON CONFLICT(group_jid, user_jid) DO UPDATE SET
      messages = messages + 1,
      commands = commands + excluded.commands,
      last_activity_at = excluded.last_activity_at`)
    .run(groupJid, userJid, isCommand ? 1 : 0, timestamp, timestamp)
  for (const [periodType, periodKey] of [['day', dayKey()] as const, ['week', weekKey()] as const]) {
    db.prepare(`INSERT INTO user_period_activity_v4(user_jid, period_type, period_key, messages, commands)
      VALUES(?, ?, ?, 1, ?)
      ON CONFLICT(user_jid, period_type, period_key) DO UPDATE SET
        messages = messages + 1,
        commands = commands + excluded.commands`)
      .run(userJid, periodType, periodKey, isCommand ? 1 : 0)
  }
}

export function groupStats(groupJid: string): GroupStats {
  const base = db.prepare(`SELECT group_jid as groupJid, messages, commands, first_seen_at as firstSeenAt, last_activity_at as lastActivityAt
    FROM group_activity_v4 WHERE group_jid = ?`).get(groupJid) as Omit<GroupStats, 'uniqueUsers' | 'economyTotal' | 'topUsers'> | undefined
  const unique = db.prepare('SELECT COUNT(*) as count FROM group_user_activity_v4 WHERE group_jid = ?').get(groupJid) as { count: number }
  const economyRow = db.prepare(`SELECT COALESCE(SUM(e.wallet + e.bank), 0) as total
    FROM group_members gm JOIN economy_users e ON e.user_jid = gm.user_jid
    WHERE gm.group_jid = ?`).get(groupJid) as { total?: number } | undefined
  const topUsers = db.prepare(`SELECT user_jid as userJid, messages, commands
    FROM group_user_activity_v4 WHERE group_jid = ? ORDER BY messages DESC, commands DESC LIMIT 10`)
    .all(groupJid) as Array<{ userJid: string; messages: number; commands: number }>
  return {
    groupJid,
    messages: Number(base?.messages ?? 0),
    commands: Number(base?.commands ?? 0),
    uniqueUsers: Number(unique.count ?? 0),
    firstSeenAt: Number(base?.firstSeenAt ?? 0),
    lastActivityAt: Number(base?.lastActivityAt ?? 0),
    economyTotal: Number(economyRow?.total ?? 0),
    topUsers,
  }
}

export function userActivity(userJid: string) {
  const row = db.prepare(`SELECT COALESCE(SUM(messages), 0) as messages, COALESCE(SUM(commands), 0) as commands
    FROM group_user_activity_v4 WHERE user_jid = ?`).get(userJid) as { messages: number; commands: number }
  return { messages: Number(row.messages ?? 0), commands: Number(row.commands ?? 0) }
}

export function periodActivity(userJid: string, periodType: 'day' | 'week', periodKey = periodType === 'day' ? dayKey() : weekKey()) {
  const row = db.prepare(`SELECT messages, commands FROM user_period_activity_v4
    WHERE user_jid = ? AND period_type = ? AND period_key = ?`).get(userJid, periodType, periodKey) as { messages?: number; commands?: number } | undefined
  return { messages: Number(row?.messages ?? 0), commands: Number(row?.commands ?? 0) }
}

export function addReputation(fromJid: string, toJid: string, value: 1 | -1, reason?: string) {
  if (fromJid === toJid) throw new Error('No puedes modificar tu propia reputación.')
  const timestamp = now()
  const sameTarget = db.prepare(`SELECT created_at as createdAt FROM reputation_events_v4
    WHERE from_jid = ? AND to_jid = ? ORDER BY created_at DESC LIMIT 1`).get(fromJid, toJid) as { createdAt?: number } | undefined
  if (sameTarget?.createdAt && timestamp - sameTarget.createdAt < 6 * 3600_000) throw new Error('Debes esperar 6 horas antes de volver a valorar a ese usuario.')
  const daily = db.prepare('SELECT COUNT(*) as count FROM reputation_events_v4 WHERE from_jid = ? AND created_at >= ?')
    .get(fromJid, timestamp - 86400_000) as { count: number }
  if (Number(daily.count) >= 5) throw new Error('Alcanzaste el límite de 5 valoraciones por 24 horas.')
  db.prepare('INSERT INTO reputation_events_v4(from_jid, to_jid, value, reason, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(fromJid, toJid, value, reason?.slice(0, 180) || null, timestamp)
  return reputation(toJid)
}

export function reputation(userJid: string) {
  const row = db.prepare(`SELECT COALESCE(SUM(value), 0) as score,
    SUM(CASE WHEN value > 0 THEN 1 ELSE 0 END) as positive,
    SUM(CASE WHEN value < 0 THEN 1 ELSE 0 END) as negative
    FROM reputation_events_v4 WHERE to_jid = ?`).get(userJid) as { score?: number; positive?: number; negative?: number }
  return { score: Number(row.score ?? 0), positive: Number(row.positive ?? 0), negative: Number(row.negative ?? 0) }
}

export function reputationTop(limit = 10) {
  return db.prepare(`SELECT to_jid as userJid, SUM(value) as score,
    SUM(CASE WHEN value > 0 THEN 1 ELSE 0 END) as positive,
    SUM(CASE WHEN value < 0 THEN 1 ELSE 0 END) as negative
    FROM reputation_events_v4 GROUP BY to_jid ORDER BY score DESC, positive DESC LIMIT ?`)
    .all(Math.max(1, Math.min(25, limit))) as Array<{ userJid: string; score: number; positive: number; negative: number }>
}

function achievementMetrics(userJid: string) {
  const activity = userActivity(userJid)
  const balance = economy.balance(userJid)
  const works = db.prepare("SELECT COUNT(*) as count FROM economy_ledger WHERE user_jid = ? AND kind = 'work'").get(userJid) as { count: number }
  const clan = db.prepare('SELECT clan_id FROM clan_members_v4 WHERE user_jid = ? LIMIT 1').get(userJid) as { clan_id?: number } | undefined
  const sales = db.prepare("SELECT COUNT(*) as count FROM market_listings_v4 WHERE seller_jid = ? AND status = 'sold'").get(userJid) as { count: number }
  const raid = db.prepare(`SELECT COUNT(*) as count FROM raid_members_v4 rm JOIN raids_v4 r ON r.id = rm.raid_id
    WHERE rm.user_jid = ? AND r.status = 'completed'`).get(userJid) as { count: number }
  return {
    activity,
    wealth: balance.total,
    works: Number(works.count ?? 0),
    reputation: reputation(userJid).score,
    clan: Boolean(clan?.clan_id),
    sales: Number(sales.count ?? 0),
    raidWins: Number(raid.count ?? 0),
  }
}

export function syncAchievements(userJid: string) {
  const m = achievementMetrics(userJid)
  const unlocked = new Set<string>()
  if (m.activity.commands >= 10) unlocked.add('first_steps')
  if (m.activity.messages >= 100) unlocked.add('social_100')
  if (m.works >= 25) unlocked.add('worker_25')
  if (m.wealth >= 10_000) unlocked.add('wealth_10k')
  if (m.wealth >= 100_000) unlocked.add('wealth_100k')
  if (m.reputation >= 10) unlocked.add('reputation_10')
  if (m.clan) unlocked.add('clan_member')
  if (m.sales >= 5) unlocked.add('market_5')
  if (m.raidWins >= 1) unlocked.add('raid_win')
  if (m.activity.commands >= 500) unlocked.add('commands_500')
  const timestamp = now()
  for (const item of achievements) {
    if (!unlocked.has(item.id)) continue
    db.prepare('INSERT OR IGNORE INTO user_achievements_v4(user_jid, achievement_id, unlocked_at) VALUES(?, ?, ?)').run(userJid, item.id, timestamp)
    db.prepare('INSERT OR IGNORE INTO user_titles_v4(user_jid, title_id, title, unlocked_at, equipped) VALUES(?, ?, ?, ?, 0)')
      .run(userJid, item.titleId, item.title, timestamp)
  }
  return listAchievements(userJid)
}

export function listAchievements(userJid: string) {
  const rows = db.prepare('SELECT achievement_id as id, unlocked_at as unlockedAt FROM user_achievements_v4 WHERE user_jid = ?')
    .all(userJid) as Array<{ id: string; unlockedAt: number }>
  const unlocked = new Map(rows.map((row) => [row.id, row.unlockedAt]))
  return achievements.map((item) => ({ ...item, unlocked: unlocked.has(item.id), unlockedAt: unlocked.get(item.id) ?? null }))
}

export function listTitles(userJid: string) {
  return db.prepare(`SELECT title_id as id, title, unlocked_at as unlockedAt, equipped
    FROM user_titles_v4 WHERE user_jid = ? ORDER BY unlocked_at ASC`).all(userJid) as Array<{ id: string; title: string; unlockedAt: number; equipped: number }>
}

export function equipTitle(userJid: string, titleId: string) {
  const row = db.prepare('SELECT title FROM user_titles_v4 WHERE user_jid = ? AND title_id = ?').get(userJid, titleId) as { title?: string } | undefined
  if (!row?.title) throw new Error('No has desbloqueado ese título.')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE user_titles_v4 SET equipped = 0 WHERE user_jid = ?').run(userJid)
    db.prepare('UPDATE user_titles_v4 SET equipped = 1 WHERE user_jid = ? AND title_id = ?').run(userJid, titleId)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return row.title
}

export function equippedTitle(userJid: string) {
  const row = db.prepare('SELECT title FROM user_titles_v4 WHERE user_jid = ? AND equipped = 1 LIMIT 1').get(userJid) as { title?: string } | undefined
  return row?.title ?? null
}

function monthBounds(date = new Date()) {
  const starts = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  const ends = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const label = `Temporada ${date.toLocaleString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
  return { key, label, starts, ends }
}

function ensureSeason(date = new Date()) {
  const bounds = monthBounds(date)
  db.prepare('INSERT OR IGNORE INTO seasons_v4(season_key, label, starts_at, ends_at, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(bounds.key, bounds.label, bounds.starts, bounds.ends, now())
  return bounds
}

const excludedSeasonKinds = [
  'transfer_in', 'admin_grant', 'web_admin_grant', 'v4_market_sale', 'v4_market_refund', 'v4_clan_refund',
]

function scoreRows(startsAt: number, endsAt: number, limit = 1000) {
  const placeholders = excludedSeasonKinds.map(() => '?').join(',')
  return db.prepare(`SELECT user_jid as userJid, COALESCE(SUM(amount), 0) as score
    FROM economy_ledger
    WHERE created_at >= ? AND created_at < ? AND amount > 0 AND kind NOT IN (${placeholders})
    GROUP BY user_jid ORDER BY score DESC LIMIT ?`)
    .all(startsAt, endsAt, ...excludedSeasonKinds, Math.max(1, Math.min(5000, limit))) as Array<{ userJid: string; score: number }>
}

function snapshotSeason(seasonKey: string) {
  const season = db.prepare('SELECT starts_at as startsAt, ends_at as endsAt FROM seasons_v4 WHERE season_key = ?').get(seasonKey) as { startsAt: number; endsAt: number } | undefined
  if (!season || season.endsAt > now()) return
  const exists = db.prepare('SELECT 1 as ok FROM season_rankings_v4 WHERE season_key = ? LIMIT 1').get(seasonKey) as { ok?: number } | undefined
  if (exists?.ok) return
  const rows = scoreRows(season.startsAt, season.endsAt)
  const timestamp = now()
  db.exec('BEGIN IMMEDIATE')
  try {
    rows.forEach((row, index) => db.prepare('INSERT OR IGNORE INTO season_rankings_v4(season_key, user_jid, score, rank, snapshot_at) VALUES(?, ?, ?, ?, ?)')
      .run(seasonKey, row.userJid, Math.floor(row.score), index + 1, timestamp))
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function currentSeason(limit = 10) {
  const current = ensureSeason()
  return { ...current, rankings: scoreRows(current.starts, current.ends, limit).map((row, index) => ({ ...row, rank: index + 1 })) }
}

export function seasonHistory(limitSeasons = 6) {
  for (let offset = 1; offset <= limitSeasons; offset += 1) {
    const d = new Date()
    d.setUTCMonth(d.getUTCMonth() - offset)
    const bounds = ensureSeason(d)
    snapshotSeason(bounds.key)
  }
  const seasons = db.prepare('SELECT season_key as key, label, starts_at as startsAt, ends_at as endsAt FROM seasons_v4 WHERE ends_at <= ? ORDER BY starts_at DESC LIMIT ?')
    .all(now(), Math.max(1, Math.min(24, limitSeasons))) as Array<{ key: string; label: string; startsAt: number; endsAt: number }>
  return seasons.map((season) => ({
    ...season,
    rankings: db.prepare('SELECT user_jid as userJid, score, rank FROM season_rankings_v4 WHERE season_key = ? ORDER BY rank ASC LIMIT 10')
      .all(season.key) as Array<{ userJid: string; score: number; rank: number }>,
  }))
}

export function progressionProfile(userJid: string) {
  syncAchievements(userJid)
  const balance = economy.balance(userJid)
  return {
    userJid,
    title: equippedTitle(userJid),
    reputation: reputation(userJid),
    activity: userActivity(userJid),
    balance,
    achievements: listAchievements(userJid).filter((item) => item.unlocked).length,
    titles: listTitles(userJid).length,
  }
}
