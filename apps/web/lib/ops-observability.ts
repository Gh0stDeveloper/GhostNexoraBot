import { openBotDb, runtime } from './runtime'

export type WebOpsAlert = {
  key: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string | null
  status: 'open' | 'resolved'
  openedAt: number
  updatedAt: number
  resolvedAt: number | null
  occurrences: number
}

export type WebOpsLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type WebOpsLogCategory = 'runtime' | 'whatsapp' | 'discord' | 'telegram' | 'download' | 'api' | 'command' | 'security'
export type WebOpsLogChannel = 'all' | 'whatsapp' | 'discord' | 'telegram' | 'errors' | 'downloads' | 'api' | 'commands'

export type WebOpsRuntimeLog = {
  id: number
  level: WebOpsLogLevel
  source: string
  category: WebOpsLogCategory
  message: string
  createdAt: number
}

export type WebOpsLogFilters = {
  channel?: WebOpsLogChannel
  level?: 'all' | WebOpsLogLevel
  query?: string
  afterId?: number
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function columnsFor(db: NonNullable<ReturnType<typeof openBotDb>>, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>)
      .map((row) => String(row.name ?? '')),
  )
}

function safeLogText(value: unknown) {
  let text = String(value ?? '')
  for (const secret of [
    runtime.adminToken,
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.DISCORD_BOT_TOKEN,
    process.env.LEMPI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.X_BEARER_TOKEN,
    process.env.VK_ACCESS_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.SPOTIFY_CLIENT_SECRET,
  ]) {
    if (secret && secret.length >= 6) text = text.split(secret).join('[REDACTED]')
  }
  return text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}\b/gi, '$1 [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key|access_token|auth|authorization|secret|password|session|sid|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|passwd|cookie|set-cookie|session[-_ ]?id|session|sid)\b\s*[:=]\s*["']?[^\s,;"'}]+/gi, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 900)
}

function normalizeLevel(value: unknown): WebOpsLogLevel {
  return value === 'error' ? 'error' : value === 'warn' ? 'warn' : value === 'debug' ? 'debug' : 'info'
}

function inferCategory(source: string, message: string): WebOpsLogCategory {
  const value = `${source} ${message}`.toLowerCase()
  if (value.includes('whatsapp') || source === 'groups' || source.startsWith('group-')) return 'whatsapp'
  if (value.includes('discord')) return 'discord'
  if (value.includes('telegram')) return 'telegram'
  if (value.includes('download') || value.includes('media') || value.includes('resource')) return 'download'
  if (value.includes('provider') || value.includes('api') || value.includes('openrouter') || value.includes('lempi')) return 'api'
  if (value.includes('command') || value.includes('router')) return 'command'
  if (value.includes('security') || value.includes('auth') || value.includes('session')) return 'security'
  return 'runtime'
}

function normalizeCategory(value: unknown, source: string, message: string): WebOpsLogCategory {
  if (value === 'whatsapp' || value === 'discord' || value === 'telegram' || value === 'download'
      || value === 'api' || value === 'command' || value === 'security' || value === 'runtime') return value
  return inferCategory(source, message)
}

function normalizeChannel(value: unknown): WebOpsLogChannel {
  return value === 'whatsapp' || value === 'discord' || value === 'telegram' || value === 'errors'
    || value === 'downloads' || value === 'api' || value === 'commands'
    ? value
    : 'all'
}

export function readOpsAlerts(instanceKey: string, limit = 30): WebOpsAlert[] {
  const db = openBotDb()
  if (!db) return []
  try {
    if (!tableExists(db, 'ops_alerts')) return []
    return db.prepare(`SELECT alert_key AS alertKey, severity, title, detail, status,
        opened_at AS openedAt, updated_at AS updatedAt, resolved_at AS resolvedAt, occurrences
      FROM ops_alerts
      WHERE instance_key = ?
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT ?`).all(instanceKey, Math.max(1, Math.min(100, limit))).map((row: any) => ({
        key: String(row.alertKey),
        severity: row.severity === 'critical' ? 'critical' : row.severity === 'warning' ? 'warning' : 'info',
        title: String(row.title),
        detail: row.detail ? String(row.detail) : null,
        status: row.status === 'resolved' ? 'resolved' : 'open',
        openedAt: Number(row.openedAt ?? 0),
        updatedAt: Number(row.updatedAt ?? 0),
        resolvedAt: row.resolvedAt ? Number(row.resolvedAt) : null,
        occurrences: Number(row.occurrences ?? 1),
      })) as WebOpsAlert[]
  } catch {
    return []
  } finally {
    db.close()
  }
}

