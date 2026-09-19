import { openBotDb } from './runtime'

export type WebOpsJobStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'
export type WebOpsJobType = 'yt-dlp' | 'ffmpeg' | 'download' | 'broadcast' | 'ai' | 'update' | 'other'

export type WebOpsJob = {
  id: string
  type: WebOpsJobType
  label: string
  source: string
  status: WebOpsJobStatus
  progress: number
  detail: string | null
  error: string | null
  cancellable: boolean
  retryable: boolean
  retryOf: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

export type WebOpsJobSnapshot = {
  rows: WebOpsJob[]
  counts: {
    active: number
    waiting: number
    running: number
    completed: number
    failed: number
    cancelled: number
  }
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function status(value: unknown): WebOpsJobStatus {
  return value === 'waiting' || value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled'
    ? value
    : 'failed'
}

function type(value: unknown): WebOpsJobType {
  return value === 'yt-dlp' || value === 'ffmpeg' || value === 'download' || value === 'broadcast'
    || value === 'ai' || value === 'update'
    ? value
    : 'other'
}

function safe(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}\b/gi, '$1 [REDACTED]')
    .replace(/([?&](?:key|token|apikey|api_key|access_token|auth|authorization|secret|password|session|sid|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
}

export function readOpsJobs(instanceKey: string, input: {
  status?: string
  type?: string
  query?: string
  limit?: number
} = {}): WebOpsJobSnapshot {
  const db = openBotDb()
  const empty: WebOpsJobSnapshot = {
    rows: [],
    counts: { active: 0, waiting: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
  }
  if (!db) return empty
  try {
    if (!tableExists(db, 'ops_jobs')) return empty
    const clauses = ['instance_key = ?']
    const params: Array<string | number> = [instanceKey]

    const selectedStatus = String(input.status ?? '').trim().toLowerCase()
    if (['waiting', 'running', 'completed', 'failed', 'cancelled'].includes(selectedStatus)) {
      clauses.push('status = ?')
      params.push(selectedStatus)
    }
    const selectedType = String(input.type ?? '').trim().toLowerCase()
    if (['yt-dlp', 'ffmpeg', 'download', 'broadcast', 'ai', 'update', 'other'].includes(selectedType)) {
      clauses.push('job_type = ?')
      params.push(selectedType)
    }
    const query = String(input.query ?? '').trim().toLowerCase().slice(0, 100)
    if (query) {
      clauses.push('(LOWER(label) LIKE ? OR LOWER(source) LIKE ? OR LOWER(detail) LIKE ?)')
      params.push(`%${query}%`, `%${query}%`, `%${query}%`)
    }

    const rows = db.prepare(`SELECT id, job_type AS jobType, label, source, status, progress, detail, error,
        cancellable, retryable, retry_of AS retryOf, created_at AS createdAt,
        started_at AS startedAt, completed_at AS completedAt, updated_at AS updatedAt
      FROM ops_jobs WHERE ${clauses.join(' AND ')}
      ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, updated_at DESC
      LIMIT ?`).all(...params, Math.max(1, Math.min(300, Math.trunc(input.limit ?? 200)))) as Array<Record<string, unknown>>

    const countRow = db.prepare(`SELECT
        SUM(CASE WHEN status IN ('waiting','running') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM ops_jobs WHERE instance_key = ?`).get(instanceKey) as Record<string, unknown> | undefined

    return {
      rows: rows.map((row) => ({
        id: String(row.id),
        type: type(row.jobType),
        label: safe(row.label, 140) || 'Job',
        source: safe(row.source, 100) || 'runtime',
        status: status(row.status),
        progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
        detail: row.detail ? safe(row.detail, 500) : null,
        error: row.error ? safe(row.error, 700) : null,
        cancellable: Boolean(row.cancellable),
        retryable: Boolean(row.retryable),
        retryOf: row.retryOf ? String(row.retryOf) : null,
        createdAt: Number(row.createdAt ?? 0),
        startedAt: row.startedAt === null || row.startedAt === undefined ? null : Number(row.startedAt),
        completedAt: row.completedAt === null || row.completedAt === undefined ? null : Number(row.completedAt),
        updatedAt: Number(row.updatedAt ?? 0),
      })),
      counts: {
        active: Number(countRow?.active ?? 0),
        waiting: Number(countRow?.waiting ?? 0),
        running: Number(countRow?.running ?? 0),
        completed: Number(countRow?.completed ?? 0),
        failed: Number(countRow?.failed ?? 0),
        cancelled: Number(countRow?.cancelled ?? 0),
      },
    }
  } catch {
    return empty
  } finally {
    db.close()
  }
}
