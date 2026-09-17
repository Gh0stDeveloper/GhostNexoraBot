import { setOpsAlert } from './ops-alerts.js'
import { opsDb, opsInstanceKey } from './ops-database.js'

export type ProviderHealthRecord = {
  providerId: string
  label: string
  requests: number
  successes: number
  failures: number
  consecutiveFailures: number
  averageLatencyMs: number
  lastLatencyMs: number
  lastSuccessAt: number
  lastFailureAt: number
  lastError: string | null
  updatedAt: number
}

export type ProviderCircuitState = 'closed' | 'open' | 'half-open'

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_OPEN_MS = 5 * 60_000

const PROVIDER_LABELS: Record<string, string> = {
  lempi: 'LemPi',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  happymod: 'HappyMod',
  erome: 'Erome',
  likee: 'Likee',
  terabox: 'TeraBox',
  pinterest: 'Pinterest',
  deepseek: 'DeepSeek',
  'x-official': 'X Official API',
  'x-ytdlp': 'X yt-dlp',
  'vk-official': 'VK Official API',
  'vk-ytdlp': 'VK yt-dlp',
  'apkmirror-html': 'APKMirror',
  'apkpure-html': 'APKPure',
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_provider_health (
    instance_key TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_label TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    total_latency_ms REAL NOT NULL DEFAULT 0,
    last_latency_ms REAL NOT NULL DEFAULT 0,
    last_success_at INTEGER NOT NULL DEFAULT 0,
    last_failure_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, provider_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_provider_health_instance_updated
    ON ops_provider_health(instance_key, updated_at DESC);
`)

function normalizedProviderId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return normalized.replace(/^-+|-+$/g, '').slice(0, 64) || 'unknown'
}

function safeErrorCode(value?: string | null) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  const safe = raw.replace(/[^a-z0-9_.:-]+/g, '_').slice(0, 80)
  return safe || 'request_failed'
}

export function providerLabel(providerId: string) {
  const id = normalizedProviderId(providerId)
  return PROVIDER_LABELS[id] ?? id.replace(/(^|-)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`)
}

function updateProviderAlert(instanceKey: string, id: string, label: string) {
  const row = opsDb.prepare(`SELECT consecutive_failures AS consecutiveFailures, last_error AS lastError
    FROM ops_provider_health WHERE instance_key = ? AND provider_id = ?`).get(instanceKey, id) as {
      consecutiveFailures?: number
      lastError?: string | null
    } | undefined
  const failures = Number(row?.consecutiveFailures ?? 0)
  setOpsAlert({
    key: `provider:${id}`,
    severity: failures >= 5 ? 'critical' : 'warning',
    title: `${label} provider unavailable`,
    detail: failures ? `${failures} consecutive failures · ${String(row?.lastError ?? 'provider_failure')}` : null,
    active: failures >= CIRCUIT_FAILURE_THRESHOLD,
    instanceKey,
  })
}

export function recordProviderAttempt(providerId: string, input: {
  ok: boolean
  latencyMs: number
  label?: string
  errorCode?: string | null
  instanceKey?: string
}) {
  const id = normalizedProviderId(providerId)
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const label = String(input.label ?? providerLabel(id)).trim().slice(0, 80) || providerLabel(id)
  const latencyMs = Math.max(0, Number.isFinite(input.latencyMs) ? input.latencyMs : 0)
  const stamp = Date.now()
  const success = input.ok ? 1 : 0
  const failure = input.ok ? 0 : 1
  const errorCode = input.ok ? null : safeErrorCode(input.errorCode) ?? 'request_failed'

  opsDb.prepare(`INSERT INTO ops_provider_health(
      instance_key, provider_id, provider_label, requests, successes, failures,
      consecutive_failures, total_latency_ms, last_latency_ms,
      last_success_at, last_failure_at, last_error, updated_at
    ) VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, provider_id) DO UPDATE SET
      provider_label = excluded.provider_label,
      requests = ops_provider_health.requests + 1,
      successes = ops_provider_health.successes + excluded.successes,
      failures = ops_provider_health.failures + excluded.failures,
      consecutive_failures = CASE WHEN excluded.successes = 1 THEN 0 ELSE ops_provider_health.consecutive_failures + 1 END,
      total_latency_ms = ops_provider_health.total_latency_ms + excluded.total_latency_ms,
      last_latency_ms = excluded.last_latency_ms,
      last_success_at = CASE WHEN excluded.successes = 1 THEN excluded.last_success_at ELSE ops_provider_health.last_success_at END,
      last_failure_at = CASE WHEN excluded.failures = 1 THEN excluded.last_failure_at ELSE ops_provider_health.last_failure_at END,
      last_error = CASE WHEN excluded.successes = 1 THEN NULL ELSE excluded.last_error END,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      id,
      label,
      success,
      failure,
      failure,
      latencyMs,
      latencyMs,
      success ? stamp : 0,
      failure ? stamp : 0,
      errorCode,
      stamp,
    )
  updateProviderAlert(instanceKey, id, label)
}

export function readProviderHealth(instanceKey = opsInstanceKey()): ProviderHealthRecord[] {
  const rows = opsDb.prepare(`SELECT
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
    ORDER BY provider_label COLLATE NOCASE ASC`).all(instanceKey) as unknown as Array<Record<string, string | number | null>>

  return rows.map((row) => {
    const requests = Number(row.requests ?? 0)
    return {
      providerId: String(row.providerId ?? ''),
      label: String(row.label ?? ''),
      requests,
      successes: Number(row.successes ?? 0),
      failures: Number(row.failures ?? 0),
      consecutiveFailures: Number(row.consecutiveFailures ?? 0),
      averageLatencyMs: requests ? Number(row.totalLatencyMs ?? 0) / requests : 0,
      lastLatencyMs: Number(row.lastLatencyMs ?? 0),
      lastSuccessAt: Number(row.lastSuccessAt ?? 0),
      lastFailureAt: Number(row.lastFailureAt ?? 0),
      lastError: row.lastError ? String(row.lastError) : null,
      updatedAt: Number(row.updatedAt ?? 0),
    }
  })
}

export function providerCircuitState(providerId: string, input: {
  instanceKey?: string
  failureThreshold?: number
  openMs?: number
  now?: number
} = {}): ProviderCircuitState {
  const id = normalizedProviderId(providerId)
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const failureThreshold = Math.max(1, Math.trunc(input.failureThreshold ?? CIRCUIT_FAILURE_THRESHOLD))
  const openMs = Math.max(1_000, Math.trunc(input.openMs ?? CIRCUIT_OPEN_MS))
  const now = input.now ?? Date.now()
  const row = opsDb.prepare(`SELECT consecutive_failures AS consecutiveFailures,
      last_success_at AS lastSuccessAt, last_failure_at AS lastFailureAt
    FROM ops_provider_health WHERE instance_key = ? AND provider_id = ?`).get(instanceKey, id) as {
      consecutiveFailures?: number
      lastSuccessAt?: number
      lastFailureAt?: number
    } | undefined

  if (!row) return 'closed'
  const consecutiveFailures = Number(row.consecutiveFailures ?? 0)
  const lastSuccessAt = Number(row.lastSuccessAt ?? 0)
  const lastFailureAt = Number(row.lastFailureAt ?? 0)
  if (consecutiveFailures < failureThreshold || !lastFailureAt || lastSuccessAt > lastFailureAt) return 'closed'
  if (now - lastFailureAt < openMs) return 'open'
  return 'half-open'
}

export function providerCircuitAllows(providerId: string, input: Parameters<typeof providerCircuitState>[1] = {}) {
  return providerCircuitState(providerId, input) !== 'open'
}
