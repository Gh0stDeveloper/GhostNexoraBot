import { economy } from './economy.js'

const db = economy.db

db.exec(`
  CREATE TABLE IF NOT EXISTS developer_access (
    instance_id INTEGER PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

export function developerInstanceId(instanceId?: number) { return instanceId ?? 0 }

export function isDeveloperAccessEnabled(instanceId?: number) {
  const row = db.prepare('SELECT enabled FROM developer_access WHERE instance_id = ?').get(developerInstanceId(instanceId)) as { enabled?: number } | undefined
  return Boolean(row?.enabled)
}

export function setDeveloperAccess(instanceId: number | undefined, enabled: boolean, updatedBy: string) {
  const id = developerInstanceId(instanceId)
  db.prepare(`INSERT INTO developer_access(instance_id, enabled, updated_by, updated_at) VALUES(?, ?, ?, ?)
    ON CONFLICT(instance_id) DO UPDATE SET enabled=excluded.enabled, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(id, enabled ? 1 : 0, updatedBy, Date.now())
  return enabled
}