export function readOpsRuntimeLogs(
  instanceKey: string,
  limit = 100,
  filters: WebOpsLogFilters = {},
): WebOpsRuntimeLog[] {
  const db = openBotDb()
  if (!db) return []
  try {
    if (!tableExists(db, 'ops_runtime_logs')) return []
    const columns = columnsFor(db, 'ops_runtime_logs')
    const categoryColumn = columns.has('category') ? 'category' : "'runtime' AS category"
    const clauses = ['instance_key = ?']
    const params: Array<string | number> = [instanceKey]
    const channel = normalizeChannel(filters.channel)
    const level = filters.level === 'debug' || filters.level === 'info' || filters.level === 'warn' || filters.level === 'error'
      ? filters.level
      : 'all'

    if (channel === 'whatsapp' || channel === 'discord' || channel === 'telegram') {
      if (columns.has('category')) {
        clauses.push('category = ?')
        params.push(channel)
      } else {
        clauses.push('(LOWER(source) LIKE ? OR LOWER(message) LIKE ?)')
        params.push(`%${channel}%`, `%${channel}%`)
      }
    } else if (channel === 'errors') {
      clauses.push("level IN ('warn','error')")
    } else if (channel === 'downloads') {
      if (columns.has('category')) clauses.push("category = 'download'")
      else clauses.push("(LOWER(source) LIKE '%download%' OR LOWER(message) LIKE '%download%' OR LOWER(message) LIKE '%media%')")
    } else if (channel === 'api') {
      if (columns.has('category')) clauses.push("category = 'api'")
      else clauses.push("(LOWER(source) LIKE '%api%' OR LOWER(source) LIKE '%provider%' OR LOWER(message) LIKE '%provider%')")
    } else if (channel === 'commands') {
      if (columns.has('category')) clauses.push("(category IN ('command','download') OR LOWER(source) LIKE 'command.%')")
      else clauses.push("(LOWER(source) LIKE 'command.%' OR LOWER(source) LIKE '%router%' OR LOWER(message) LIKE '%command%')")
    }

    if (level !== 'all') {
      clauses.push('level = ?')
      params.push(level)
    }

    const query = String(filters.query ?? '').trim().toLowerCase().slice(0, 120)
    if (query) {
      clauses.push('(LOWER(source) LIKE ? OR LOWER(message) LIKE ?)')
      params.push(`%${query}%`, `%${query}%`)
    }

    const afterId = Math.max(0, Math.trunc(Number(filters.afterId ?? 0) || 0))
    if (afterId) {
      clauses.push('id > ?')
      params.push(afterId)
    }

    return db.prepare(`SELECT id, level, source, ${categoryColumn}, message, created_at AS createdAt
      FROM ops_runtime_logs
      WHERE ${clauses.join(' AND ')}
      ORDER BY id DESC LIMIT ?`).all(...params, Math.max(1, Math.min(300, limit))).map((row: any) => {
        const source = safeLogText(row.source).toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 64) || 'runtime'
        const message = safeLogText(row.message) || 'runtime_event'
        return {
          id: Number(row.id),
          level: normalizeLevel(row.level),
          source,
          category: normalizeCategory(row.category, source, message),
          message,
          createdAt: Number(row.createdAt ?? 0),
        }
      }) as WebOpsRuntimeLog[]
  } catch {
    return []
  } finally {
    db.close()
  }
}

export function readOpsRuntimeLogCounts(instanceKey: string, sinceMs = 60 * 60_000) {
  const db = openBotDb()
  if (!db) return { total: 0, errors: 0, warnings: 0, commands: 0, api: 0, downloads: 0 }
  try {
    if (!tableExists(db, 'ops_runtime_logs')) return { total: 0, errors: 0, warnings: 0, commands: 0, api: 0, downloads: 0 }
    const columns = columnsFor(db, 'ops_runtime_logs')
    const since = Date.now() - Math.max(60_000, sinceMs)
    if (!columns.has('category')) {
      const row = db.prepare(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS errors,
          SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) AS warnings
        FROM ops_runtime_logs WHERE instance_key = ? AND created_at >= ?`).get(instanceKey, since) as Record<string, unknown> | undefined
      return {
        total: Number(row?.total ?? 0),
        errors: Number(row?.errors ?? 0),
        warnings: Number(row?.warnings ?? 0),
        commands: 0,
        api: 0,
        downloads: 0,
      }
    }
    const row = db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) AS warnings,
        SUM(CASE WHEN category = 'command' OR source LIKE 'command.%' THEN 1 ELSE 0 END) AS commands,
        SUM(CASE WHEN category = 'api' THEN 1 ELSE 0 END) AS api,
        SUM(CASE WHEN category = 'download' THEN 1 ELSE 0 END) AS downloads
      FROM ops_runtime_logs WHERE instance_key = ? AND created_at >= ?`).get(instanceKey, since) as Record<string, unknown> | undefined
    return {
      total: Number(row?.total ?? 0),
      errors: Number(row?.errors ?? 0),
      warnings: Number(row?.warnings ?? 0),
      commands: Number(row?.commands ?? 0),
      api: Number(row?.api ?? 0),
      downloads: Number(row?.downloads ?? 0),
    }
  } catch {
    return { total: 0, errors: 0, warnings: 0, commands: 0, api: 0, downloads: 0 }
  } finally {
    db.close()
  }
}
