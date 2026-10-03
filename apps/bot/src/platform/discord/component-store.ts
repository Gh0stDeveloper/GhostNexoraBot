import { opsDb } from '../../services/ops-database.js'

const DEFAULT_TTL_MS = 30 * 60_000
const RETENTION_GRACE_MS = 5 * 60_000

opsDb.exec(`
  CREATE TABLE IF NOT EXISTS discord_component_refs (
    scope TEXT NOT NULL,
    token TEXT NOT NULL,
    command TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(scope, token)
  );
  CREATE INDEX IF NOT EXISTS idx_discord_component_refs_expiry
    ON discord_component_refs(expires_at);
`)

let lastPruneAt = 0

function cleanScope(value: string) {
  const scope = value.trim()
  if (!scope || scope.length > 160) throw new Error('Discord component scope inválido.')
  return scope
}

function cleanToken(value: string) {
  const token = value.trim()
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) throw new Error('Discord component token inválido.')
  return token
}

function prune(stamp = Date.now()) {
  if (stamp - lastPruneAt < 60_000) return
  lastPruneAt = stamp
  opsDb.prepare('DELETE FROM discord_component_refs WHERE expires_at < ?')
    .run(stamp - RETENTION_GRACE_MS)
}

export function persistDiscordComponentRef(
  scope: string,
  token: string,
  command: string,
  ttlMs = DEFAULT_TTL_MS,
) {
  const now = Date.now()
  const expiresAt = now + Math.max(60_000, Math.min(ttlMs, 24 * 60 * 60_000))
  const normalizedScope = cleanScope(scope)
  const normalizedToken = cleanToken(token)
  if (!command.trim()) throw new Error('Discord component command vacío.')
  opsDb.prepare(`INSERT INTO discord_component_refs(scope, token, command, expires_at, created_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(scope, token) DO UPDATE SET
        command = excluded.command,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at`)
    .run(normalizedScope, normalizedToken, command, expiresAt, now)
  prune(now)
  return expiresAt
}

export function resolveDiscordComponentRef(scope: string, token: string) {
  const now = Date.now()
  const normalizedScope = cleanScope(scope)
  const normalizedToken = cleanToken(token)
  const row = opsDb.prepare(`SELECT command, expires_at AS expiresAt
      FROM discord_component_refs WHERE scope = ? AND token = ? LIMIT 1`)
    .get(normalizedScope, normalizedToken) as { command?: string; expiresAt?: number } | undefined
  if (!row?.command || Number(row.expiresAt ?? 0) <= now) {
    opsDb.prepare('DELETE FROM discord_component_refs WHERE scope = ? AND token = ?')
      .run(normalizedScope, normalizedToken)
    return undefined
  }
  prune(now)
  return row.command
}
