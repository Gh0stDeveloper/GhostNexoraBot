import { openBotDbWritable } from './runtime'

export type AdminAuditInput = {
  instanceKey: string
  actor: string
  action: string
  target?: string | null
  ok: boolean
  error?: string | null
}

function limited(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

export function auditTarget(action: string, payload: Record<string, unknown>) {
  if (['leave_group', 'mute_group_8h', 'mute_group_7d', 'unmute_group'].includes(action)) {
    return limited(payload.groupJid, 160) || null
  }
  if (['reset_subbot', 'reset_own_subbot'].includes(action)) {
    const id = limited(payload.id, 32)
    return id ? `subbot:${id}` : null
  }
  if (action === 'grant_subbot' || action === 'add_nxc') {
    // Keep only the target supplied to the authenticated admin action; never
    // persist message bodies, tokens, API keys or cookies in this audit table.
    return limited(payload.userJid, 160) || null
  }
  return null
}

export function recordAdminAudit(input: AdminAuditInput) {
  const db = openBotDbWritable()
  if (!db) return false
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ops_admin_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_key TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ops_admin_audit_instance_created
        ON ops_admin_audit(instance_key, created_at DESC);
    `)
    const createdAt = Date.now()
    db.prepare(`INSERT INTO ops_admin_audit(instance_key, actor, action, target, status, error, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)`)
      .run(
        limited(input.instanceKey, 80) || 'main',
        limited(input.actor, 120) || 'unknown',
        limited(input.action, 80) || 'unknown',
        input.target ? limited(input.target, 160) : null,
        input.ok ? 'accepted' : 'failed',
        input.error ? limited(input.error, 240) : null,
        createdAt,
      )
    db.prepare('DELETE FROM ops_admin_audit WHERE created_at < ?').run(createdAt - 90 * 86_400_000)
    return true
  } catch {
    return false
  } finally {
    db.close()
  }
}
