import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { runtime, openBotDb, tokenHash } from './runtime'

export const ADMIN_SESSION_COOKIE = 'ghost_admin_session'
export const SUBBOT_SESSION_COOKIE = 'ghost_subbot_session'

export type AdminSession = { role: 'admin'; exp: number }
export type SubbotSession = { role: 'subbot'; userJid: string; subbotId: number; exp: number }
export type WebSession = AdminSession | SubbotSession

function sessionSecret() {
  if (!runtime.adminToken) throw new Error('ADMIN_WEB_TOKEN no está configurado.')
  return createHash('sha256').update(`ghost-nexora-web-session:${runtime.adminToken}`).digest()
}

function signature(encoded: string) {
  return createHmac('sha256', sessionSecret()).update(encoded).digest('base64url')
}

export function signSession(session: WebSession) {
  const encoded = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifySession(raw: string | undefined | null): WebSession | null {
  if (!raw) return null
  const [encoded, supplied] = raw.split('.')
  if (!encoded || !supplied) return null
  const expected = signature(encoded)
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<WebSession>
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null
    if (parsed.role === 'admin') return { role: 'admin', exp: parsed.exp }
    if (parsed.role === 'subbot' && typeof parsed.userJid === 'string' && typeof parsed.subbotId === 'number') {
      return { role: 'subbot', userJid: parsed.userJid, subbotId: parsed.subbotId, exp: parsed.exp }
    }
    return null
  } catch {
    return null
  }
}

function digest(value: string) { return createHash('sha256').update(value).digest() }

export function verifyAdminToken(input: string) {
  if (!runtime.adminToken || !input) return false
  return timingSafeEqual(digest(input), digest(runtime.adminToken))
}

export function createAdminSession(ttlMs = 12 * 60 * 60_000): AdminSession {
  return { role: 'admin', exp: Date.now() + ttlMs }
}

export function resolveSubbotPortalToken(input: string): SubbotSession | null {
  const token = input.trim()
  if (!token) return null
  const db = openBotDb()
  if (!db) return null
  try {
    const now = Date.now()
    const row = db.prepare(`SELECT p.user_jid AS userJid, p.subbot_id AS subbotId, p.expires_at AS tokenExpiresAt,
      s.expires_at AS subbotExpiresAt
      FROM portal_tokens p
      JOIN subbots s ON s.id = p.subbot_id AND s.owner_jid = p.user_jid
      WHERE p.token_hash = ? AND p.expires_at > ? AND s.expires_at > ? LIMIT 1`)
      .get(tokenHash(token), now, now) as { userJid: string; subbotId: number; tokenExpiresAt: number; subbotExpiresAt: number } | undefined
    if (!row?.subbotId) return null
    return {
      role: 'subbot',
      userJid: row.userJid,
      subbotId: Number(row.subbotId),
      exp: Math.min(Number(row.tokenExpiresAt), Number(row.subbotExpiresAt), now + 7 * 86400_000),
    }
  } finally {
    db.close()
  }
}

export function cookieOptions(exp: number) {
  const maxAge = Math.max(1, Math.floor((exp - Date.now()) / 1000))
  return {
    httpOnly: true,
    secure: runtime.publicWebUrl.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
