import { openBotDb } from './runtime'

export type GroupDetailMember = {
  jid: string
  admin: boolean
  superAdmin: boolean
  bot: boolean
  updatedAt: number
}

export type GroupDetailSettings = {
  botEnabled: boolean
  welcome: boolean
  goodbye: boolean
  antiLink: boolean
  antiSpam: boolean
  adultAllowed: boolean
  restrictedMode: boolean
  language: string | null
  welcomeText: string | null
  goodbyeText: string | null
  policyProfile: string
  adultCategoryAllowed: boolean
  commandCategories: Record<string, boolean>
  updatedAt: number
}

export type GroupDetail = {
  instanceKey: string
  groupJid: string
  name: string
  description: string | null
  pictureUrl: string | null
  createdAt: number
  participantCount: number
  adminCount: number
  botAdmin: boolean | null
  announce: boolean
  restrictMode: boolean
  mutedUntil: number
  updatedAt: number
  messagesToday: number
  messages24h: number
  messages7d: number
  messages30d: number
  activeToday: number
  members: GroupDetailMember[]
  settings: GroupDetailSettings
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function tableColumns(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  if (!tableExists(db, name)) return new Set<string>()
  return new Set((db.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name?: string }>).map((row) => String(row.name ?? '')))
}

const defaultSettings = (): GroupDetailSettings => ({
  botEnabled: true,
  welcome: false,
  goodbye: false,
  antiLink: false,
  antiSpam: false,
  adultAllowed: false,
  restrictedMode: false,
  language: null,
  welcomeText: null,
  goodbyeText: null,
  policyProfile: 'community',
  adultCategoryAllowed: false,
  commandCategories: {},
  updatedAt: 0,
})

