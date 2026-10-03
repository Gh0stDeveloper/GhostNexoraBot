import { createHash } from 'node:crypto'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { recordOpsRuntimeLog, sanitizeOpsLogText } from './ops-runtime-log.js'
import { currentTraceContext } from './trace-context.js'

export type ErrorGroupRecord = {
  fingerprint: string
  platform: string | null
  command: string | null
  provider: string | null
  firstSeenAt: number
  lastSeenAt: number
  count: number
  sample: string
  lastCorrelationId: string | null
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_error_groups (
    instance_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    platform TEXT,
    command_name TEXT,
    provider_id TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1,
    sample TEXT NOT NULL,
    last_correlation_id TEXT,
    PRIMARY KEY(instance_key, fingerprint)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_error_groups_instance_last
    ON ops_error_groups(instance_key, last_seen_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ops_error_groups_instance_count
    ON ops_error_groups(instance_key, occurrences DESC);
`)

function scope(value: unknown, max = 100) {
  const clean = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, max)
  return clean || null
}

function normalizedError(value: unknown) {
  const raw = value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value ?? 'unknown_error')
  return sanitizeOpsLogText(raw)
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '<url>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\b\d{5,}\b/g, '<n>')
    .replace(/\b[a-z0-9_-]{24,}\b/gi, '<id>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700)
}

export function errorFingerprint(error: unknown, input: {
  platform?: string
  command?: string
  provider?: string
} = {}) {
  const trace = currentTraceContext()
  const material = [
    scope(input.platform ?? trace?.platform) ?? '-',
    scope(input.command ?? trace?.command) ?? '-',
    scope(input.provider ?? trace?.provider) ?? '-',
    normalizedError(error),
  ].join('|')
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

export function recordGroupedError(error: unknown, input: {
  platform?: string
  command?: string
  provider?: string
  correlationId?: string
  instanceKey?: string
} = {}) {
  const trace = currentTraceContext()
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const platform = scope(input.platform ?? trace?.platform)
  const command = scope(input.command ?? trace?.command)
  const provider = scope(input.provider ?? trace?.provider)
  const correlationId = scope(input.correlationId ?? trace?.correlationId, 180)
  const sample = sanitizeOpsLogText(error instanceof Error ? `${error.name}: ${error.message}` : error).slice(0, 700)
  const fingerprint = errorFingerprint(error, { platform: platform ?? undefined, command: command ?? undefined, provider: provider ?? undefined })
  const stamp = Date.now()

  opsDb.prepare(`INSERT INTO ops_error_groups(
      instance_key, fingerprint, platform, command_name, provider_id,
      first_seen_at, last_seen_at, occurrences, sample, last_correlation_id
    ) VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(instance_key, fingerprint) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      occurrences = ops_error_groups.occurrences + 1,
      sample = excluded.sample,
      last_correlation_id = excluded.last_correlation_id,
      platform = COALESCE(excluded.platform, ops_error_groups.platform),
      command_name = COALESCE(excluded.command_name, ops_error_groups.command_name),
      provider_id = COALESCE(excluded.provider_id, ops_error_groups.provider_id)`)
    .run(instanceKey, fingerprint, platform, command, provider, stamp, stamp, sample, correlationId)

  const row = opsDb.prepare(`SELECT occurrences FROM ops_error_groups
    WHERE instance_key = ? AND fingerprint = ?`).get(instanceKey, fingerprint) as { occurrences?: number } | undefined
  const count = Number(row?.occurrences ?? 1)
  if (count === 1 || count === 5 || count === 10 || count % 25 === 0) {
    recordOpsRuntimeLog('error', 'error-group', `fingerprint=${fingerprint} · count=${count} · sample=${sample}`, instanceKey, 'runtime')
  }
  return fingerprint
}

export function readErrorGroups(instanceKey = opsInstanceKey(), limit = 100): ErrorGroupRecord[] {
  return (opsDb.prepare(`SELECT fingerprint, platform, command_name AS commandName, provider_id AS providerId,
      first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt, occurrences, sample,
      last_correlation_id AS lastCorrelationId
    FROM ops_error_groups WHERE instance_key = ?
    ORDER BY last_seen_at DESC LIMIT ?`)
    .all(instanceKey, Math.max(1, Math.min(500, Math.trunc(limit)))) as unknown as Array<Record<string, unknown>>).map((row) => ({
      fingerprint: String(row.fingerprint),
      platform: row.platform ? String(row.platform) : null,
      command: row.commandName ? String(row.commandName) : null,
      provider: row.providerId ? String(row.providerId) : null,
      firstSeenAt: Number(row.firstSeenAt ?? 0),
      lastSeenAt: Number(row.lastSeenAt ?? 0),
      count: Number(row.occurrences ?? 0),
      sample: String(row.sample ?? ''),
      lastCorrelationId: row.lastCorrelationId ? String(row.lastCorrelationId) : null,
    }))
}
