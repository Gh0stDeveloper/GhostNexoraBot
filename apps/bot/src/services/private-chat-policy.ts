import { jidNormalizedUser, type WAMessage } from 'baileys'
import { config } from '../config.js'
import { economy } from './economy.js'
import { digitsFromJid, getSender, getSenderCandidates } from '../utils/message.js'

const db = economy.db
const now = () => Date.now()
const oneShotOutboundPermits = new Map<string, { remaining: number; expiresAt: number }>()

db.exec(`
  CREATE TABLE IF NOT EXISTS private_chat_allowlist (
    user_jid TEXT PRIMARY KEY,
    added_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try { return jidNormalizedUser(value) } catch { return value }
}

function canonicalSender(message: WAMessage) {
  const candidates = getSenderCandidates(message).map(normalizeJid).filter(Boolean)
  const pn = candidates.find((jid) => /@s\.whatsapp\.net$/i.test(jid))
  return normalizeJid(pn ?? getSender(message))
}

function sameUser(left?: string | null, right?: string | null) {
  const a = normalizeJid(left)
  const b = normalizeJid(right)
  if (a && b && a === b) return true
  const ad = digitsFromJid(a)
  const bd = digitsFromJid(b)
  return Boolean(ad && bd && ad === bd)
}

function isDirectUserJid(jid: string) {
  const normalized = normalizeJid(jid)
  return normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid')
}

function ownerMatchesJid(userJid: string, instanceOwnerJid?: string) {
  if (instanceOwnerJid) return sameUser(userJid, instanceOwnerJid)
  const digits = digitsFromJid(userJid)
  return Boolean(digits && config.owners.includes(digits))
}

function consumeOneShotPrivateSend(userJid: string) {
  const normalized = normalizeJid(userJid)
  const permit = oneShotOutboundPermits.get(normalized)
  if (!permit) return false
  if (permit.expiresAt < now() || permit.remaining <= 0) {
    oneShotOutboundPermits.delete(normalized)
    return false
  }
  permit.remaining -= 1
  if (permit.remaining <= 0) oneShotOutboundPermits.delete(normalized)
  else oneShotOutboundPermits.set(normalized, permit)
  return true
}

/**
 * Autoriza exactamente una salida privada durante unos segundos sin abrir el
 * chat entrante ni persistir al usuario en la allowlist. Se usa para acciones
 * explícitas y controladas (por ejemplo, un DM administrativo originado desde
 * un grupo), manteniendo el lockdown normal para cualquier respuesta posterior.
 */
export function grantOneShotPrivateSend(userJid: string, ttlMs = 10_000) {
  const normalized = normalizeJid(userJid)
  if (!normalized || !isDirectUserJid(normalized)) throw new Error('Destino privado inválido.')
  const expiresAt = now() + Math.max(1_000, Math.min(30_000, Math.floor(ttlMs)))
  oneShotOutboundPermits.set(normalized, { remaining: 1, expiresAt })
  return normalized
}

export function isPrivateChatApproved(userJid: string) {
  const normalized = normalizeJid(userJid)
  if (!normalized) return false
  if (db.prepare('SELECT 1 FROM private_chat_allowlist WHERE user_jid = ?').get(normalized)) return true
  const digits = digitsFromJid(normalized)
  if (!digits) return false
  const rows = db.prepare('SELECT user_jid AS userJid FROM private_chat_allowlist').all() as Array<{ userJid: string }>
  return rows.some((row) => digitsFromJid(row.userJid) === digits)
}

export function isPrivateChatOwner(message: WAMessage, instanceOwnerJid?: string) {
  if (message.key.fromMe) return true
  const candidates = getSenderCandidates(message)
  if (instanceOwnerJid) return candidates.some((candidate) => sameUser(candidate, instanceOwnerJid))
  const numbers = candidates.map(digitsFromJid).filter(Boolean)
  return numbers.some((number) => config.owners.includes(number))
}

export function canProcessPrivateMessage(message: WAMessage, instanceOwnerJid?: string) {
  const chatId = message.key.remoteJid ?? ''
  if (chatId.endsWith('@g.us')) return true
  if (!chatId || chatId === 'status@broadcast') return false
  if (isPrivateChatOwner(message, instanceOwnerJid)) return true
  return isPrivateChatApproved(canonicalSender(message))
}

export function canSendToChatJid(chatJid: string, instanceOwnerJid?: string) {
  const normalized = normalizeJid(chatJid)
  if (!normalized) return false
  // Grupos, canales/newsletters y otros destinos no son chats privados de usuario.
  if (!isDirectUserJid(normalized)) return true
  if (ownerMatchesJid(normalized, instanceOwnerJid)) return true
  if (isPrivateChatApproved(normalized)) return true
  return consumeOneShotPrivateSend(normalized)
}

export function allowPrivateChat(userJid: string, addedBy: string) {
  const normalized = normalizeJid(userJid)
  if (!normalized) throw new Error('Usuario inválido.')
  db.prepare(`INSERT INTO private_chat_allowlist(user_jid, added_by, created_at)
    VALUES(?, ?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET added_by = excluded.added_by, created_at = excluded.created_at`)
    .run(normalized, normalizeJid(addedBy) || addedBy, now())
  return normalized
}

export function denyPrivateChat(userJid: string) {
  const normalized = normalizeJid(userJid)
  if (!normalized) return 0
  oneShotOutboundPermits.delete(normalized)
  const direct = db.prepare('DELETE FROM private_chat_allowlist WHERE user_jid = ?').run(normalized)
  if (Number(direct.changes) > 0) return Number(direct.changes)
  const digits = digitsFromJid(normalized)
  if (!digits) return 0
  const rows = db.prepare('SELECT user_jid AS userJid FROM private_chat_allowlist').all() as Array<{ userJid: string }>
  let removed = 0
  for (const row of rows) {
    if (digitsFromJid(row.userJid) !== digits) continue
    removed += Number(db.prepare('DELETE FROM private_chat_allowlist WHERE user_jid = ?').run(row.userJid).changes)
  }
  return removed
}

export function listPrivateChatUsers(limit = 100) {
  return db.prepare(`SELECT user_jid AS userJid, added_by AS addedBy, created_at AS createdAt
    FROM private_chat_allowlist ORDER BY created_at DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Math.floor(limit)))) as Array<{ userJid: string; addedBy: string; createdAt: number }>
}
