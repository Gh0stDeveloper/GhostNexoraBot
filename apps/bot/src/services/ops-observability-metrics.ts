import { opsDb, opsInstanceKey } from './ops-database.js'
import { sanitizeOpsLogText } from './ops-runtime-log.js'
import type { RuntimePlatform } from './platform-runtime-registry.js'

export type QueueMetricDimension = 'platform' | 'command' | 'provider' | 'lane'

export type QueueMetricRecord = {
  dimensionType: QueueMetricDimension
  dimensionId: string
  platform: string
  executions: number
  failures: number
  retries: number
  saturation: number
  averageWaitMs: number
  maxWaitMs: number
  lastWaitMs: number
  averageExecutionMs: number
  maxExecutionMs: number
  lastExecutionMs: number
  updatedAt: number
}

export type AdapterMetricRecord = {
  platform: RuntimePlatform
  sent: number
  failed: number
  retries: number
  editFailures: number
  typingFailures: number
  uploadBytes: number
  rateLimits: number
  averageLatencyMs: number
  maxLatencyMs: number
  lastLatencyMs: number
  lastError: string | null
  updatedAt: number
}

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_queue_metrics (
    instance_key TEXT NOT NULL,
    dimension_type TEXT NOT NULL,
    dimension_id TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'unknown',
    executions INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    retries INTEGER NOT NULL DEFAULT 0,
    saturation INTEGER NOT NULL DEFAULT 0,
    total_wait_ms REAL NOT NULL DEFAULT 0,
    max_wait_ms REAL NOT NULL DEFAULT 0,
    last_wait_ms REAL NOT NULL DEFAULT 0,
    total_execution_ms REAL NOT NULL DEFAULT 0,
    max_execution_ms REAL NOT NULL DEFAULT 0,
    last_execution_ms REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, dimension_type, dimension_id, platform)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_queue_metrics_instance_updated
    ON ops_queue_metrics(instance_key, updated_at DESC);

  CREATE TABLE IF NOT EXISTS ops_adapter_metrics (
    instance_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    retries INTEGER NOT NULL DEFAULT 0,
    edit_failures INTEGER NOT NULL DEFAULT 0,
    typing_failures INTEGER NOT NULL DEFAULT 0,
    upload_bytes INTEGER NOT NULL DEFAULT 0,
    rate_limits INTEGER NOT NULL DEFAULT 0,
    total_latency_ms REAL NOT NULL DEFAULT 0,
    max_latency_ms REAL NOT NULL DEFAULT 0,
    last_latency_ms REAL NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(instance_key, platform)
  );
`)

function id(value: unknown, fallback = 'unknown') {
  return String(value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 120) || fallback
}

function ms(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function upsertQueue(dimensionType: QueueMetricDimension, dimensionId: string, input: {
  platform?: string
  waitMs: number
  executionMs: number
  failed?: boolean
  retries?: number
  saturated?: boolean
  instanceKey?: string
}) {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const platform = id(input.platform, 'unknown')
  const waitMs = ms(input.waitMs)
  const executionMs = ms(input.executionMs)
  const stamp = Date.now()
  opsDb.prepare(`INSERT INTO ops_queue_metrics(
      instance_key, dimension_type, dimension_id, platform, executions, failures, retries, saturation,
      total_wait_ms, max_wait_ms, last_wait_ms, total_execution_ms, max_execution_ms, last_execution_ms, updated_at
    ) VALUES(?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, dimension_type, dimension_id, platform) DO UPDATE SET
      executions = ops_queue_metrics.executions + 1,
      failures = ops_queue_metrics.failures + excluded.failures,
      retries = ops_queue_metrics.retries + excluded.retries,
      saturation = ops_queue_metrics.saturation + excluded.saturation,
      total_wait_ms = ops_queue_metrics.total_wait_ms + excluded.total_wait_ms,
      max_wait_ms = MAX(ops_queue_metrics.max_wait_ms, excluded.max_wait_ms),
      last_wait_ms = excluded.last_wait_ms,
      total_execution_ms = ops_queue_metrics.total_execution_ms + excluded.total_execution_ms,
      max_execution_ms = MAX(ops_queue_metrics.max_execution_ms, excluded.max_execution_ms),
      last_execution_ms = excluded.last_execution_ms,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      dimensionType,
      id(dimensionId),
      platform,
      input.failed ? 1 : 0,
      Math.max(0, Math.trunc(input.retries ?? 0)),
      input.saturated ? 1 : 0,
      waitMs,
      waitMs,
      waitMs,
      executionMs,
      executionMs,
      executionMs,
      stamp,
    )
}

export function recordQueueObservation(input: {
  platform?: string
  command?: string
  provider?: string
  lane?: string
  waitMs: number
  executionMs: number
  failed?: boolean
  retries?: number
  saturated?: boolean
  instanceKey?: string
}) {
  const dimensions: Array<[QueueMetricDimension, string | undefined]> = [
    ['platform', input.platform],
    ['command', input.command],
    ['provider', input.provider],
    ['lane', input.lane],
  ]
  const seen = new Set<string>()
  for (const [type, value] of dimensions) {
    if (!value) continue
    const key = `${type}:${value}`
    if (seen.has(key)) continue
    seen.add(key)
    upsertQueue(type, value, input)
  }
}

