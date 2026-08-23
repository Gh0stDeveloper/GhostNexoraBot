import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from './economy.js'
import { digitsFromJid, getContextInfo, getMessageText, getSender, unwrapMessage } from '../utils/message.js'

const db = economy.db
const root = path.join(config.dataDir, 'global-stickers')
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS global_stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_sha256 TEXT NOT NULL UNIQUE,
    wa_sha256 TEXT,
    file_path TEXT NOT NULL,
    label TEXT,
    triggers TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS global_sticker_actions (
    action TEXT PRIMARY KEY,
    wa_sha256 TEXT NOT NULL,
    file_path TEXT,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

function sha(buffer: Buffer) { return createHash('sha256').update(buffer).digest('hex') }
function waHash(message: WAMessage) {
  const own = unwrapMessage(message.message)?.stickerMessage?.fileSha256
  const quoted = getContextInfo(message)?.quotedMessage?.stickerMessage?.fileSha256
  return Buffer.isBuffer(own) ? own.toString('base64') : Buffer.isBuffer(quoted) ? quoted.toString('base64') : undefined
}

export const globalStickers = {
  async add(buffer: Buffer, createdBy: string, waSha?: string, label?: string, triggers?: string[]) {
    if (!buffer.length) throw new Error('El sticker está vacío.')
    await mkdir(root, { recursive: true })
    const digest = sha(buffer)
    const filePath = path.join(root, `${digest}.webp`)
    await writeFile(filePath, buffer, { mode: 0o600 })
    db.prepare(`INSERT INTO global_stickers(content_sha256, wa_sha256, file_path, label, triggers, created_by, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET wa_sha256 = COALESCE(excluded.wa_sha256, wa_sha256), label = excluded.label,
      triggers = excluded.triggers, file_path = excluded.file_path`)
      .run(digest, waSha ?? null, filePath, label?.slice(0, 80) ?? null, triggers?.map((item) => item.trim().toLowerCase()).filter(Boolean).join('|') ?? null, createdBy, now())
    return db.prepare('SELECT id, label, triggers FROM global_stickers WHERE content_sha256 = ?').get(digest) as { id: number; label?: string; triggers?: string }
  },

  list() {
    return db.prepare('SELECT id, label, triggers, created_by as createdBy, created_at as createdAt FROM global_stickers ORDER BY id DESC LIMIT 100').all() as Array<{ id: number; label?: string; triggers?: string; createdBy: string; createdAt: number }>
  },

  async remove(id: number) {
    const row = db.prepare('SELECT file_path as filePath FROM global_stickers WHERE id = ?').get(id) as { filePath?: string } | undefined
    if (!row) throw new Error('Sticker global no encontrado.')
    db.prepare('DELETE FROM global_stickers WHERE id = ?').run(id)
    if (row.filePath) await rm(row.filePath, { force: true }).catch(() => undefined)
  },

  async setAction(action: 'kick', buffer: Buffer, createdBy: string, waSha?: string) {
    if (!waSha) throw new Error('No pude obtener la huella de WhatsApp del sticker. Responde directamente al sticker original.')
    await mkdir(root, { recursive: true })
    const filePath = path.join(root, `action-${action}-${sha(buffer)}.webp`)
    await writeFile(filePath, buffer, { mode: 0o600 })
    db.prepare(`INSERT INTO global_sticker_actions(action, wa_sha256, file_path, updated_by, updated_at) VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(action) DO UPDATE SET wa_sha256 = excluded.wa_sha256, file_path = excluded.file_path, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .run(action, waSha, filePath, createdBy, now())
  },

  clearAction(action: 'kick') { db.prepare('DELETE FROM global_sticker_actions WHERE action = ?').run(action) },

  hashFromMessage: waHash,
}

function isBotStaff(sender: string) {
  const digits = digitsFromJid(sender)
  return config.owners.includes(digits) || settings.isBotAdmin(digits)
}

export async function handleKickSticker(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  const content = unwrapMessage(message.message)
  const sticker = content?.stickerMessage
  const rawHash = sticker?.fileSha256
  if (!rawHash || !Buffer.isBuffer(rawHash)) return false
  const configured = db.prepare("SELECT wa_sha256 as waSha FROM global_sticker_actions WHERE action = 'kick'").get() as { waSha?: string } | undefined
  if (!configured?.waSha || configured.waSha !== rawHash.toString('base64')) return false
  const context = sticker.contextInfo
  const targetCandidate = context?.participant
  if (!targetCandidate) return false

  const metadata = await socket.groupMetadata(chatId).catch(() => null)
  if (!metadata) return false
  const sender = getSender(message)
  const senderParticipant = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(sender))
  if (!senderParticipant?.admin && !isBotStaff(sender)) return false
  const target = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(targetCandidate))
  const targetJid = target?.phoneNumber ?? target?.id ?? targetCandidate
  if (!targetJid) return false
  await socket.groupParticipantsUpdate(chatId, [targetJid], 'remove')
  await socket.sendMessage(chatId, { text: `🚫 *EXPULSIÓN POR STICKER*\n━━━━━━━━━━━━━━\n@${targetJid.split('@')[0]} fue expulsado por una acción de moderación.`, mentions: [targetJid] }).catch(() => undefined)
  return true
}

export async function maybeSendHumanSticker(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  const rows = db.prepare('SELECT id, file_path as filePath, triggers FROM global_stickers ORDER BY id DESC LIMIT 100').all() as Array<{ id: number; filePath: string; triggers?: string }>
  if (!rows.length) return false
  const text = getMessageText(message).toLowerCase()
  const triggered = rows.filter((row) => (row.triggers ?? '').split('|').filter(Boolean).some((trigger) => text.includes(trigger)))
  const chance = triggered.length ? 0.35 : 0.025
  if (Math.random() > chance) return false
  const pool = triggered.length ? triggered : rows
  const picked = pool[Math.floor(Math.random() * pool.length)]!
  try {
    await readFile(picked.filePath)
    await socket.sendMessage(chatId, { sticker: { url: picked.filePath } }, { quoted: message })
    return true
  } catch { return false }
}
