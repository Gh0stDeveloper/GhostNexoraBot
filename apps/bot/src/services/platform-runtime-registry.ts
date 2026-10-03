import { opsDb, opsInstanceKey } from './ops-database.js'
import { sanitizeOpsLogText } from './ops-runtime-log.js'

export type RuntimePlatform = 'whatsapp' | 'discord' | 'telegram'

export type PlatformRuntimeRecord = {
  platform: RuntimePlatform
  state: string
  latencyMs: number
  eventCount: number
  groupCount: number
  reconnects: number
  rateLimits: number
  lastEventAt: number
  lastError: string | null
  details: Record<string, unknown>
  updatedAt: number
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_platform_runtime (
    instance_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'unknown',
    latency_ms REAL NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    group_count INTEGER NOT NULL DEFAULT 0,
    reconnects INTEGER NOT NULL DEFAULT 0,
    rate_limits INTEGER NOT NULL DEFAULT 0,
    last_event_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, platform)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_platform_runtime_instance_updated
    ON ops_platform_runtime(instance_key, updated_at DESC);
`)

function state(value: unknown) {
  return String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 64) || 'unknown'
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function detailsJson(value: Record<string, unknown> | undefined) {
  if (!value) return '{}'
  const clean: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value).slice(0, 24)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 80)
    if (!safeKey) continue
    if (typeof item === 'number' || typeof item === 'boolean' || item === null) clean[safeKey] = item
    else clean[safeKey] = sanitizeOpsLogText(item).slice(0, 240)
  }
  return JSON.stringify(clean)
}

export function updatePlatformRuntime(platform: RuntimePlatform, input: {
  state?: string
  latencyMs?: number
  eventDelta?: number
  eventCount?: number
  groupCount?: number
  reconnects?: number
  reconnectDelta?: number
  rateLimits?: number
  rateLimitDelta?: number
  lastEventAt?: number
  lastError?: string | null
  details?: Record<string, unknown>
  instanceKey?: string
}) {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const now = Date.now()
  const current = opsDb.prepare(`SELECT state, latency_ms AS latencyMs, event_count AS eventCount,
      group_count AS groupCount, reconnects, rate_limits AS rateLimits, last_event_at AS lastEventAt,
      last_error AS lastError, details_json AS detailsJson
    FROM ops_platform_runtime WHERE instance_key = ? AND platform = ?`)
    .get(instanceKey, platform) as Record<string, unknown> | undefined

  const eventCount = input.eventCount === undefined
    ? Number(current?.eventCount ?? 0) + Math.max(0, Math.trunc(input.eventDelta ?? 0))
    : Math.max(0, Math.trunc(input.eventCount))
  const reconnects = input.reconnects === undefined
    ? Number(current?.reconnects ?? 0) + Math.max(0, Math.trunc(input.reconnectDelta ?? 0))
    : Math.max(0, Math.trunc(input.reconnects))
  const rateLimits = input.rateLimits === undefined
    ? Number(current?.rateLimits ?? 0) + Math.max(0, Math.trunc(input.rateLimitDelta ?? 0))
    : Math.max(0, Math.trunc(input.rateLimits))
  const error = input.lastError === undefined
    ? (current?.lastError ? String(current.lastError) : null)
    : input.lastError ? sanitizeOpsLogText(input.lastError).slice(0, 500) : null
  const details = input.details === undefined
    ? String(current?.detailsJson ?? '{}')
    : detailsJson(input.details)

  opsDb.prepare(`INSERT INTO ops_platform_runtime(
      instance_key, platform, state, latency_ms, event_count, group_count, reconnects,
      rate_limits, last_event_at, last_error, details_json, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, platform) DO UPDATE SET
      state = excluded.state,
      latency_ms = excluded.latency_ms,
      event_count = excluded.event_count,
      group_count = excluded.group_count,
      reconnects = excluded.reconnects,
      rate_limits = excluded.rate_limits,
      last_event_at = excluded.last_event_at,
      last_error = excluded.last_error,
      details_json = excluded.details_json,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      platform,
      state(input.state ?? current?.state ?? 'unknown'),
      finite(input.latencyMs, Number(current?.latencyMs ?? 0)),
      eventCount,
      Math.max(0, Math.trunc(input.groupCount ?? Number(current?.groupCount ?? 0))),
      reconnects,
      rateLimits,
      Math.max(0, Math.trunc(input.lastEventAt ?? Number(current?.lastEventAt ?? 0))),
      error,
      details,
      now,
    )
}

export function recordPlatformRuntimeEvent(platform: RuntimePlatform, input: {
  state?: string
  latencyMs?: number
  groupCount?: number
  reconnect?: boolean
  rateLimited?: boolean
  error?: string | null
  details?: Record<string, unknown>
  instanceKey?: string
} = {}) {
  updatePlatformRuntime(platform, {
    ...input,
    eventDelta: 1,
    reconnectDelta: input.reconnect ? 1 : 0,
    rateLimitDelta: input.rateLimited ? 1 : 0,
    lastEventAt: Date.now(),
    lastError: input.error,
  })
}

export function readPlatformRuntimeRegistry(instanceKey = opsInstanceKey()): PlatformRuntimeRecord[] {
  const rows = opsDb.prepare(`SELECT platform, state, latency_ms AS latencyMs, event_count AS eventCount,
      group_count AS groupCount, reconnects, rate_limits AS rateLimits, last_event_at AS lastEventAt,
      last_error AS lastError, details_json AS detailsJson, updated_at AS updatedAt
    FROM ops_platform_runtime WHERE instance_key = ? ORDER BY platform ASC`)
    .all(instanceKey) as unknown as Array<Record<string, unknown>>

  return rows.map((row) => {
    let details: Record<string, unknown> = {}
    try { details = JSON.parse(String(row.detailsJson ?? '{}')) as Record<string, unknown> } catch {}
    return {
      platform: String(row.platform) as RuntimePlatform,
      state: String(row.state ?? 'unknown'),
      latencyMs: Number(row.latencyMs ?? 0),
      eventCount: Number(row.eventCount ?? 0),
      groupCount: Number(row.groupCount ?? 0),
      reconnects: Number(row.reconnects ?? 0),
      rateLimits: Number(row.rateLimits ?? 0),
      lastEventAt: Number(row.lastEventAt ?? 0),
      lastError: row.lastError ? String(row.lastError) : null,
      details,
      updatedAt: Number(row.updatedAt ?? 0),
    }
  })
}