export function readGroupDetail(instanceKey: string, groupJid: string): GroupDetail | null {
  if (!groupJid.endsWith('@g.us')) return null
  const db = openBotDb()
  if (!db) return null
  try {
    if (!tableExists(db, 'ops_groups')) return null
    const columns = tableColumns(db, 'ops_groups')
    const description = columns.has('description') ? 'description' : 'NULL AS description'
    const picture = columns.has('picture_url') ? 'picture_url AS pictureUrl' : 'NULL AS pictureUrl'
    const created = columns.has('created_at') ? 'created_at AS createdAt' : '0 AS createdAt'
    const group = db.prepare(`SELECT group_jid AS groupJid, name, participant_count AS participantCount,
        admin_count AS adminCount, announce, restrict_mode AS restrictMode,
        ${description}, ${picture}, ${created}, updated_at AS updatedAt
      FROM ops_groups WHERE instance_key = ? AND group_jid = ? LIMIT 1`)
      .get(instanceKey, groupJid) as Record<string, unknown> | undefined
    if (!group) return null

    let mutedUntil = 0
    if (tableExists(db, 'ops_group_chat_preferences')) {
      const row = db.prepare(`SELECT muted_until AS mutedUntil FROM ops_group_chat_preferences
        WHERE instance_key = ? AND group_jid = ?`).get(instanceKey, groupJid) as { mutedUntil?: number } | undefined
      mutedUntil = Number(row?.mutedUntil ?? 0)
    }

    const today = Math.floor(Date.now() / 86_400_000)
    const currentHour = Math.floor(Date.now() / 3_600_000)
    let messagesToday = 0
    let messages24h = 0
    let messages7d = 0
    let messages30d = 0
    if (tableExists(db, 'ops_group_daily_stats')) {
      const stats = db.prepare(`SELECT
          COALESCE(SUM(CASE WHEN day = ? THEN messages ELSE 0 END), 0) AS today,
          COALESCE(SUM(CASE WHEN day >= ? THEN messages ELSE 0 END), 0) AS seven,
          COALESCE(SUM(CASE WHEN day >= ? THEN messages ELSE 0 END), 0) AS thirty
        FROM ops_group_daily_stats
        WHERE instance_key = ? AND group_jid = ? AND day >= ?`)
        .get(today, today - 6, today - 29, instanceKey, groupJid, today - 29) as Record<string, number> | undefined
      messagesToday = Number(stats?.today ?? 0)
      messages7d = Number(stats?.seven ?? 0)
      messages30d = Number(stats?.thirty ?? 0)
    }

    if (tableExists(db, 'ops_group_hourly_stats')) {
      const row = db.prepare(`SELECT COALESCE(SUM(messages), 0) AS messages FROM ops_group_hourly_stats
        WHERE instance_key = ? AND group_jid = ? AND hour >= ? AND hour <= ?`)
        .get(instanceKey, groupJid, currentHour - 23, currentHour) as { messages?: number } | undefined
      messages24h = Number(row?.messages ?? 0)
    } else {
      messages24h = messagesToday
    }

    let activeToday = 0
    if (tableExists(db, 'ops_group_daily_senders')) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ops_group_daily_senders
        WHERE instance_key = ? AND group_jid = ? AND day = ?`).get(instanceKey, groupJid, today) as { count?: number } | undefined
      activeToday = Number(row?.count ?? 0)
    }

    let members: GroupDetailMember[] = []
    let botAdmin: boolean | null = null
    if (tableExists(db, 'ops_group_members')) {
      members = (db.prepare(`SELECT member_jid AS jid, is_admin AS admin, is_super_admin AS superAdmin,
          is_bot AS bot, updated_at AS updatedAt
        FROM ops_group_members WHERE instance_key = ? AND group_jid = ?
        ORDER BY is_bot DESC, is_admin DESC, member_jid ASC LIMIT 1000`)
        .all(instanceKey, groupJid) as Array<Record<string, unknown>>).map((row) => ({
          jid: String(row.jid ?? ''),
          admin: Boolean(row.admin),
          superAdmin: Boolean(row.superAdmin),
          bot: Boolean(row.bot),
          updatedAt: Number(row.updatedAt ?? 0),
        }))
      const bot = members.find((member) => member.bot)
      botAdmin = bot ? bot.admin : null
    }

    let settings = defaultSettings()
    if (tableExists(db, 'ops_group_settings_snapshot')) {
      const settingsColumns = tableColumns(db, 'ops_group_settings_snapshot')
      const commandCategoriesColumn = settingsColumns.has('command_categories_json')
        ? 'command_categories_json AS commandCategoriesJson'
        : "'{}' AS commandCategoriesJson"
      const row = db.prepare(`SELECT bot_enabled AS botEnabled, welcome, goodbye, anti_link AS antiLink,
          anti_spam AS antiSpam, adult_allowed AS adultAllowed, restricted_mode AS restrictedMode,
          language, welcome_text AS welcomeText, goodbye_text AS goodbyeText,
          policy_profile AS policyProfile, adult_category_allowed AS adultCategoryAllowed,
          ${commandCategoriesColumn}, updated_at AS updatedAt
        FROM ops_group_settings_snapshot WHERE instance_key = ? AND group_jid = ?`)
        .get(instanceKey, groupJid) as Record<string, unknown> | undefined
      if (row) {
        settings = {
          botEnabled: Boolean(row.botEnabled),
          welcome: Boolean(row.welcome),
          goodbye: Boolean(row.goodbye),
          antiLink: Boolean(row.antiLink),
          antiSpam: Boolean(row.antiSpam),
          adultAllowed: Boolean(row.adultAllowed),
          restrictedMode: Boolean(row.restrictedMode),
          language: row.language ? String(row.language) : null,
          welcomeText: row.welcomeText ? String(row.welcomeText) : null,
          goodbyeText: row.goodbyeText ? String(row.goodbyeText) : null,
          policyProfile: String(row.policyProfile || 'community'),
          adultCategoryAllowed: Boolean(row.adultCategoryAllowed),
          commandCategories: (() => {
            try {
              const parsed = JSON.parse(String(row.commandCategoriesJson ?? '{}'))
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
              return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)]))
            } catch {
              return {}
            }
          })(),
          updatedAt: Number(row.updatedAt ?? 0),
        }
      }
    }

    return {
      instanceKey,
      groupJid: String(group.groupJid),
      name: String(group.name || group.groupJid),
      description: group.description ? String(group.description) : null,
      pictureUrl: group.pictureUrl ? String(group.pictureUrl) : null,
      createdAt: Number(group.createdAt ?? 0),
      participantCount: Number(group.participantCount ?? 0),
      adminCount: Number(group.adminCount ?? 0),
      botAdmin,
      announce: Boolean(group.announce),
      restrictMode: Boolean(group.restrictMode),
      mutedUntil,
      updatedAt: Number(group.updatedAt ?? 0),
      messagesToday,
      messages24h,
      messages7d,
      messages30d,
      activeToday,
      members,
      settings,
    }
  } catch {
    return null
  } finally {
    db.close()
  }
}
