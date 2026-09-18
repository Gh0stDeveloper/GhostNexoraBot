import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { runtime, openBotDb, tokenHash } from './runtime'
import {
  createStoredSession,
  csrfTokenForSession,
  isPrivilegedRole,
  principalFromStoredSession,
  type PrivilegedWebRole,
  type WebPrincipal,
  type WebRole,
  validateStoredSession,
} from './web-security'

export const ADMIN_SESSION_COOKIE = 'ghost_admin_session'
export const SUBBOT_SESSION_COOKIE = 'ghost_subbot_session'
export const PREAUTH_COOKIE = 'ghost_web_preauth'

type SessionBase = {
  sid: string
  exp: number
  authAt: number
  mfaPending: boolean
}

export type OwnerSession = SessionBase & {
  role: 'owner'
  accountId: 'owner'
}

export type StaffSession = SessionBase & {
  role: 'admin' | 'support'
  accountId: string
}

export type SubbotSession = SessionBase & {
  role: 'subbot'
  userJid: string
  subbotId: number
}

export type PrivilegedSession = OwnerSession | StaffSession
export type WebSession = PrivilegedSession | SubbotSession

function sessionSecret() {
  if (!runtime.adminToken) throw new Error('ADMIN_WEB_TOKEN no está configurado.')
  return createHash('sha256').update(`ghost-nexora-web-session:${runtime.adminToken}`).digest()
}

function signature(encoded: string) {
  return createHmac('sha256', sessionSecret()).update(encoded).digest('base64url')
}


export type PreauthSession = {
  role: PrivilegedWebRole
  accountId: string
  exp: number
}

export function signPreauth(input: PreauthSession) {
  const encoded = Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
  const mac = createHmac('sha256', sessionSecret()).update(`preauth:${encoded}`).digest('base64url')
  return `${encoded}.${mac}`
}

export function verifyPreauth(raw: string | undefined | null): PreauthSession | null {
  if (!raw) return null
  const [encoded, supplied] = raw.split('.')
  if (!encoded || !supplied) return null
  const expected = createHmac('sha256', sessionSecret()).update(`preauth:${encoded}`).digest('base64url')
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<PreauthSession>
    if (!isPrivilegedRole(parsed.role) || typeof parsed.accountId !== 'string' || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null
    return { role: parsed.role, accountId: parsed.accountId, exp: parsed.exp }
  } catch {
    return null
  }
}

export function createPreauth(role: PrivilegedWebRole, accountId: string, ttlMs = 5 * 60_000): PreauthSession {
  return { role, accountId, exp: Date.now() + Math.max(60_000, Math.min(ttlMs, 10 * 60_000)) }
}

