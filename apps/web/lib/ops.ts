import { openBotDb } from './runtime'

export type OpsStage = {
  id: string
  name: string
  invocations: number
  minUs: number
  avgUs: number
  maxUs: number
  lastUs: number
  firstAt: number
  lastAt: number
  status: 'optimal' | 'bottleneck'
}

export type OpsCommand = {
  commandName: string
  category: string
  description: string
  whatsapp: boolean
  discord: boolean
  telegram: boolean
  enabled: boolean
  whatsappEnabled: boolean
  discordEnabled: boolean
  telegramEnabled: boolean
  cooldownMs: number
  allowGroups: boolean
  allowPrivate: boolean
  permissionMode: 'inherit' | 'staff' | 'owner'
  categoryEnabled: boolean
  invocations: number
  successes: number
  failures: number
  successRate: number
  minUs: number
  avgUs: number
  maxUs: number
  lastUs: number
  heapDeltaKb: number
  lastErrorAt: number
  status: 'optimal' | 'warning' | 'slow' | 'critical'
}

export type OpsCommandCategory = {
  category: string
  enabled: boolean
}

export type OpsGroup = {
  groupJid: string
  name: string
  participantCount: number
  adminCount: number
  announce: boolean
  restrictMode: boolean
  mutedUntil: number
  updatedAt: number
}

export type OpsPlatformGroup = {
  platform: 'whatsapp' | 'discord' | 'telegram'
  externalId: string
  name: string
  kind: string
  memberCount: number | null
  adminCount: number | null
  botAdmin: boolean | null
  authoritative: boolean
  source: string
  updatedAt: number
}

export type OpsProviderHealth = {
  providerId: string
  label: string
  status: 'online' | 'degraded' | 'offline' | 'unknown'
  circuitState: 'closed' | 'open' | 'half-open'
  requests: number
  successes: number
  failures: number
  consecutiveFailures: number
  errorRate: number
  averageLatencyMs: number
  lastLatencyMs: number
  lastSuccessAt: number
  lastFailureAt: number
  lastError: string | null
  updatedAt: number
}

export type OpsAdminAudit = {
  id: number
  actor: string
  action: string
  target: string | null
  status: 'accepted' | 'failed'
  error: string | null
  createdAt: number
}

export type OpsRequest = {
  id: number
  action: string
  groupJid: string | null
  status: string
  error: string | null
  requestedAt: number
  completedAt: number | null
}

export type OpsRuntimeStatus = {
  connected: boolean
  reportedConnected: boolean
  registered: boolean
  groupCount: number
  connectedAt: number
  lastEventAt: number
  lastGroupSyncAt: number
  lastGroupSyncAttemptAt: number
  lastGroupSyncError: string | null
  updatedAt: number
  fresh: boolean
}

export type OpsUsageRank = {
  key: string
  label: string
  secondary: string
  requests: number
  successRate: number
}

export type OpsUsagePoint = {
  at: number
  requests: number
  averageLatencyMs: number
}

export type OpsHeatmapDay = {
  at: number
  hours: number[]
}

export type OpsUsageAnalytics = {
  uptimeMs: number
  averageLatencyMs: number
  totalRequests: number
  lastMinute: number
  lastHour: number
  previousHour: number
  growthPct: number
  todayRequests: number
  recentSeries: OpsUsagePoint[]
  heatmap: OpsHeatmapDay[]
  topUsersHistorical: OpsUsageRank[]
  topUsersToday: OpsUsageRank[]
  topCommandsHistorical: OpsUsageRank[]
  topCommandsToday: OpsUsageRank[]
}

export type OpsSnapshot = {
  instanceKey: string
  runtime: OpsRuntimeStatus
  summary: {
    throughputMps: number
    averageE2eUs: number
    processingNodes: number
    auditedCommands: number
    bottlenecks: number
  }
  analytics: OpsUsageAnalytics
  stages: OpsStage[]
  commands: OpsCommand[]
  commandCategories: OpsCommandCategory[]
  groups: OpsGroup[]
  platformGroups: OpsPlatformGroup[]
  providers: OpsProviderHealth[]
  adminAudit: OpsAdminAudit[]
  requests: OpsRequest[]
}

