import { randomBytes } from 'node:crypto'
import { opsDb, opsInstanceKey } from './ops-database.js'
import { recordOpsRuntimeLog, sanitizeOpsLogText } from './ops-runtime-log.js'

export type OpsJobType = 'yt-dlp' | 'ffmpeg' | 'download' | 'broadcast' | 'ai' | 'update' | 'other'
export type OpsJobStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'
export type OpsJobAction = 'cancel' | 'retry'

type MaybePromise<T> = T | Promise<T>
type CancelHandler = () => MaybePromise<boolean | void>
type RetryHandler = () => MaybePromise<string | void>

const instanceKey = opsInstanceKey()
const MAX_ROWS_PER_INSTANCE = 500
const RETENTION_MS = 7 * 86_400_000
const STALE_ACTIVE_MS = 6 * 60 * 60_000
const REQUEST_POLL_MS = 1_000
const cancelHandlers = new Map<string, CancelHandler>()
const retryHandlers = new Map<string, RetryHandler>()
let processingRequests = false
let lastPruneAt = 0

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_jobs (
    id TEXT PRIMARY KEY,
    instance_key TEXT NOT NULL,
    job_type TEXT NOT NULL,
    label TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    progress INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    error TEXT,
    cancellable INTEGER NOT NULL DEFAULT 0,
    retryable INTEGER NOT NULL DEFAULT 0,
    retry_of TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ops_jobs_instance_updated
    ON ops_jobs(instance_key, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ops_jobs_instance_status_updated
    ON ops_jobs(instance_key, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ops_jobs_instance_type_updated
    ON ops_jobs(instance_key, job_type, updated_at DESC);

  CREATE TABLE IF NOT EXISTS ops_job_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_key TEXT NOT NULL,
    job_id TEXT NOT NULL,
    action TEXT NOT NULL,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    result_job_id TEXT,
    requested_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ops_job_requests_pending
    ON ops_job_requests(instance_key, status, requested_at);
`)

function clean(value: unknown, max = 300) {
  return sanitizeOpsLogText(value).slice(0, max)
}

function clampProgress(value: unknown) {
  const parsed = Math.round(Number(value ?? 0))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}

function normalizeType(value: OpsJobType | string): OpsJobType {
  return value === 'yt-dlp' || value === 'ffmpeg' || value === 'download'
    || value === 'broadcast' || value === 'ai' || value === 'update'
    ? value
    : 'other'
}

function newJobId() {
  return `job_${randomBytes(12).toString('base64url')}`
}

function updateJob(id: string, patch: {
  status?: OpsJobStatus
  progress?: number
  detail?: string | null
  error?: string | null
  startedAt?: number | null
  completedAt?: number | null
}) {
  const row = opsDb.prepare(`SELECT status, progress, detail, error, started_at AS startedAt,
      completed_at AS completedAt FROM ops_jobs WHERE id = ? AND instance_key = ?`)
    .get(id, instanceKey) as Record<string, unknown> | undefined
  if (!row) return false
  const stamp = Date.now()
  opsDb.prepare(`UPDATE ops_jobs SET status = ?, progress = ?, detail = ?, error = ?,
      started_at = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND instance_key = ?`).run(
      patch.status ?? String(row.status),
      patch.progress === undefined ? Number(row.progress ?? 0) : clampProgress(patch.progress),
      patch.detail === undefined ? (row.detail ?? null) : patch.detail ? clean(patch.detail, 500) : null,
      patch.error === undefined ? (row.error ?? null) : patch.error ? clean(patch.error, 700) : null,
      patch.startedAt === undefined ? (row.startedAt ?? null) : patch.startedAt,
      patch.completedAt === undefined ? (row.completedAt ?? null) : patch.completedAt,
      stamp,
      id,
      instanceKey,
    )
  return true
}

function prune(stamp = Date.now()) {
  if (stamp - lastPruneAt < 60_000) return
  lastPruneAt = stamp
  opsDb.prepare(`UPDATE ops_jobs SET status = 'failed', error = 'runtime_restarted_or_job_stale',
      completed_at = ?, updated_at = ?
    WHERE instance_key = ? AND status IN ('waiting','running') AND updated_at < ?`)
    .run(stamp, stamp, instanceKey, stamp - STALE_ACTIVE_MS)
  opsDb.prepare('DELETE FROM ops_job_requests WHERE requested_at < ?').run(stamp - RETENTION_MS)
  opsDb.prepare('DELETE FROM ops_jobs WHERE completed_at IS NOT NULL AND completed_at < ?').run(stamp - RETENTION_MS)
  opsDb.prepare(`DELETE FROM ops_jobs WHERE instance_key = ? AND id NOT IN (
    SELECT id FROM ops_jobs WHERE instance_key = ? ORDER BY updated_at DESC LIMIT ?
  )`).run(instanceKey, instanceKey, MAX_ROWS_PER_INSTANCE)
}

export function createOpsJob(input: {
  type: OpsJobType | string
  label: string
  source?: string
  instanceKey?: string
  cancellable?: boolean
  retryable?: boolean
  retryOf?: string | null
  waitingDetail?: string
}) {
  const scopedInstance = input.instanceKey ?? instanceKey
  if (scopedInstance !== instanceKey) throw new Error('job_instance_mismatch')
  const id = newJobId()
  const stamp = Date.now()
  const type = normalizeType(input.type)
  const label = clean(input.label || type, 140)
  const source = clean(input.source || type, 100)
  opsDb.prepare(`INSERT INTO ops_jobs(
      id, instance_key, job_type, label, source, status, progress, detail, error,
      cancellable, retryable, retry_of, created_at, started_at, completed_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, 'waiting', 0, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?)`)
    .run(
      id,
      instanceKey,
      type,
      label,
      source,
      input.waitingDetail ? clean(input.waitingDetail, 500) : null,
      input.cancellable ? 1 : 0,
      input.retryable ? 1 : 0,
      input.retryOf ?? null,
      stamp,
      stamp,
    )
  prune(stamp)
  recordOpsRuntimeLog('debug', 'jobs', `job_waiting · type=${type} · id=${id} · source=${source}`, instanceKey, 'runtime')

  let terminal = false
  const handle = {
    id,
    type,
    instanceKey,
    start(detail?: string) {
      if (terminal) return
      updateJob(id, { status: 'running', progress: 0, detail: detail ?? null, error: null, startedAt: Date.now(), completedAt: null })
      recordOpsRuntimeLog('debug', 'jobs', `job_running · type=${type} · id=${id}`, instanceKey, 'runtime')
    },
    update(progress: number, detail?: string) {
      if (terminal) return
      updateJob(id, { status: 'running', progress, detail: detail ?? undefined, startedAt: Date.now() })
    },
    complete(detail?: string) {
      if (terminal) return
      terminal = true
      cancelHandlers.delete(id)
      updateJob(id, { status: 'completed', progress: 100, detail: detail ?? null, error: null, completedAt: Date.now() })
      recordOpsRuntimeLog('info', 'jobs', `job_completed · type=${type} · id=${id}`, instanceKey, 'runtime')
    },
    fail(error: unknown, detail?: string) {
      if (terminal) return
      terminal = true
      cancelHandlers.delete(id)
      const errorText = error instanceof Error ? error.message : String(error ?? 'job_failed')
      updateJob(id, { status: 'failed', detail: detail ?? null, error: errorText, completedAt: Date.now() })
      recordOpsRuntimeLog('error', 'jobs', `job_failed · type=${type} · id=${id} · error=${clean(errorText, 220)}`, instanceKey, 'runtime')
    },
    cancelled(detail = 'cancelled_by_request') {
      if (terminal) return
      terminal = true
      cancelHandlers.delete(id)
      updateJob(id, { status: 'cancelled', detail, error: null, completedAt: Date.now() })
      recordOpsRuntimeLog('warn', 'jobs', `job_cancelled · type=${type} · id=${id}`, instanceKey, 'runtime')
    },
    setCancelHandler(handler: CancelHandler) {
      if (input.cancellable && !terminal) cancelHandlers.set(id, handler)
      return handle
    },
    setRetryHandler(handler: RetryHandler) {
      if (input.retryable) retryHandlers.set(id, handler)
      return handle
    },
  }
  return handle
}

function requestRow(id: number) {
  return opsDb.prepare(`SELECT id, job_id AS jobId, action, requested_by AS requestedBy
    FROM ops_job_requests WHERE id = ? AND instance_key = ? LIMIT 1`)
    .get(id, instanceKey) as { id: number; jobId: string; action: string; requestedBy?: string | null } | undefined
}

async function processRequest(id: number) {
  const request = requestRow(id)
  if (!request) return
  opsDb.prepare("UPDATE ops_job_requests SET status = 'processing' WHERE id = ? AND status = 'pending'").run(id)
  const job = opsDb.prepare(`SELECT id, status, cancellable, retryable FROM ops_jobs
    WHERE id = ? AND instance_key = ? LIMIT 1`).get(request.jobId, instanceKey) as {
      id?: string
      status?: string
      cancellable?: number
      retryable?: number
    } | undefined

  try {
    if (!job?.id) throw new Error('job_not_found')
    if (request.action === 'cancel') {
      if (!job.cancellable || !['waiting', 'running'].includes(String(job.status))) throw new Error('job_not_cancellable')
      const handler = cancelHandlers.get(request.jobId)
      if (!handler) throw new Error('cancel_handler_unavailable')
      const accepted = await handler()
      if (accepted === false) throw new Error('cancel_rejected')
      updateJob(request.jobId, { status: 'cancelled', detail: 'cancel_requested', completedAt: Date.now() })
    } else if (request.action === 'retry') {
      if (!job.retryable || !['failed', 'cancelled'].includes(String(job.status))) throw new Error('job_not_retryable')
      const handler = retryHandlers.get(request.jobId)
      if (!handler) throw new Error('retry_handler_unavailable')
      const resultJobId = await handler()
      opsDb.prepare(`UPDATE ops_job_requests SET status = 'completed', result_job_id = ?, error = NULL, completed_at = ?
        WHERE id = ?`).run(resultJobId || null, Date.now(), id)
      return
    } else {
      throw new Error('unsupported_job_action')
    }
    opsDb.prepare("UPDATE ops_job_requests SET status = 'completed', error = NULL, completed_at = ? WHERE id = ?").run(Date.now(), id)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    opsDb.prepare("UPDATE ops_job_requests SET status = 'failed', error = ?, completed_at = ? WHERE id = ?")
      .run(clean(detail, 300), Date.now(), id)
  }
}

export async function processOpsJobRequests() {
  if (processingRequests) return
  processingRequests = true
  try {
    const rows = opsDb.prepare(`SELECT id FROM ops_job_requests
      WHERE instance_key = ? AND status = 'pending' ORDER BY requested_at ASC LIMIT 20`)
      .all(instanceKey) as Array<{ id?: number }>
    for (const row of rows) if (row.id) await processRequest(Number(row.id))
    prune()
  } finally {
    processingRequests = false
  }
}

const timer = setInterval(() => {
  void processOpsJobRequests()
}, REQUEST_POLL_MS)
timer.unref?.()

export function queueOpsJobAction(input: {
  jobId: string
  action: OpsJobAction
  requestedBy?: string | null
  instanceKey?: string
}) {
  const scopedInstance = input.instanceKey ?? instanceKey
  if (scopedInstance !== instanceKey) throw new Error('job_instance_mismatch')
  const job = opsDb.prepare('SELECT id FROM ops_jobs WHERE id = ? AND instance_key = ?').get(input.jobId, instanceKey)
  if (!job) throw new Error('job_not_found')
  const existing = opsDb.prepare(`SELECT id FROM ops_job_requests
    WHERE instance_key = ? AND job_id = ? AND action = ? AND status IN ('pending','processing') LIMIT 1`)
    .get(instanceKey, input.jobId, input.action)
  if (existing) return false
  opsDb.prepare(`INSERT INTO ops_job_requests(instance_key, job_id, action, requested_by, status, requested_at)
    VALUES(?, ?, ?, ?, 'pending', ?)`).run(instanceKey, input.jobId, input.action, input.requestedBy ?? null, Date.now())
  return true
}
