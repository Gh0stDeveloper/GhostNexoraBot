import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()
const PERMANENT_EXPIRES_AT = Date.UTC(9999, 11, 31, 23, 59, 59)

export type PrivateAccessGrant = {
  userJid: string
  expiresAt: number
  permanent: boolean
}

export function grantPrivateAccess(userJid: string, durationMs: number | null, grantedBy: string): PrivateAccessGrant {
  const existing = economy.hasEntitlement(userJid, 'private_access') ?? 0
  const permanent = durationMs === null
  const expiresAt = permanent ? PERMANENT_EXPIRES_AT : Math.max(now(), existing) + Math.max(60_000, Math.floor(durationMs))
  db.prepare('INSERT INTO entitlements(user_jid, kind, expires_at, metadata, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'private_access', expiresAt, JSON.stringify({ source: 'manual_staff', grantedBy, permanent }), now())
  return { userJid, expiresAt, permanent }
}

export function revokePrivateAccess(userJid: string) {
  // Solo elimina concesiones administrativas. Los planes pagados mediante .buy se conservan.
  const result = db.prepare(`DELETE FROM entitlements
    WHERE user_jid = ? AND kind = 'private_access' AND metadata LIKE '%"source":"manual_staff"%'`).run(userJid)
  return Number(result.changes)
}

export function privateAccessStatus(userJid: string): PrivateAccessGrant | null {
  const row = db.prepare(`SELECT user_jid AS userJid, MAX(expires_at) AS expiresAt
    FROM entitlements WHERE user_jid = ? AND kind = 'private_access' AND expires_at > ? GROUP BY user_jid`)
    .get(userJid, now()) as { userJid: string; expiresAt: number } | undefined
  if (!row) return null
  return { userJid: row.userJid, expiresAt: Number(row.expiresAt), permanent: Number(row.expiresAt) >= PERMANENT_EXPIRES_AT }
}

export function listPrivateAccess(limit = 50): PrivateAccessGrant[] {
  const rows = db.prepare(`SELECT user_jid AS userJid, MAX(expires_at) AS expiresAt
    FROM entitlements WHERE kind = 'private_access' AND expires_at > ?
    GROUP BY user_jid ORDER BY expiresAt DESC LIMIT ?`)
    .all(now(), Math.max(1, Math.min(200, Math.floor(limit)))) as Array<{ userJid: string; expiresAt: number }>
  return rows.map((row) => ({
    userJid: row.userJid,
    expiresAt: Number(row.expiresAt),
    permanent: Number(row.expiresAt) >= PERMANENT_EXPIRES_AT,
  }))
}