const STAGES = [
  ['01', 'Ingesta Baileys', 50_000],
  ['02', 'Serializador de Mensajes', 150_000],
  ['03', 'Sincronización DB & State', 100_000],
  ['04', 'Filtros & Permisos', 150_000],
  ['05', 'Matcher & Cola de Ejecución', 100_000],
  ['06', 'Ejecutor Sandbox Plugin', 750_000],
  ['07', 'Despacho Socket Baileys', 250_000],
] as const

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function commandStatus(avgUs: number, maxUs: number, successRate: number): OpsCommand['status'] {
  if (successRate < 90 || avgUs >= 2_000_000 || maxUs >= 5_000_000) return 'critical'
  if (avgUs >= 750_000 || maxUs >= 2_000_000 || successRate < 97) return 'slow'
  if (avgUs >= 250_000 || maxUs >= 1_000_000 || successRate < 99) return 'warning'
  return 'optimal'
}

function providerStatus(input: {
  requests: number
  successes: number
  consecutiveFailures: number
  updatedAt: number
}): OpsProviderHealth['status'] {
  if (!input.requests) return 'unknown'
  if (input.updatedAt > 0 && Date.now() - input.updatedAt > 30 * MINUTE) return 'unknown'
  if (input.consecutiveFailures >= 3 || (!input.successes && input.consecutiveFailures > 0)) return 'offline'
  if (input.consecutiveFailures > 0) return 'degraded'
  return input.successes > 0 ? 'online' : 'unknown'
}

function providerCircuitState(input: {
  consecutiveFailures: number
  lastSuccessAt: number
  lastFailureAt: number
}): OpsProviderHealth['circuitState'] {
  if (input.consecutiveFailures < 3 || !input.lastFailureAt || input.lastSuccessAt > input.lastFailureAt) return 'closed'
  if (Date.now() - input.lastFailureAt < 5 * MINUTE) return 'open'
  return 'half-open'
}

function emptyAnalytics(): OpsUsageAnalytics {
  return {
    uptimeMs: 0,
    averageLatencyMs: 0,
    totalRequests: 0,
    lastMinute: 0,
    lastHour: 0,
    previousHour: 0,
    growthPct: 0,
    todayRequests: 0,
    recentSeries: [],
    heatmap: [],
    topUsersHistorical: [],
    topUsersToday: [],
    topCommandsHistorical: [],
    topCommandsToday: [],
  }
}

