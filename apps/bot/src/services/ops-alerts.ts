import { opsDb, opsInstanceKey } from './ops-database.js'
import { recordOpsRuntimeLog } from './ops-runtime-log.js'

export type OpsAlertSeverity = 'info' | 'warning' | 'critical'

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS ops_alerts (
    instance_key TEXT NOT NULL,
    alert_key TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER,
    occurrences INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(instance_key, alert_key)
  );
  CREATE INDEX IF NOT EXISTS idx_ops_alerts_instance_status_updated
    ON ops_alerts(instance_key, status, updated_at DESC);
`)

function safeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'runtime-alert'
}

function compact(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function setOpsAlert(input: {
  key: string
  severity: OpsAlertSeverity
  title: string
  detail?: string | null
  active: boolean
  instanceKey?: string
}) {
  const instanceKey = input.instanceKey ?? opsInstanceKey()
  const key = safeKey(input.key)
  const stamp = Date.now()
  const existing = opsDb.prepare(`SELECT status, severity FROM ops_alerts
    WHERE instance_key = ? AND alert_key = ?`).get(instanceKey, key) as { status?: string; severity?: string } | undefined

  if (input.active) {
    opsDb.prepare(`INSERT INTO ops_alerts(
        instance_key, alert_key, severity, title, detail, status, opened_at, updated_at, resolved_at, occurrences
      ) VALUES(?, ?, ?, ?, ?, 'open', ?, ?, NULL, 1)
      ON CONFLICT(instance_key, alert_key) DO UPDATE SET
        severity = excluded.severity,
        title = excluded.title,
        detail = excluded.detail,
        status = 'open',
        opened_at = CASE WHEN ops_alerts.status = 'resolved' THEN excluded.opened_at ELSE ops_alerts.opened_at END,
        updated_at = excluded.updated_at,
        resolved_at = NULL,
        occurrences = CASE WHEN ops_alerts.status = 'resolved' THEN 1 ELSE ops_alerts.occurrences + 1 END`)
      .run(instanceKey, key, input.severity, compact(input.title, 140), input.detail ? compact(input.detail, 400) : null, stamp, stamp)
    if (!existing || existing.status !== 'open' || existing.severity !== input.severity) {
      recordOpsRuntimeLog(input.severity === 'critical' ? 'error' : 'warn', 'alerts', `${key} opened: ${compact(input.title, 140)}`, instanceKey)
    }
    return
  }

  if (existing?.status === 'open') {
    opsDb.prepare(`UPDATE ops_alerts SET status = 'resolved', resolved_at = ?, updated_at = ?
      WHERE instance_key = ? AND alert_key = ?`).run(stamp, stamp, instanceKey, key)
    recordOpsRuntimeLog('info', 'alerts', `${key} resolved`, instanceKey)
  }
}

export function pruneResolvedAlerts() {
  const cutoff = Date.now() - 30 * 86_400_000
  try { opsDb.prepare("DELETE FROM ops_alerts WHERE status = 'resolved' AND resolved_at < ?").run(cutoff) } catch {}
}