export function preauthCookieOptions(exp: number) {
  const maxAge = Math.max(1, Math.floor((exp - Date.now()) / 1000))
  return {
    httpOnly: true,
    secure: runtime.publicWebUrl.startsWith('https://'),
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}

export function signSession(session: WebSession) {
  const encoded = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

function parseSignedSession(raw: string | undefined | null): Partial<WebSession> | null {
  if (!raw) return null
  const [encoded, supplied] = raw.split('.')
  if (!encoded || !supplied) return null
  const expected = signature(encoded)
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<WebSession>
  } catch {
    return null
  }
}

export function verifySession(raw: string | undefined | null): WebSession | null {
  const parsed = parseSignedSession(raw)
  if (!parsed?.sid || typeof parsed.exp !== 'number' || typeof parsed.authAt !== 'number') return null
  const role = parsed.role as WebRole | undefined
  if (!role || !['owner', 'admin', 'support', 'subbot'].includes(role)) return null

  const accountId = 'accountId' in parsed && typeof parsed.accountId === 'string' ? parsed.accountId : null
  const subbotId = 'subbotId' in parsed && typeof parsed.subbotId === 'number' ? parsed.subbotId : null
  const userJid = 'userJid' in parsed && typeof parsed.userJid === 'string' ? parsed.userJid : null

  const stored = validateStoredSession({
    sid: parsed.sid,
    role,
    exp: parsed.exp,
    accountId,
    subbotId,
    userJid,
  })
  if (!stored) return null

  if (role === 'owner') {
    if (accountId !== 'owner') return null
    return { role: 'owner', sid: parsed.sid, accountId: 'owner', exp: stored.expiresAt, authAt: stored.authAt, mfaPending: stored.mfaPending }
  }

  if (role === 'admin' || role === 'support') {
    if (!accountId) return null
    return { role, sid: parsed.sid, accountId, exp: stored.expiresAt, authAt: stored.authAt, mfaPending: stored.mfaPending }
  }

  if (subbotId === null || !userJid) return null
  return { role: 'subbot', sid: parsed.sid, subbotId, userJid, exp: stored.expiresAt, authAt: stored.authAt, mfaPending: false }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export function verifyAdminToken(input: string) {
  if (!runtime.adminToken || !input) return false
  const left = digest(input)
  const right = digest(runtime.adminToken)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createOwnerSession(request: Request, ttlMs?: number, mfaPending = false): OwnerSession {
  const stored = createStoredSession({ role: 'owner' }, request, ttlMs, mfaPending)
  return {
    role: 'owner',
    sid: stored.sid,
    accountId: 'owner',
    exp: stored.exp,
    authAt: stored.authAt,
    mfaPending: stored.mfaPending,
  }
}

export function createStaffSession(
  role: 'admin' | 'support',
  accountId: string,
  request: Request,
  ttlMs?: number,
  mfaPending = false,
): StaffSession {
  const stored = createStoredSession({ role, accountId }, request, ttlMs, mfaPending)
  return {
    role,
    sid: stored.sid,
    accountId,
    exp: stored.exp,
    authAt: stored.authAt,
    mfaPending: stored.mfaPending,
  }
}

export type SubbotPortalAccess = {
  userJid: string
  subbotId: number
  exp: number
}

export function resolveSubbotPortalToken(input: string): SubbotPortalAccess | null {
  const token = input.trim()
  if (!token) return null
  const db = openBotDb()
  if (!db) return null
  try {
    const now = Date.now()
    const row = db.prepare(`SELECT COALESCE(s.owner_jid, p.user_jid) AS userJid,
      p.subbot_id AS subbotId, p.expires_at AS tokenExpiresAt,
      s.expires_at AS subbotExpiresAt
      FROM portal_tokens p
      JOIN subbots s ON s.id = p.subbot_id
      WHERE p.token_hash = ? AND p.expires_at > ? AND s.expires_at > ? LIMIT 1`)
      .get(tokenHash(token), now, now) as { userJid: string; subbotId: number; tokenExpiresAt: number; subbotExpiresAt: number } | undefined
    if (!row?.subbotId) return null
    return {
      userJid: row.userJid,
      subbotId: Number(row.subbotId),
      exp: Math.min(Number(row.tokenExpiresAt), Number(row.subbotExpiresAt), now + 7 * 86400_000),
    }
  } finally {
    db.close()
  }
}

export function resolveSubbotPasskeyAccess(subbotId: number, userJid: string): SubbotPortalAccess | null {
  const db = openBotDb()
  if (!db) return null
  try {
    const now = Date.now()
    const row = db.prepare(`SELECT id, COALESCE(owner_jid, ?) AS userJid, expires_at AS expiresAt
      FROM subbots WHERE id = ? AND expires_at > ? LIMIT 1`)
      .get(userJid, subbotId, now) as { id?: number; userJid?: string; expiresAt?: number } | undefined
    if (!row?.id || !row.userJid || Number(row.expiresAt ?? 0) <= now) return null
    return {
      userJid: String(row.userJid),
      subbotId: Number(row.id),
      exp: Math.min(Number(row.expiresAt), now + 7 * 86400_000),
    }
  } finally {
    db.close()
  }
}

export function createSubbotSession(access: SubbotPortalAccess, request: Request): SubbotSession {
  const ttlMs = Math.max(60_000, access.exp - Date.now())
  const stored = createStoredSession({
    role: 'subbot',
    subbotId: access.subbotId,
    userJid: access.userJid,
  }, request, ttlMs)
  return {
    role: 'subbot',
    sid: stored.sid,
    userJid: access.userJid,
    subbotId: access.subbotId,
    exp: Math.min(stored.exp, access.exp),
    authAt: stored.authAt,
    mfaPending: false,
  }
}

export function sessionPrincipal(session: WebSession): WebPrincipal {
  return principalFromStoredSession({
    role: session.role,
    accountId: 'accountId' in session ? session.accountId : null,
    subbotId: 'subbotId' in session ? session.subbotId : null,
    userJid: 'userJid' in session ? session.userJid : null,
  })
}

export function isPrivilegedSession(session: WebSession | null): session is PrivilegedSession {
  return Boolean(session && isPrivilegedRole(session.role))
}

export function sessionCsrfToken(session: WebSession) {
  return csrfTokenForSession(session.sid, session.role)
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

export function sessionCookieForRole(role: WebRole) {
  return role === 'subbot' ? SUBBOT_SESSION_COOKIE : ADMIN_SESSION_COOKIE
}

export function roleIsPrivileged(role: WebRole): role is PrivilegedWebRole {
  return isPrivilegedRole(role)
}