function empty(instanceKey: string): OpsSnapshot {
  return {
    instanceKey,
    runtime: {
      connected: false,
      reportedConnected: false,
      registered: false,
      groupCount: 0,
      connectedAt: 0,
      lastEventAt: 0,
      lastGroupSyncAt: 0,
      lastGroupSyncAttemptAt: 0,
      lastGroupSyncError: null,
      updatedAt: 0,
      fresh: false,
    },
    summary: { throughputMps: 0, averageE2eUs: 0, processingNodes: 7, auditedCommands: 0, bottlenecks: 0 },
    analytics: emptyAnalytics(),
    stages: STAGES.map(([id, name]) => ({ id, name, invocations: 0, minUs: 0, avgUs: 0, maxUs: 0, lastUs: 0, firstAt: 0, lastAt: 0, status: 'optimal' })),
    commands: [], commandCategories: [], groups: [], platformGroups: [], providers: [], adminAudit: [], requests: [],
  }
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function startOfDay(stamp: number) {
  const value = new Date(stamp)
  value.setHours(0, 0, 0, 0)
  return value.getTime()
}

function rankUser(row: any, index: number): OpsUsageRank {
  const userJid = String(row.userJid ?? '')
  const digits = userJid.split('@')[0]?.replace(/\D/g, '') ?? ''
  const tail = digits.slice(-4)
  const displayName = String(row.displayName ?? '').trim()
  const requests = Number(row.requests ?? 0)
  const successes = Number(row.successes ?? 0)
  return {
    key: `user:${index}:${tail || 'anon'}:${displayName}`,
    label: displayName || (tail ? `Usuario •••• ${tail}` : 'Usuario de WhatsApp'),
    secondary: tail ? `WhatsApp •••• ${tail}` : 'WhatsApp',
    requests,
    successRate: requests ? successes / requests * 100 : 100,
  }
}

function rankCommand(row: any): OpsUsageRank {
  const commandName = String(row.commandName ?? '')
  const requests = Number(row.requests ?? row.invocations ?? 0)
  const successes = Number(row.successes ?? 0)
  const successRate = row.successRate !== undefined
    ? Number(row.successRate)
    : requests ? successes / requests * 100 : 100
  return {
    key: `command:${commandName}`,
    label: `.${commandName}`,
    secondary: String(row.category ?? 'command'),
    requests,
    successRate,
  }
}

function readUsageAnalytics(db: NonNullable<ReturnType<typeof openBotDb>>, instanceKey: string, snapshot: OpsSnapshot): OpsUsageAnalytics {
  const analytics = emptyAnalytics()
  const stamp = Date.now()
  const currentMinute = Math.floor(stamp / MINUTE) * MINUTE
  const todayStart = startOfDay(stamp)
  const firstPipelineAt = snapshot.stages.filter((stage) => stage.firstAt > 0).reduce((min, stage) => Math.min(min, stage.firstAt), Number.POSITIVE_INFINITY)
  const uptimeBase = snapshot.runtime.connectedAt > 0 ? snapshot.runtime.connectedAt : (Number.isFinite(firstPipelineAt) ? firstPipelineAt : 0)
  analytics.uptimeMs = uptimeBase ? Math.max(0, stamp - uptimeBase) : 0

  if (tableExists(db, 'ops_command_metrics')) {
    const totals = db.prepare(`SELECT COALESCE(SUM(invocations), 0) AS requests, COALESCE(SUM(total_us), 0) AS totalUs
      FROM ops_command_metrics WHERE instance_key = ?`).get(instanceKey) as { requests?: number; totalUs?: number } | undefined
    analytics.totalRequests = Number(totals?.requests ?? 0)
    analytics.averageLatencyMs = analytics.totalRequests ? Number(totals?.totalUs ?? 0) / analytics.totalRequests / 1000 : 0
  } else {
    analytics.totalRequests = snapshot.commands.reduce((sum, command) => sum + command.invocations, 0)
    const totalUs = snapshot.commands.reduce((sum, command) => sum + command.avgUs * command.invocations, 0)
    analytics.averageLatencyMs = analytics.totalRequests ? totalUs / analytics.totalRequests / 1000 : 0
  }

  analytics.topCommandsHistorical = snapshot.commands
    .filter((command) => command.invocations > 0)
    .sort((left, right) => right.invocations - left.invocations || left.commandName.localeCompare(right.commandName))
    .slice(0, 10)
    .map((command) => rankCommand({ ...command, requests: command.invocations }))

  if (tableExists(db, 'ops_user_metrics')) {
    const users = db.prepare(`SELECT user_jid AS userJid, display_name AS displayName, requests, successes
      FROM ops_user_metrics WHERE instance_key = ? AND requests > 0
      ORDER BY requests DESC, last_at DESC LIMIT 5`).all(instanceKey) as Array<Record<string, string | number | null>>
    analytics.topUsersHistorical = users.map(rankUser)
  }

  if (!tableExists(db, 'ops_usage_minutes')) return analytics

  const windows = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN bucket_minute = ? THEN requests ELSE 0 END), 0) AS lastMinute,
      COALESCE(SUM(CASE WHEN bucket_minute >= ? THEN requests ELSE 0 END), 0) AS lastHour,
      COALESCE(SUM(CASE WHEN bucket_minute >= ? AND bucket_minute < ? THEN requests ELSE 0 END), 0) AS previousHour,
      COALESCE(SUM(CASE WHEN bucket_minute >= ? THEN requests ELSE 0 END), 0) AS today
    FROM ops_usage_minutes WHERE instance_key = ? AND bucket_minute >= ?`)
    .get(currentMinute, currentMinute - 59 * MINUTE, currentMinute - 119 * MINUTE, currentMinute - 59 * MINUTE, todayStart, instanceKey, Math.min(todayStart, currentMinute - 119 * MINUTE)) as Record<string, number> | undefined
  analytics.lastMinute = Number(windows?.lastMinute ?? 0)
  analytics.lastHour = Number(windows?.lastHour ?? 0)
  analytics.previousHour = Number(windows?.previousHour ?? 0)
  analytics.todayRequests = Number(windows?.today ?? 0)
  analytics.growthPct = analytics.previousHour > 0
    ? (analytics.lastHour - analytics.previousHour) / analytics.previousHour * 100
    : analytics.lastHour > 0 ? 100 : 0

  const recentStart = currentMinute - 59 * MINUTE
  const recentRows = db.prepare(`SELECT bucket_minute AS bucket, SUM(requests) AS requests, SUM(total_us) AS totalUs
    FROM ops_usage_minutes WHERE instance_key = ? AND bucket_minute >= ?
    GROUP BY bucket_minute ORDER BY bucket_minute ASC`).all(instanceKey, recentStart) as Array<{ bucket: number; requests: number; totalUs: number }>
  const recentByBucket = new Map(recentRows.map((row) => [Number(row.bucket), row]))
  analytics.recentSeries = Array.from({ length: 60 }, (_, index) => {
    const at = recentStart + index * MINUTE
    const row = recentByBucket.get(at)
    const requests = Number(row?.requests ?? 0)
    return {
      at,
      requests,
      averageLatencyMs: requests ? Number(row?.totalUs ?? 0) / requests / 1000 : 0,
    }
  })

  const heatmapStartDate = new Date(todayStart)
  heatmapStartDate.setDate(heatmapStartDate.getDate() - 6)
  const heatmapStart = heatmapStartDate.getTime()
  const heatRows = db.prepare(`SELECT bucket_minute AS bucket, SUM(requests) AS requests
    FROM ops_usage_minutes WHERE instance_key = ? AND bucket_minute >= ?
    GROUP BY bucket_minute ORDER BY bucket_minute ASC`).all(instanceKey, heatmapStart) as Array<{ bucket: number; requests: number }>
  const dayMap = new Map<number, number[]>()
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(heatmapStart)
    date.setDate(date.getDate() + day)
    date.setHours(0, 0, 0, 0)
    dayMap.set(date.getTime(), Array.from({ length: 24 }, () => 0))
  }
  for (const row of heatRows) {
    const date = new Date(Number(row.bucket))
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    const hours = dayMap.get(day.getTime())
    if (hours) hours[date.getHours()] += Number(row.requests ?? 0)
  }
  analytics.heatmap = [...dayMap.entries()].map(([at, hours]) => ({ at, hours }))

  const todayUsers = db.prepare(`SELECT user_jid AS userJid, MAX(display_name) AS displayName,
      SUM(requests) AS requests, SUM(successes) AS successes
    FROM ops_usage_minutes WHERE instance_key = ? AND bucket_minute >= ?
    GROUP BY user_jid ORDER BY requests DESC, MAX(bucket_minute) DESC LIMIT 5`)
    .all(instanceKey, todayStart) as Array<Record<string, string | number | null>>
  analytics.topUsersToday = todayUsers.map(rankUser)

  const todayCommands = db.prepare(`SELECT u.command_name AS commandName, COALESCE(c.category, 'command') AS category,
      SUM(u.requests) AS requests, SUM(u.successes) AS successes
    FROM ops_usage_minutes u
    LEFT JOIN ops_command_catalog c ON c.instance_key = u.instance_key AND c.command_name = u.command_name
    WHERE u.instance_key = ? AND u.bucket_minute >= ?
    GROUP BY u.command_name, c.category
    ORDER BY requests DESC, u.command_name ASC LIMIT 10`)
    .all(instanceKey, todayStart) as Array<Record<string, string | number | null>>
  analytics.topCommandsToday = todayCommands.map(rankCommand)

  return analytics
}

export function readOpsSnapshot(instanceKey: string): OpsSnapshot {
  const db = openBotDb()
  if (!db) return empty(instanceKey)
  try {
    const snapshot = empty(instanceKey)

    if (tableExists(db, 'ops_instance_status')) {
      const statusColumns = new Set((db.prepare('PRAGMA table_info(ops_instance_status)').all() as Array<{ name?: string }>).map((item) => String(item.name ?? '')))
      const attemptColumn = statusColumns.has('last_group_sync_attempt_at') ? 'last_group_sync_attempt_at' : '0'
      const errorColumn = statusColumns.has('last_group_sync_error') ? 'last_group_sync_error' : 'NULL'
      const row = db.prepare(`SELECT connected, registered, group_count AS groupCount,
        connected_at AS connectedAt, last_event_at AS lastEventAt,
        last_group_sync_at AS lastGroupSyncAt,
        ${attemptColumn} AS lastGroupSyncAttemptAt,
        ${errorColumn} AS lastGroupSyncError,
        updated_at AS updatedAt
        FROM ops_instance_status WHERE instance_key = ?`).get(instanceKey) as Record<string, number | string | null> | undefined
      if (row) {
        const updatedAt = Number(row.updatedAt ?? 0)
        const fresh = updatedAt > 0 && Date.now() - updatedAt < 180_000
        const reportedConnected = Boolean(row.connected)
        snapshot.runtime = {
          connected: reportedConnected && fresh,
          reportedConnected,
          registered: Boolean(row.registered),
          groupCount: Number(row.groupCount ?? 0),
          connectedAt: Number(row.connectedAt ?? 0),
          lastEventAt: Number(row.lastEventAt ?? 0),
          lastGroupSyncAt: Number(row.lastGroupSyncAt ?? 0),
          lastGroupSyncAttemptAt: Number(row.lastGroupSyncAttemptAt ?? 0),
          lastGroupSyncError: row.lastGroupSyncError ? String(row.lastGroupSyncError) : null,
          updatedAt,
          fresh,
        }
      }
    }

    if (tableExists(db, 'ops_pipeline_metrics')) {
      const rows = db.prepare(`SELECT stage_id AS stageId, stage_name AS stageName, invocations, total_us AS totalUs,
        min_us AS minUs, max_us AS maxUs, last_us AS lastUs, first_at AS firstAt, last_at AS lastAt
        FROM ops_pipeline_metrics WHERE instance_key = ?`).all(instanceKey) as unknown as Array<Record<string, number | string>>
      const byStage = new Map(rows.map((row) => [String(row.stageId), row]))
      snapshot.stages = STAGES.map(([id, name, threshold]) => {
        const row = byStage.get(id)
        const invocations = Number(row?.invocations ?? 0)
        const avgUs = invocations ? Math.round(Number(row?.totalUs ?? 0) / invocations) : 0
        return {
          id, name, invocations, avgUs,
          minUs: Number(row?.minUs ?? 0), maxUs: Number(row?.maxUs ?? 0), lastUs: Number(row?.lastUs ?? 0),
          firstAt: Number(row?.firstAt ?? 0), lastAt: Number(row?.lastAt ?? 0),
          status: avgUs >= threshold ? 'bottleneck' : 'optimal',
        }
      })
    }

    if (tableExists(db, 'ops_command_catalog')) {
      const commandCatalogColumns = new Set(
        (db.prepare('PRAGMA table_info(ops_command_catalog)').all() as Array<{ name?: string }>)
          .map((column) => String(column.name ?? '')),
      )
      const whatsappColumn = commandCatalogColumns.has('whatsapp') ? 'c.whatsapp' : '1'
      const discordColumn = commandCatalogColumns.has('discord') ? 'c.discord' : '0'
      const telegramColumn = commandCatalogColumns.has('telegram') ? 'c.telegram' : '0'
      const hasCommandSettings = tableExists(db, 'ops_command_settings')
      const hasCategorySettings = tableExists(db, 'ops_command_category_settings')
      const commandSettingsColumns = hasCommandSettings
        ? new Set((db.prepare('PRAGMA table_info(ops_command_settings)').all() as Array<{ name?: string }>).map((column) => String(column.name ?? '')))
        : new Set<string>()
      const settingColumn = (name: string, fallback: string) => commandSettingsColumns.has(name) ? `COALESCE(s.${name}, ${fallback})` : fallback
      const rows = db.prepare(`SELECT c.command_name AS commandName, c.category, c.description,
        ${whatsappColumn} AS whatsapp, ${discordColumn} AS discord, ${telegramColumn} AS telegram,
        ${settingColumn('enabled', '1')} AS configEnabled,
        ${settingColumn('whatsapp', '1')} AS whatsappEnabled,
        ${settingColumn('discord', '1')} AS discordEnabled,
        ${settingColumn('telegram', '1')} AS telegramEnabled,
        ${settingColumn('cooldown_ms', '0')} AS cooldownMs,
        ${settingColumn('allow_groups', '1')} AS allowGroups,
        ${settingColumn('allow_private', '1')} AS allowPrivate,
        ${commandSettingsColumns.has('permission_mode') ? "COALESCE(s.permission_mode, 'inherit')" : "'inherit'"} AS permissionMode,
        ${hasCategorySettings ? 'COALESCE(cs.enabled, 1)' : '1'} AS categoryEnabled,
        COALESCE(m.invocations, 0) AS invocations, COALESCE(m.successes, 0) AS successes,
        COALESCE(m.failures, 0) AS failures, COALESCE(m.total_us, 0) AS totalUs,
        COALESCE(m.min_us, 0) AS minUs, COALESCE(m.max_us, 0) AS maxUs,
        COALESCE(m.last_us, 0) AS lastUs, COALESCE(m.heap_delta_total, 0) AS heapDeltaTotal,
        COALESCE(m.last_error_at, 0) AS lastErrorAt
        FROM ops_command_catalog c
        LEFT JOIN ops_command_metrics m ON m.instance_key = c.instance_key AND m.command_name = c.command_name
        ${hasCommandSettings ? 'LEFT JOIN ops_command_settings s ON s.instance_key = c.instance_key AND s.command_name = c.command_name' : ''}
        ${hasCategorySettings ? 'LEFT JOIN ops_command_category_settings cs ON cs.instance_key = c.instance_key AND cs.category = c.category' : ''}
        WHERE c.instance_key = ?
        ORDER BY COALESCE(m.total_us * 1.0 / NULLIF(m.invocations, 0), 0) DESC, c.command_name ASC`)
        .all(instanceKey) as unknown as Array<Record<string, number | string>>
      snapshot.commands = rows.map((row) => {
        const invocations = Number(row.invocations ?? 0)
        const successes = Number(row.successes ?? 0)
        const avgUs = invocations ? Math.round(Number(row.totalUs ?? 0) / invocations) : 0
        const maxUs = Number(row.maxUs ?? 0)
        const successRate = invocations ? successes / invocations * 100 : 100
        return {
          commandName: String(row.commandName), category: String(row.category), description: String(row.description),
          whatsapp: Boolean(row.whatsapp), discord: Boolean(row.discord), telegram: Boolean(row.telegram),
          enabled: Boolean(row.configEnabled),
          whatsappEnabled: Boolean(row.whatsapp) && Boolean(row.whatsappEnabled),
          discordEnabled: Boolean(row.discord) && Boolean(row.discordEnabled),
          telegramEnabled: Boolean(row.telegram) && Boolean(row.telegramEnabled),
          cooldownMs: Math.max(0, Number(row.cooldownMs ?? 0)),
          allowGroups: Boolean(row.allowGroups),
          allowPrivate: Boolean(row.allowPrivate),
          permissionMode: String(row.category) === 'adult'
            ? 'inherit'
            : (['staff', 'owner'].includes(String(row.permissionMode)) ? String(row.permissionMode) : 'inherit') as OpsCommand['permissionMode'],
          categoryEnabled: Boolean(row.categoryEnabled),
          invocations, successes, failures: Number(row.failures ?? 0), successRate,
          minUs: Number(row.minUs ?? 0), avgUs, maxUs, lastUs: Number(row.lastUs ?? 0),
          heapDeltaKb: invocations ? Math.round((Number(row.heapDeltaTotal ?? 0) / invocations) / 1024) : 0,
          lastErrorAt: Number(row.lastErrorAt ?? 0), status: commandStatus(avgUs, maxUs, successRate),
        }
      })
      const categoryStates = new Map<string, boolean>()
      for (const command of snapshot.commands) {
        if (!categoryStates.has(command.category)) categoryStates.set(command.category, command.categoryEnabled)
      }
      snapshot.commandCategories = [...categoryStates.entries()]
        .map(([category, enabled]) => ({ category, enabled }))
        .sort((a, b) => a.category.localeCompare(b.category))
    }

    if (tableExists(db, 'ops_groups')) {
      const hasPreferences = tableExists(db, 'ops_group_chat_preferences')
      const query = hasPreferences
        ? `SELECT g.group_jid AS groupJid, g.name, g.participant_count AS participantCount,
            g.admin_count AS adminCount, g.announce, g.restrict_mode AS restrictMode,
            COALESCE(p.muted_until, 0) AS mutedUntil, g.updated_at AS updatedAt
          FROM ops_groups g
          LEFT JOIN ops_group_chat_preferences p
            ON p.instance_key = g.instance_key AND p.group_jid = g.group_jid
          WHERE g.instance_key = ? ORDER BY g.name COLLATE NOCASE ASC`
        : `SELECT group_jid AS groupJid, name, participant_count AS participantCount,
            admin_count AS adminCount, announce, restrict_mode AS restrictMode,
            0 AS mutedUntil, updated_at AS updatedAt
          FROM ops_groups WHERE instance_key = ? ORDER BY name COLLATE NOCASE ASC`
      snapshot.groups = db.prepare(query)
        .all(instanceKey).map((row: any) => ({
          groupJid: String(row.groupJid), name: String(row.name), participantCount: Number(row.participantCount),
          adminCount: Number(row.adminCount), announce: Boolean(row.announce), restrictMode: Boolean(row.restrictMode),
          mutedUntil: Number(row.mutedUntil ?? 0), updatedAt: Number(row.updatedAt),
        })) as OpsGroup[]
      snapshot.runtime.groupCount = snapshot.groups.length
    }

    if (tableExists(db, 'ops_platform_groups')) {
      const hasLegacyWhatsAppGroups = tableExists(db, 'ops_groups')
      const platformQuery = hasLegacyWhatsAppGroups
        ? `SELECT pg.platform, pg.external_id AS externalId,
            CASE
              WHEN pg.platform = 'whatsapp'
                AND (pg.name = pg.external_id OR TRIM(pg.name) = '')
                AND og.name IS NOT NULL
                AND og.name <> og.group_jid
              THEN og.name
              ELSE pg.name
            END AS name,
            pg.kind,
            CASE WHEN pg.platform = 'whatsapp' THEN COALESCE(pg.member_count, og.participant_count) ELSE pg.member_count END AS memberCount,
            CASE WHEN pg.platform = 'whatsapp' THEN COALESCE(pg.admin_count, og.admin_count) ELSE pg.admin_count END AS adminCount,
            pg.bot_admin AS botAdmin, pg.authoritative, pg.source,
            MAX(pg.updated_at, COALESCE(og.updated_at, 0)) AS updatedAt
          FROM ops_platform_groups pg
          LEFT JOIN ops_groups og
            ON pg.platform = 'whatsapp'
            AND og.instance_key = pg.instance_key
            AND og.group_jid = pg.external_id
          WHERE pg.instance_key = ?
          ORDER BY pg.platform ASC, name COLLATE NOCASE ASC`
        : `SELECT platform, external_id AS externalId, name, kind,
            member_count AS memberCount, admin_count AS adminCount, bot_admin AS botAdmin,
            authoritative, source, updated_at AS updatedAt
          FROM ops_platform_groups
          WHERE instance_key = ?
          ORDER BY platform ASC, name COLLATE NOCASE ASC`

      snapshot.platformGroups = db.prepare(platformQuery)
        .all(instanceKey).map((row: any) => ({
          platform: String(row.platform) as OpsPlatformGroup['platform'],
          externalId: String(row.externalId),
          name: String(row.name),
          kind: String(row.kind || 'group'),
          memberCount: row.memberCount === null || row.memberCount === undefined ? null : Number(row.memberCount),
          adminCount: row.adminCount === null || row.adminCount === undefined ? null : Number(row.adminCount),
          botAdmin: row.botAdmin === null || row.botAdmin === undefined ? null : Boolean(row.botAdmin),
          authoritative: Boolean(row.authoritative),
          source: String(row.source || 'runtime'),
          updatedAt: Number(row.updatedAt ?? 0),
        })).filter((row: OpsPlatformGroup) => ['whatsapp', 'discord', 'telegram'].includes(row.platform))
    }

    const hasWhatsAppInventory = snapshot.platformGroups.some((row) => row.platform === 'whatsapp')
    if (!hasWhatsAppInventory && snapshot.groups.length) {
      snapshot.platformGroups.push(...snapshot.groups.map((group) => ({
        platform: 'whatsapp' as const,
        externalId: group.groupJid,
        name: group.name,
        kind: 'group',
        memberCount: group.participantCount,
        adminCount: group.adminCount,
        botAdmin: null,
        authoritative: snapshot.runtime.lastGroupSyncAt > 0,
        source: 'legacy-ops-groups',
        updatedAt: group.updatedAt,
      })))
    }

    if (tableExists(db, 'ops_provider_health')) {
      snapshot.providers = db.prepare(`SELECT
          provider_id AS providerId,
          provider_label AS label,
          requests,
          successes,
          failures,
          consecutive_failures AS consecutiveFailures,
          total_latency_ms AS totalLatencyMs,
          last_latency_ms AS lastLatencyMs,
          last_success_at AS lastSuccessAt,
          last_failure_at AS lastFailureAt,
          last_error AS lastError,
          updated_at AS updatedAt
        FROM ops_provider_health
        WHERE instance_key = ?
        ORDER BY provider_label COLLATE NOCASE ASC`)
        .all(instanceKey).map((row: any) => {
          const requests = Number(row.requests ?? 0)
          const successes = Number(row.successes ?? 0)
          const failures = Number(row.failures ?? 0)
          const consecutiveFailures = Number(row.consecutiveFailures ?? 0)
          const updatedAt = Number(row.updatedAt ?? 0)
          const lastSuccessAt = Number(row.lastSuccessAt ?? 0)
          const lastFailureAt = Number(row.lastFailureAt ?? 0)
          return {
            providerId: String(row.providerId),
            label: String(row.label),
            requests,
            successes,
            failures,
            consecutiveFailures,
            errorRate: requests ? failures / requests * 100 : 0,
            averageLatencyMs: requests ? Number(row.totalLatencyMs ?? 0) / requests : 0,
            lastLatencyMs: Number(row.lastLatencyMs ?? 0),
            lastSuccessAt,
            lastFailureAt,
            lastError: row.lastError ? String(row.lastError) : null,
            updatedAt,
            status: providerStatus({ requests, successes, consecutiveFailures, updatedAt }),
            circuitState: providerCircuitState({ consecutiveFailures, lastSuccessAt, lastFailureAt }),
          }
        }) as OpsProviderHealth[]
    }

    if (tableExists(db, 'ops_admin_audit')) {
      snapshot.adminAudit = db.prepare(`SELECT id, actor, action, target, status, error, created_at AS createdAt
        FROM ops_admin_audit
        WHERE instance_key = ?
        ORDER BY created_at DESC
        LIMIT 50`)
        .all(instanceKey).map((row: any) => ({
          id: Number(row.id),
          actor: String(row.actor),
          action: String(row.action),
          target: row.target ? String(row.target) : null,
          status: row.status === 'failed' ? 'failed' : 'accepted',
          error: row.error ? String(row.error) : null,
          createdAt: Number(row.createdAt ?? 0),
        })) as OpsAdminAudit[]
    }

    if (tableExists(db, 'ops_group_control_requests')) {
      snapshot.requests = db.prepare(`SELECT id, action, group_jid AS groupJid, status, error,
        requested_at AS requestedAt, completed_at AS completedAt
        FROM ops_group_control_requests WHERE instance_key = ? ORDER BY requested_at DESC LIMIT 12`)
        .all(instanceKey).map((row: any) => ({
          id: Number(row.id), action: String(row.action), groupJid: row.groupJid ? String(row.groupJid) : null,
          status: String(row.status), error: row.error ? String(row.error) : null,
          requestedAt: Number(row.requestedAt), completedAt: row.completedAt ? Number(row.completedAt) : null,
        })) as OpsRequest[]
    }

    const ingress = snapshot.stages[0]
    const elapsedSeconds = ingress?.firstAt && ingress.lastAt > ingress.firstAt
      ? Math.max(1, (ingress.lastAt - ingress.firstAt) / 1000)
      : 1
    snapshot.summary = {
      throughputMps: ingress ? ingress.invocations / elapsedSeconds : 0,
      averageE2eUs: snapshot.stages.reduce((sum, stage) => sum + stage.avgUs, 0),
      processingNodes: snapshot.stages.length,
      auditedCommands: snapshot.commands.length,
      bottlenecks: snapshot.commands.filter((command) => command.status === 'slow' || command.status === 'critical').length,
    }
    snapshot.analytics = readUsageAnalytics(db, instanceKey, snapshot)
    return snapshot
  } catch {
    return empty(instanceKey)
  } finally {
    db.close()
  }
}
