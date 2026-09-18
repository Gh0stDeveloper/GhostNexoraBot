import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runtime } from './runtime'

export type PrivilegedWebRole = 'owner' | 'admin' | 'support'
export type WebRole = PrivilegedWebRole | 'subbot'

export type WebPermission =
  | 'dashboard:view'
  | 'groups:view'
  | 'groups:sync'
  | 'groups:manage'
  | 'groups:leave'
  | 'audit:view'
  | 'audit:reset'
  | 'management:economy'
  | 'management:subbots'
  | 'management:broadcast'
  | 'backups:read'
  | 'backups:write'
  | 'security:manage'
  | 'sessions:manage'

const permissions: Record<WebRole, ReadonlySet<WebPermission>> = {
  owner: new Set<WebPermission>([
    'dashboard:view', 'groups:view', 'groups:sync', 'groups:manage', 'groups:leave',
    'audit:view', 'audit:reset', 'management:economy', 'management:subbots',
    'management:broadcast', 'backups:read', 'backups:write', 'security:manage',
    'sessions:manage',
  ]),
  admin: new Set<WebPermission>([
    'dashboard:view', 'groups:view', 'groups:sync', 'groups:manage',
    'audit:view', 'audit:reset',
  ]),
  support: new Set<WebPermission>([
    'dashboard:view', 'groups:view', 'groups:sync', 'audit:view',
  ]),
  subbot: new Set<WebPermission>([
    'dashboard:view', 'groups:view', 'groups:sync', 'groups:manage', 'groups:leave',
    'audit:view', 'audit:reset', 'sessions:manage',
  ]),
}

export function hasPermission(role: WebRole, permission: WebPermission) {
  return permissions[role].has(permission)
}

export function isPrivilegedRole(role: unknown): role is PrivilegedWebRole {
  return role === 'owner' || role === 'admin' || role === 'support'
}

export type StaffAccount = {
  id: string
  label: string
  role: 'admin' | 'support'
  active: boolean
  createdAt: number
  revokedAt: number | null
}

export type StoredWebSession = {
  id: string
  role: WebRole
  accountId: string | null
  subbotId: number | null
  userJid: string | null
  createdAt: number
  lastSeen: number
  authAt: number
  expiresAt: number
  revokedAt: number | null
}

export type PasskeyRecord = {
  credentialId: string
  subject: string
  role: WebRole
  accountId: string | null
  subbotId: number | null
  userJid: string | null
  publicKey: Uint8Array
  webauthnUserId: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports: string[]
  label: string
  createdAt: number
  lastUsedAt: number
}

const SECURITY_DB_FILE = 'web-security.sqlite'
const SESSION_MAX_IDLE_MS = 12 * 60 * 60_000
const SESSION_TOUCH_INTERVAL_MS = 60_000
export const CRITICAL_REAUTH_MAX_AGE_MS = 10 * 60_000

