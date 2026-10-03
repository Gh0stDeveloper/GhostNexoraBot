import { randomBytes } from 'node:crypto'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { currentCorrelationId } from './trace-context.js'
import { recordGroupedError } from './error-groups.js'
import { recordAdapterRetry } from './ops-observability-metrics.js'

export type DeliveryOutboxStatus = 'pending' | 'sending' | 'sent' | 'retry' | 'failed'

const BACKOFF_MS = [1_000, 3_000, 10_000] as const
const RETENTION_MS = 7 * 86_400_000
let lastPruneAt = 0

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS delivery_outbox (
    id TEXT PRIMARY KEY,
    instance_key TEXT NOT NULL,
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    correlation_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sent_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_delivery_outbox_instance_status
    ON delivery_outbox(instance_key, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_delivery_outbox_retry
    ON delivery_outbox(instance_key, next_attempt_at);
`)

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safe(value: unknown, max: number) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)
}

function prune(instanceKey: string, now = Date.now()) {
  if (now - lastPruneAt < 60_000) return
  lastPruneAt = now
  opsDb.prepare(`UPDATE delivery_outbox
    SET status = 'retry', next_attempt_at = ?, updated_at = ?
    WHERE instance_key = ? AND status = 'sending' AND updated_at < ?`)
    .run(now, now, instanceKey, now - 5 * 60_000)
  opsDb.prepare(`DELETE FROM delivery_outbox
    WHERE updated_at < ? AND status IN ('sent','failed')`).run(now - RETENTION_MS)
}

function newId() {
  return `out_${randomBytes(12).toString('base64url')}`
}

export async function deliverWithOutbox<T>(input: {
  platform: string
  chatId: string
  kind: string
  label?: string
  correlationId?: string
  instanceKey?: string
  maxAttempts?: number
  /** Test/controlled override. Production callers use the default 1s -> 3s -> 10s policy. */
  backoffMs?: readonly number[]
}, operation: () => Promise<T>): Promise<T> {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const correlationId = input.correlationId ?? currentCorrelationId()
  const id = newId()
  const now = Date.now()
  const maxAttempts = Math.max(1, Math.min(4, Math.trunc(input.maxAttempts ?? 4)))
  opsDb.prepare(`INSERT INTO delivery_outbox(
      id, instance_key, platform, chat_id, kind, label, correlation_id,
      status, attempts, next_attempt_at, last_error, created_at, updated_at, sent_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?, NULL)`)
    .run(
      id,
      instanceKey,
      safe(input.platform, 32),
      safe(input.chatId, 180),
      safe(input.kind, 40),
      safe(input.label || input.kind, 120),
      correlationId ? safe(correlationId, 180) : null,
      now,
      now,
    )
  prune(instanceKey, now)

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const stamp = Date.now()
    opsDb.prepare(`UPDATE delivery_outbox
      SET status = 'sending', attempts = ?, next_attempt_at = NULL, updated_at = ?
      WHERE id = ? AND instance_key = ?`).run(attempt, stamp, id, instanceKey)
    try {
      const result = await operation()
      const sentAt = Date.now()
      opsDb.prepare(`UPDATE delivery_outbox
        SET status = 'sent', last_error = NULL, next_attempt_at = NULL, sent_at = ?, updated_at = ?
        WHERE id = ? AND instance_key = ?`).run(sentAt, sentAt, id, instanceKey)
      return result
    } catch (error) {
      lastError = error
      const message = safe(error instanceof Error ? error.message : error, 700)
      if (attempt >= maxAttempts) {
        opsDb.prepare(`UPDATE delivery_outbox
          SET status = 'failed', last_error = ?, next_attempt_at = NULL, updated_at = ?
          WHERE id = ? AND instance_key = ?`).run(message, Date.now(), id, instanceKey)
        break
      }
      if (input.platform === 'whatsapp' || input.platform === 'discord' || input.platform === 'telegram') {
        recordAdapterRetry(input.platform)
      }
      const backoff = input.backoffMs?.length ? input.backoffMs : BACKOFF_MS
      const wait = Math.max(0, Math.min(60_000, Math.trunc(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0)))
      const nextAt = Date.now() + wait
      opsDb.prepare(`UPDATE delivery_outbox
        SET status = 'retry', last_error = ?, next_attempt_at = ?, updated_at = ?
        WHERE id = ? AND instance_key = ?`).run(message, nextAt, Date.now(), id, instanceKey)
      await delay(wait)
    }
  }
  const terminal = lastError instanceof Error ? lastError : new Error(String(lastError ?? 'delivery_failed'))
  recordGroupedError(terminal, {
    platform: input.platform,
    correlationId,
    instanceKey,
  })
  throw terminal
}

export function deliveryOutboxSnapshot(instanceKey = opsInstanceKey()) {
  return opsDb.prepare(`SELECT id, platform, chat_id AS chatId, kind, label,
      correlation_id AS correlationId, status, attempts, next_attempt_at AS nextAttemptAt,
      last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt, sent_at AS sentAt
    FROM delivery_outbox WHERE instance_key = ? ORDER BY updated_at DESC LIMIT 100`)
    .all(instanceKey)
}
