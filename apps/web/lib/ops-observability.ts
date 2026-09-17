import { openBotDb } from './runtime'

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

export type WebOpsRuntimeLog = {
  id: number
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
  createdAt: number
}

function tableExists(db: NonNullable<ReturnType<typeof openBotDb>>, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
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

export function readOpsRuntimeLogs(instanceKey: string, limit = 100): WebOpsRuntimeLog[] {
  const db = openBotDb()
  if (!db) return []
  try {
    if (!tableExists(db, 'ops_runtime_logs')) return []
    return db.prepare(`SELECT id, level, source, message, created_at AS createdAt
      FROM ops_runtime_logs WHERE instance_key = ?
      ORDER BY created_at DESC LIMIT ?`).all(instanceKey, Math.max(1, Math.min(300, limit))).map((row: any) => ({
        id: Number(row.id),
        level: row.level === 'error' ? 'error' : row.level === 'warn' ? 'warn' : row.level === 'debug' ? 'debug' : 'info',
        source: String(row.source),
        message: String(row.message),
        createdAt: Number(row.createdAt ?? 0),
      })) as WebOpsRuntimeLog[]
  } catch {
    return []
  } finally {
    db.close()
  }
}