function securityDb() {
  mkdirSync(runtime.dataDir, { recursive: true })
  const db = new DatabaseSync(path.join(runtime.dataDir, SECURITY_DB_FILE))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_staff_accounts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','support')),
      token_hash TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','support','subbot')),
      account_id TEXT,
      subbot_id INTEGER,
      user_jid TEXT,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      auth_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ip_hash TEXT,
      user_agent_hash TEXT,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_web_sessions_role_exp
      ON web_sessions(role, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_web_sessions_account
      ON web_sessions(account_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_web_sessions_subbot
      ON web_sessions(subbot_id, expires_at DESC);

    CREATE TABLE IF NOT EXISTS web_passkeys (
      credential_id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','admin','support','subbot')),
      account_id TEXT,
      subbot_id INTEGER,
      user_jid TEXT,
      public_key BLOB NOT NULL,
      webauthn_user_id TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT NOT NULL DEFAULT 'singleDevice',
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      label TEXT NOT NULL DEFAULT 'Passkey',
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_web_passkeys_subject
      ON web_passkeys(subject, created_at DESC);

    CREATE TABLE IF NOT EXISTS web_auth_challenges (
      id TEXT PRIMARY KEY,
      purpose TEXT NOT NULL,
      subject TEXT,
      challenge TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_web_auth_challenges_exp
      ON web_auth_challenges(expires_at);

    CREATE TABLE IF NOT EXISTS web_login_attempts (
      bucket_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
  `)
  return db
}

function digestHex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function secret() {
  return runtime.adminToken || 'ghost-nexora-web-security'
}

function hmacHex(value: string) {
  return createHmac('sha256', secret()).update(value).digest('hex')
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function normalizeRole(value: unknown): WebRole | null {
  return value === 'owner' || value === 'admin' || value === 'support' || value === 'subbot'
    ? value
    : null
}

function requestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function userAgentHash(request: Request) {
  return hmacHex(`ua:${request.headers.get('user-agent') ?? 'unknown'}`)
}

export function requestIdentityHash(request: Request) {
  return hmacHex(`ip:${requestIp(request)}`)
}

function originCandidates(request: Request) {
  const allowed = new Set<string>()
  try { allowed.add(new URL(request.url).origin) } catch {}
  try { allowed.add(new URL(runtime.publicWebUrl).origin) } catch {}

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwardedHost) {
    const proto = forwardedProto || (runtime.publicWebUrl.startsWith('https://') ? 'https' : 'http')
    try { allowed.add(new URL(`${proto}://${forwardedHost}`).origin) } catch {}
  }
  return allowed
}

export function isSameOriginRequest(request: Request) {
  const allowed = originCandidates(request)
  const origin = request.headers.get('origin')
  if (origin) {
    try { return allowed.has(new URL(origin).origin) } catch { return false }
  }
  const referer = request.headers.get('referer')
  if (referer) {
    try { return allowed.has(new URL(referer).origin) } catch { return false }
  }
  return false
}

export function requireSameOrigin(request: Request) {
  if (!isSameOriginRequest(request)) throw new Error('invalid_origin')
}

export function csrfTokenForSession(sessionId: string, role: WebRole) {
  return hmacHex(`csrf:${sessionId}:${role}`)
}

export function verifyCsrfToken(sessionId: string, role: WebRole, supplied: string | null | undefined) {
  if (!supplied) return false
  return safeEqual(csrfTokenForSession(sessionId, role), supplied)
}

export function requireMutationSecurity(
  request: Request,
  session: { sid: string; role: WebRole },
  suppliedToken: string | null | undefined,
) {
  requireSameOrigin(request)
  if (!verifyCsrfToken(session.sid, session.role, suppliedToken)) throw new Error('invalid_csrf')
}

export function staffTokenHash(token: string) {
  return digestHex(`staff:${token.trim()}`)
}

export function listStaffAccounts(): StaffAccount[] {
  const db = securityDb()
  try {
    return (db.prepare(`SELECT id, label, role, active, created_at AS createdAt, revoked_at AS revokedAt
      FROM web_staff_accounts ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      role: row.role === 'support' ? 'support' : 'admin',
      active: Boolean(row.active),
      createdAt: Number(row.createdAt),
      revokedAt: row.revokedAt === null || row.revokedAt === undefined ? null : Number(row.revokedAt),
    }))
  } finally {
    db.close()
  }
}

export function createStaffAccount(label: string, role: 'admin' | 'support') {
  const cleanLabel = label.trim().slice(0, 60)
  if (cleanLabel.length < 2) throw new Error('invalid_label')
  const id = randomBytes(12).toString('base64url')
  const token = `gns_${randomBytes(32).toString('base64url')}`
  const now = Date.now()
  const db = securityDb()
  try {
    db.prepare(`INSERT INTO web_staff_accounts(id, label, role, token_hash, active, created_at)
      VALUES(?, ?, ?, ?, 1, ?)`).run(id, cleanLabel, role, staffTokenHash(token), now)
  } finally {
    db.close()
  }
  return { id, label: cleanLabel, role, token, createdAt: now }
}

export function resolveStaffToken(token: string): StaffAccount | null {
  const hash = staffTokenHash(token)
  const db = securityDb()
  try {
    const row = db.prepare(`SELECT id, label, role, active, created_at AS createdAt, revoked_at AS revokedAt
      FROM web_staff_accounts WHERE token_hash = ? AND active = 1 LIMIT 1`).get(hash) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: String(row.id),
      label: String(row.label),
      role: row.role === 'support' ? 'support' : 'admin',
      active: Boolean(row.active),
      createdAt: Number(row.createdAt),
      revokedAt: row.revokedAt === null || row.revokedAt === undefined ? null : Number(row.revokedAt),
    }
  } finally {
    db.close()
  }
}

export function revokeStaffAccount(id: string) {
  const now = Date.now()
  const db = securityDb()
  try {
    const result = db.prepare(`UPDATE web_staff_accounts SET active = 0, revoked_at = ?
      WHERE id = ? AND active = 1`).run(now, id)
    db.prepare(`UPDATE web_sessions SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND revoked_at IS NULL`).run(now, id)
    return Number(result.changes) > 0
  } finally {
    db.close()
  }
}

export type WebPrincipal =
  | { role: PrivilegedWebRole; accountId?: string | null }
  | { role: 'subbot'; subbotId: number; userJid: string }

export function createStoredSession(principal: WebPrincipal, request: Request, ttlMs?: number) {
  const now = Date.now()
  const ttl = Math.max(60_000, Math.min(ttlMs ?? SESSION_MAX_IDLE_MS, principal.role === 'subbot' ? 7 * 86_400_000 : SESSION_MAX_IDLE_MS))
  const id = randomBytes(24).toString('base64url')
  const expiresAt = now + ttl
  const accountId = principal.role === 'owner'
    ? 'owner'
    : principal.role === 'admin' || principal.role === 'support'
      ? principal.accountId ?? null
      : null
  const subbotId = principal.role === 'subbot' ? principal.subbotId : null
  const userJid = principal.role === 'subbot' ? principal.userJid : null

  const db = securityDb()
  try {
    db.prepare(`INSERT INTO web_sessions(
      id, role, account_id, subbot_id, user_jid, created_at, last_seen, auth_at,
      expires_at, ip_hash, user_agent_hash
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      principal.role,
      accountId,
      subbotId,
      userJid,
      now,
      now,
      now,
      expiresAt,
      requestIdentityHash(request),
      userAgentHash(request),
    )
  } finally {
    db.close()
  }

  return {
    sid: id,
    role: principal.role,
    accountId,
    subbotId,
    userJid,
    exp: expiresAt,
    authAt: now,
  }
}

export function validateStoredSession(input: {
  sid: string
  role: WebRole
  exp: number
  accountId?: string | null
  subbotId?: number | null
  userJid?: string | null
}): StoredWebSession | null {
  if (!input.sid || input.exp <= Date.now()) return null
  const db = securityDb()
  try {
    const row = db.prepare(`SELECT id, role, account_id AS accountId, subbot_id AS subbotId,
      user_jid AS userJid, created_at AS createdAt, last_seen AS lastSeen,
      auth_at AS authAt, expires_at AS expiresAt, revoked_at AS revokedAt
      FROM web_sessions WHERE id = ? LIMIT 1`).get(input.sid) as Record<string, unknown> | undefined

    const role = normalizeRole(row?.role)
    if (!row || !role || role !== input.role) return null
    const expiresAt = Number(row.expiresAt)
    if (expiresAt <= Date.now() || row.revokedAt !== null && row.revokedAt !== undefined) return null

    const accountId = row.accountId === null || row.accountId === undefined ? null : String(row.accountId)
    const subbotId = row.subbotId === null || row.subbotId === undefined ? null : Number(row.subbotId)
    const userJid = row.userJid === null || row.userJid === undefined ? null : String(row.userJid)

    if ((input.accountId ?? null) !== accountId) return null
    if ((input.subbotId ?? null) !== subbotId) return null
    if ((input.userJid ?? null) !== userJid) return null

    if (role === 'admin' || role === 'support') {
      const staff = db.prepare('SELECT active FROM web_staff_accounts WHERE id = ? LIMIT 1').get(accountId) as { active?: number } | undefined
      if (!staff?.active) return null
    }

    const lastSeen = Number(row.lastSeen)
    if (Date.now() - lastSeen >= SESSION_TOUCH_INTERVAL_MS) {
      db.prepare('UPDATE web_sessions SET last_seen = ? WHERE id = ?').run(Date.now(), input.sid)
    }

    return {
      id: String(row.id),
      role,
      accountId,
      subbotId,
      userJid,
      createdAt: Number(row.createdAt),
      lastSeen,
      authAt: Number(row.authAt),
      expiresAt,
      revokedAt: null,
    }
  } finally {
    db.close()
  }
}

export function listSessionsForPrincipal(principal: WebPrincipal): StoredWebSession[] {
  const db = securityDb()
  try {
    let rows: Array<Record<string, unknown>>
    if (principal.role === 'owner') {
      rows = db.prepare(`SELECT id, role, account_id AS accountId, subbot_id AS subbotId, user_jid AS userJid,
        created_at AS createdAt, last_seen AS lastSeen, auth_at AS authAt, expires_at AS expiresAt, revoked_at AS revokedAt
        FROM web_sessions WHERE role = 'owner' ORDER BY last_seen DESC`).all() as Array<Record<string, unknown>>
    } else if (principal.role === 'admin' || principal.role === 'support') {
      rows = db.prepare(`SELECT id, role, account_id AS accountId, subbot_id AS subbotId, user_jid AS userJid,
        created_at AS createdAt, last_seen AS lastSeen, auth_at AS authAt, expires_at AS expiresAt, revoked_at AS revokedAt
        FROM web_sessions WHERE account_id = ? ORDER BY last_seen DESC`).all(principal.accountId ?? '') as Array<Record<string, unknown>>
    } else {
      rows = db.prepare(`SELECT id, role, account_id AS accountId, subbot_id AS subbotId, user_jid AS userJid,
        created_at AS createdAt, last_seen AS lastSeen, auth_at AS authAt, expires_at AS expiresAt, revoked_at AS revokedAt
        FROM web_sessions WHERE role = 'subbot' AND subbot_id = ? AND user_jid = ? ORDER BY last_seen DESC`)
        .all(principal.subbotId, principal.userJid) as Array<Record<string, unknown>>
    }
    return rows.map((row) => ({
      id: String(row.id),
      role: normalizeRole(row.role) ?? principal.role,
      accountId: row.accountId === null || row.accountId === undefined ? null : String(row.accountId),
      subbotId: row.subbotId === null || row.subbotId === undefined ? null : Number(row.subbotId),
      userJid: row.userJid === null || row.userJid === undefined ? null : String(row.userJid),
      createdAt: Number(row.createdAt),
      lastSeen: Number(row.lastSeen),
      authAt: Number(row.authAt),
      expiresAt: Number(row.expiresAt),
      revokedAt: row.revokedAt === null || row.revokedAt === undefined ? null : Number(row.revokedAt),
    }))
  } finally {
    db.close()
  }
}


export function listPrivilegedSessionsForOwner(): StoredWebSession[] {
  const db = securityDb()
  try {
    const rows = db.prepare(`SELECT id, role, account_id AS accountId, subbot_id AS subbotId, user_jid AS userJid,
      created_at AS createdAt, last_seen AS lastSeen, auth_at AS authAt, expires_at AS expiresAt, revoked_at AS revokedAt
      FROM web_sessions WHERE role IN ('owner','admin','support') ORDER BY last_seen DESC LIMIT 200`)
      .all() as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id),
      role: normalizeRole(row.role) ?? 'support',
      accountId: row.accountId === null || row.accountId === undefined ? null : String(row.accountId),
      subbotId: null,
      userJid: null,
      createdAt: Number(row.createdAt),
      lastSeen: Number(row.lastSeen),
      authAt: Number(row.authAt),
      expiresAt: Number(row.expiresAt),
      revokedAt: row.revokedAt === null || row.revokedAt === undefined ? null : Number(row.revokedAt),
    }))
  } finally {
    db.close()
  }
}

export function sessionBelongsToPrincipal(sessionId: string, principal: WebPrincipal) {
  if (principal.role === 'owner') {
    const db = securityDb()
    try {
      const row = db.prepare("SELECT role FROM web_sessions WHERE id = ? LIMIT 1").get(sessionId) as { role?: string } | undefined
      return row?.role === 'owner' || row?.role === 'admin' || row?.role === 'support'
    } finally {
      db.close()
    }
  }
  return listSessionsForPrincipal(principal).some((session) => session.id === sessionId)
}

export function revokeSession(sessionId: string) {
  const db = securityDb()
  try {
    return Number(db.prepare('UPDATE web_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND revoked_at IS NULL')
      .run(Date.now(), sessionId).changes) > 0
  } finally {
    db.close()
  }
}

export function revokeOtherSessions(currentSessionId: string, principal: WebPrincipal) {
  const db = securityDb()
  try {
    const now = Date.now()
    if (principal.role === 'owner') {
      return Number(db.prepare(`UPDATE web_sessions SET revoked_at = ? WHERE role = 'owner' AND id <> ? AND revoked_at IS NULL`)
        .run(now, currentSessionId).changes)
    }
    if (principal.role === 'admin' || principal.role === 'support') {
      return Number(db.prepare(`UPDATE web_sessions SET revoked_at = ? WHERE account_id = ? AND id <> ? AND revoked_at IS NULL`)
        .run(now, principal.accountId ?? '', currentSessionId).changes)
    }
    return Number(db.prepare(`UPDATE web_sessions SET revoked_at = ? WHERE role = 'subbot' AND subbot_id = ? AND user_jid = ? AND id <> ? AND revoked_at IS NULL`)
      .run(now, principal.subbotId, principal.userJid, currentSessionId).changes)
  } finally {
    db.close()
  }
}

export function sessionIsFreshForCriticalAction(authAt: number) {
  return Date.now() - authAt <= CRITICAL_REAUTH_MAX_AGE_MS
}

function rateBucketKey(request: Request, window: 'minute' | 'hour') {
  const now = Date.now()
  const span = window === 'minute' ? 60_000 : 3_600_000
  const bucket = Math.floor(now / span)
  return {
    key: `${requestIdentityHash(request)}:${window}:${bucket}`,
    resetAt: (bucket + 1) * span,
  }
}

export function loginRateLimited(request: Request) {
  const db = securityDb()
  try {
    const minute = rateBucketKey(request, 'minute')
    const hour = rateBucketKey(request, 'hour')
    const minuteRow = db.prepare('SELECT attempts FROM web_login_attempts WHERE bucket_key = ? AND reset_at > ?')
      .get(minute.key, Date.now()) as { attempts?: number } | undefined
    const hourRow = db.prepare('SELECT attempts FROM web_login_attempts WHERE bucket_key = ? AND reset_at > ?')
      .get(hour.key, Date.now()) as { attempts?: number } | undefined
    return Number(minuteRow?.attempts ?? 0) >= 5 || Number(hourRow?.attempts ?? 0) >= 20
  } finally {
    db.close()
  }
}

export function recordLoginFailure(request: Request) {
  const db = securityDb()
  try {
    const now = Date.now()
    db.prepare('DELETE FROM web_login_attempts WHERE reset_at <= ?').run(now)
    for (const window of ['minute', 'hour'] as const) {
      const bucket = rateBucketKey(request, window)
      db.prepare(`INSERT INTO web_login_attempts(bucket_key, attempts, reset_at) VALUES(?, 1, ?)
        ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1, reset_at = excluded.reset_at`)
        .run(bucket.key, bucket.resetAt)
    }
  } finally {
    db.close()
  }
}

export function clearLoginFailures(request: Request) {
  const identity = requestIdentityHash(request)
  const db = securityDb()
  try {
    db.prepare('DELETE FROM web_login_attempts WHERE bucket_key LIKE ?').run(`${identity}:%`)
  } finally {
    db.close()
  }
}

export function subjectForPrincipal(principal: WebPrincipal) {
  if (principal.role === 'owner') return 'owner'
  if (principal.role === 'admin' || principal.role === 'support') return `staff:${principal.accountId ?? 'unknown'}`
  return `subbot:${principal.subbotId}:${digestHex(principal.userJid).slice(0, 24)}`
}

export function principalFromStoredSession(session: {
  role: WebRole
  accountId?: string | null
  subbotId?: number | null
  userJid?: string | null
}): WebPrincipal {
  if (session.role === 'owner') return { role: 'owner' }
  if (session.role === 'admin' || session.role === 'support') {
    return { role: session.role, accountId: session.accountId ?? null }
  }
  if (typeof session.subbotId !== 'number' || !session.userJid) throw new Error('invalid_subbot_session')
  return { role: 'subbot', subbotId: session.subbotId, userJid: session.userJid }
}

export function storeChallenge(purpose: 'register' | 'authenticate', challenge: string, subject?: string | null) {
  const id = randomBytes(24).toString('base64url')
  const now = Date.now()
  const db = securityDb()
  try {
    db.prepare('DELETE FROM web_auth_challenges WHERE expires_at <= ?').run(now)
    db.prepare(`INSERT INTO web_auth_challenges(id, purpose, subject, challenge, created_at, expires_at)
      VALUES(?, ?, ?, ?, ?, ?)`).run(id, purpose, subject ?? null, challenge, now, now + 5 * 60_000)
  } finally {
    db.close()
  }
  return id
}

export function consumeChallenge(id: string, purpose: 'register' | 'authenticate') {
  const db = securityDb()
  try {
    const row = db.prepare(`SELECT subject, challenge, expires_at AS expiresAt FROM web_auth_challenges
      WHERE id = ? AND purpose = ? LIMIT 1`).get(id, purpose) as { subject?: string | null; challenge?: string; expiresAt?: number } | undefined
    db.prepare('DELETE FROM web_auth_challenges WHERE id = ?').run(id)
    if (!row?.challenge || Number(row.expiresAt ?? 0) <= Date.now()) return null
    return {
      subject: row.subject ?? null,
      challenge: String(row.challenge),
    }
  } finally {
    db.close()
  }
}

export function listPasskeys(subject: string) {
  const db = securityDb()
  try {
    return (db.prepare(`SELECT credential_id AS credentialId, label, device_type AS deviceType,
      backed_up AS backedUp, transports, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM web_passkeys WHERE subject = ? ORDER BY created_at DESC`).all(subject) as Array<Record<string, unknown>>).map((row) => ({
      credentialId: String(row.credentialId),
      label: String(row.label),
      deviceType: String(row.deviceType),
      backedUp: Boolean(row.backedUp),
      transports: JSON.parse(String(row.transports || '[]')) as string[],
      createdAt: Number(row.createdAt),
      lastUsedAt: Number(row.lastUsedAt),
    }))
  } finally {
    db.close()
  }
}

export function findPasskey(credentialId: string): PasskeyRecord | null {
  const db = securityDb()
  try {
    const row = db.prepare(`SELECT credential_id AS credentialId, subject, role, account_id AS accountId,
      subbot_id AS subbotId, user_jid AS userJid, public_key AS publicKey,
      webauthn_user_id AS webauthnUserId, counter, device_type AS deviceType,
      backed_up AS backedUp, transports, label, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM web_passkeys WHERE credential_id = ? LIMIT 1`).get(credentialId) as Record<string, unknown> | undefined
    const role = normalizeRole(row?.role)
    if (!row || !role) return null
    const rawKey = row.publicKey
    const publicKey = rawKey instanceof Uint8Array
      ? new Uint8Array(rawKey)
      : rawKey instanceof ArrayBuffer
        ? new Uint8Array(rawKey)
        : new Uint8Array(Buffer.from(rawKey as Buffer))
    return {
      credentialId: String(row.credentialId),
      subject: String(row.subject),
      role,
      accountId: row.accountId === null || row.accountId === undefined ? null : String(row.accountId),
      subbotId: row.subbotId === null || row.subbotId === undefined ? null : Number(row.subbotId),
      userJid: row.userJid === null || row.userJid === undefined ? null : String(row.userJid),
      publicKey,
      webauthnUserId: String(row.webauthnUserId),
      counter: Number(row.counter),
      deviceType: String(row.deviceType),
      backedUp: Boolean(row.backedUp),
      transports: JSON.parse(String(row.transports || '[]')) as string[],
      label: String(row.label),
      createdAt: Number(row.createdAt),
      lastUsedAt: Number(row.lastUsedAt),
    }
  } finally {
    db.close()
  }
}

export function savePasskey(input: {
  credentialId: string
  principal: WebPrincipal
  publicKey: Uint8Array
  webauthnUserId: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string[]
  label?: string
}) {
  const subject = subjectForPrincipal(input.principal)
  const now = Date.now()
  const role = input.principal.role
  const accountId = role === 'owner'
    ? 'owner'
    : role === 'admin' || role === 'support'
      ? input.principal.accountId ?? null
      : null
  const subbotId = role === 'subbot' ? input.principal.subbotId : null
  const userJid = role === 'subbot' ? input.principal.userJid : null
  const label = (input.label?.trim() || 'Dispositivo').slice(0, 60)

  const db = securityDb()
  try {
    db.prepare(`INSERT INTO web_passkeys(
      credential_id, subject, role, account_id, subbot_id, user_jid, public_key,
      webauthn_user_id, counter, device_type, backed_up, transports, label, created_at, last_used_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.credentialId,
      subject,
      role,
      accountId,
      subbotId,
      userJid,
      Buffer.from(input.publicKey),
      input.webauthnUserId,
      input.counter,
      input.deviceType,
      input.backedUp ? 1 : 0,
      JSON.stringify(input.transports ?? []),
      label,
      now,
      now,
    )
  } finally {
    db.close()
  }
}

export function updatePasskeyCounter(credentialId: string, counter: number) {
  const db = securityDb()
  try {
    db.prepare('UPDATE web_passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ?')
      .run(counter, Date.now(), credentialId)
  } finally {
    db.close()
  }
}

export function deletePasskey(subject: string, credentialId: string) {
  const db = securityDb()
  try {
    return Number(db.prepare('DELETE FROM web_passkeys WHERE subject = ? AND credential_id = ?')
      .run(subject, credentialId).changes) > 0
  } finally {
    db.close()
  }
}

export function principalForPasskey(record: PasskeyRecord): WebPrincipal | null {
  if (record.role === 'owner') return { role: 'owner' }
  if (record.role === 'admin' || record.role === 'support') {
    if (!record.accountId) return null
    const db = securityDb()
    try {
      const row = db.prepare('SELECT active, role FROM web_staff_accounts WHERE id = ? LIMIT 1')
        .get(record.accountId) as { active?: number; role?: string } | undefined
      if (!row?.active || row.role !== record.role) return null
    } finally {
      db.close()
    }
    return { role: record.role, accountId: record.accountId }
  }
  if (record.subbotId === null || !record.userJid) return null
  return { role: 'subbot', subbotId: record.subbotId, userJid: record.userJid }
}

export function roleLabel(role: WebRole) {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  if (role === 'support') return 'Support'
  return 'Subbot Owner'
}


export function webauthnContext(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const referer = request.headers.get('referer')
  const originHeader = request.headers.get('origin')

  const candidates: string[] = []
  if (originHeader) candidates.push(originHeader)
  if (referer) {
    try { candidates.push(new URL(referer).origin) } catch {}
  }
  if (forwardedHost) candidates.push(`${forwardedProto || 'https'}://${forwardedHost}`)
  candidates.push(runtime.publicWebUrl)
  try { candidates.push(new URL(request.url).origin) } catch {}

  for (const value of candidates) {
    try {
      const url = new URL(value)
      const secure = url.protocol === 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      if (!secure) continue
      return { origin: url.origin, rpID: url.hostname }
    } catch {}
  }
  throw new Error('webauthn_secure_context_required')
}
