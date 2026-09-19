import { config } from '../config.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

export type OpsLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type OpsLogCategory = 'runtime' | 'whatsapp' | 'discord' | 'telegram' | 'download' | 'api' | 'command' | 'security'

const RETENTION_MS = 3 * 86_400_000
const MAX_ROWS_PER_INSTANCE = 1_000
const PRUNE_INTERVAL_MS = 60_000
let lastPruneAt = 0

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_runtime_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_key TEXT NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'runtime',
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ops_runtime_logs_instance_created
    ON ops_runtime_logs(instance_key, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ops_runtime_logs_instance_level_created
    ON ops_runtime_logs(instance_key, level, created_at DESC);
`)

const columns = new Set(
  (opsDb.prepare('PRAGMA table_info(ops_runtime_logs)').all() as Array<{ name?: string }>)
    .map((row) => String(row.name ?? '')),
)
if (!columns.has('category')) {
  opsDb.exec("ALTER TABLE ops_runtime_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'runtime'")
}
opsDb.exec('CREATE INDEX IF NOT EXISTS idx_ops_runtime_logs_instance_category_created ON ops_runtime_logs(instance_key, category, created_at DESC)')

function secretValues() {
  return [
    config.adminWebToken,
    config.telegramBotToken,
    process.env.DISCORD_BOT_TOKEN,
    process.env.LEMPI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.X_BEARER_TOKEN,
    process.env.VK_ACCESS_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.SPOTIFY_CLIENT_SECRET,
    process.env.SPOTIFY_CLIENT_ID,
  ].filter((value): value is string => Boolean(value && value.length >= 6))
}

export function sanitizeOpsLogText(value: unknown) {
  let text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()

  for (const secret of secretValues()) text = text.split(secret).join('[REDACTED]')

  text = text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}\b/gi, '$1 [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key|access_token|auth|authorization|secret|password|passwd|session|session_id|sid|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|passwd|cookie|set-cookie|session[-_ ]?id|session|sid)\b\s*[:=]\s*["']?[^\s,;"'}]+/gi, '$1=[REDACTED]')
    .replace(/(["'](?:authorization|apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret|password|passwd|cookie|sessionId|session_id|sid)["']\s*:\s*)["'][^"']*["']/gi, '$1"[REDACTED]"')
    .replace(/\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, '[REDACTED_JWT]')
    .replace(/\b[A-Za-z0-9_-]{64,}\b/g, '[REDACTED]')

  return text.slice(0, 900) || 'runtime_event'
}

function safeSource(value: unknown) {
  return String(value ?? 'runtime').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 64) || 'runtime'
}

function inferCategory(source: string, message: string): OpsLogCategory {
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

function normalizeCategory(value: unknown, source: string, message: string): OpsLogCategory {
  if (value === 'whatsapp' || value === 'discord' || value === 'telegram' || value === 'download'
      || value === 'api' || value === 'command' || value === 'security' || value === 'runtime') return value
  return inferCategory(source, message)
}

function prune(instanceKey: string, stamp: number) {
  if (stamp - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = stamp
  opsDb.prepare('DELETE FROM ops_runtime_logs WHERE created_at < ?').run(stamp - RETENTION_MS)
  opsDb.prepare(`DELETE FROM ops_runtime_logs
    WHERE instance_key = ?
      AND id NOT IN (
        SELECT id FROM ops_runtime_logs
        WHERE instance_key = ?
        ORDER BY id DESC
        LIMIT ?
      )`).run(instanceKey, instanceKey, MAX_ROWS_PER_INSTANCE)
}

export function recordOpsRuntimeLog(
  level: OpsLogLevel,
  source: string,
  message: unknown,
  instanceKey = opsInstanceKey(),
  category?: OpsLogCategory,
) {
  const stamp = Date.now()
  try {
    const cleanSource = safeSource(source)
    const cleanMessage = sanitizeOpsLogText(message)
    const cleanCategory = normalizeCategory(category, cleanSource, cleanMessage)
    opsDb.prepare(`INSERT INTO ops_runtime_logs(instance_key, level, source, category, message, created_at)
      VALUES(?, ?, ?, ?, ?, ?)`)
      .run(instanceKey, level, cleanSource, cleanCategory, cleanMessage, stamp)
    prune(instanceKey, stamp)
    return true
  } catch {
    return false
  }
}