export function recordAdapterOperation(platform: RuntimePlatform, input: {
  ok: boolean
  operation: 'send' | 'media' | 'ui' | 'edit' | 'typing' | 'reaction' | 'api'
  latencyMs: number
  uploadBytes?: number
  retries?: number
  rateLimits?: number
  error?: unknown
  instanceKey?: string
}) {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const latencyMs = ms(input.latencyMs)
  const sent = input.ok && ['send','media','ui'].includes(input.operation) ? 1 : 0
  const failed = input.ok ? 0 : 1
  const editFailures = !input.ok && input.operation === 'edit' ? 1 : 0
  const typingFailures = !input.ok && input.operation === 'typing' ? 1 : 0
  const error = input.ok ? null : sanitizeOpsLogText(input.error instanceof Error ? input.error.message : input.error).slice(0, 500)
  const stamp = Date.now()

  opsDb.prepare(`INSERT INTO ops_adapter_metrics(
      instance_key, platform, sent, failed, retries, edit_failures, typing_failures,
      upload_bytes, rate_limits, total_latency_ms, max_latency_ms, last_latency_ms, last_error, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, platform) DO UPDATE SET
      sent = ops_adapter_metrics.sent + excluded.sent,
      failed = ops_adapter_metrics.failed + excluded.failed,
      retries = ops_adapter_metrics.retries + excluded.retries,
      edit_failures = ops_adapter_metrics.edit_failures + excluded.edit_failures,
      typing_failures = ops_adapter_metrics.typing_failures + excluded.typing_failures,
      upload_bytes = ops_adapter_metrics.upload_bytes + excluded.upload_bytes,
      rate_limits = ops_adapter_metrics.rate_limits + excluded.rate_limits,
      total_latency_ms = ops_adapter_metrics.total_latency_ms + excluded.total_latency_ms,
      max_latency_ms = MAX(ops_adapter_metrics.max_latency_ms, excluded.max_latency_ms),
      last_latency_ms = excluded.last_latency_ms,
      last_error = CASE WHEN excluded.failed = 1 THEN excluded.last_error ELSE ops_adapter_metrics.last_error END,
      updated_at = excluded.updated_at`)
    .run(
      instanceKey,
      platform,
      sent,
      failed,
      Math.max(0, Math.trunc(input.retries ?? 0)),
      editFailures,
      typingFailures,
      Math.max(0, Math.trunc(input.uploadBytes ?? 0)),
      Math.max(0, Math.trunc(input.rateLimits ?? 0)),
      latencyMs,
      latencyMs,
      latencyMs,
      error,
      stamp,
    )
}

export function readQueueMetrics(instanceKey = opsInstanceKey()): QueueMetricRecord[] {
  return (opsDb.prepare(`SELECT dimension_type AS dimensionType, dimension_id AS dimensionId, platform,
      executions, failures, retries, saturation, total_wait_ms AS totalWaitMs, max_wait_ms AS maxWaitMs,
      last_wait_ms AS lastWaitMs, total_execution_ms AS totalExecutionMs,
      max_execution_ms AS maxExecutionMs, last_execution_ms AS lastExecutionMs, updated_at AS updatedAt
    FROM ops_queue_metrics WHERE instance_key = ? ORDER BY updated_at DESC LIMIT 250`)
    .all(instanceKey) as unknown as Array<Record<string, unknown>>).map((row) => {
      const executions = Number(row.executions ?? 0)
      return {
        dimensionType: String(row.dimensionType) as QueueMetricDimension,
        dimensionId: String(row.dimensionId ?? ''),
        platform: String(row.platform ?? 'unknown'),
        executions,
        failures: Number(row.failures ?? 0),
        retries: Number(row.retries ?? 0),
        saturation: Number(row.saturation ?? 0),
        averageWaitMs: executions ? Number(row.totalWaitMs ?? 0) / executions : 0,
        maxWaitMs: Number(row.maxWaitMs ?? 0),
        lastWaitMs: Number(row.lastWaitMs ?? 0),
        averageExecutionMs: executions ? Number(row.totalExecutionMs ?? 0) / executions : 0,
        maxExecutionMs: Number(row.maxExecutionMs ?? 0),
        lastExecutionMs: Number(row.lastExecutionMs ?? 0),
        updatedAt: Number(row.updatedAt ?? 0),
      }
    })
}

export function readAdapterMetrics(instanceKey = opsInstanceKey()): AdapterMetricRecord[] {
  return (opsDb.prepare(`SELECT platform, sent, failed, retries, edit_failures AS editFailures,
      typing_failures AS typingFailures, upload_bytes AS uploadBytes, rate_limits AS rateLimits,
      total_latency_ms AS totalLatencyMs, max_latency_ms AS maxLatencyMs,
      last_latency_ms AS lastLatencyMs, last_error AS lastError, updated_at AS updatedAt
    FROM ops_adapter_metrics WHERE instance_key = ? ORDER BY platform ASC`)
    .all(instanceKey) as unknown as Array<Record<string, unknown>>).map((row) => {
      const attempts = Number(row.sent ?? 0) + Number(row.failed ?? 0)
      return {
        platform: String(row.platform) as RuntimePlatform,
        sent: Number(row.sent ?? 0),
        failed: Number(row.failed ?? 0),
        retries: Number(row.retries ?? 0),
        editFailures: Number(row.editFailures ?? 0),
        typingFailures: Number(row.typingFailures ?? 0),
        uploadBytes: Number(row.uploadBytes ?? 0),
        rateLimits: Number(row.rateLimits ?? 0),
        averageLatencyMs: attempts ? Number(row.totalLatencyMs ?? 0) / attempts : 0,
        maxLatencyMs: Number(row.maxLatencyMs ?? 0),
        lastLatencyMs: Number(row.lastLatencyMs ?? 0),
        lastError: row.lastError ? String(row.lastError) : null,
        updatedAt: Number(row.updatedAt ?? 0),
      }
    })
}
