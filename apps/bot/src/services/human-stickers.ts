import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from './economy.js'
import { digitsFromJid, downloadMessageMedia, getContextInfo, getMessageText, getSender, unwrapMessage } from '../utils/message.js'

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
    wa_sha256 TEXT,
    content_sha256 TEXT,
    file_path TEXT,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

const actionColumns = db.prepare('PRAGMA table_info(global_sticker_actions)').all() as Array<{ name: string }>
if (!actionColumns.some((column) => column.name === 'content_sha256')) db.exec('ALTER TABLE global_sticker_actions ADD COLUMN content_sha256 TEXT')

function sha(buffer: Buffer) { return createHash('sha256').update(buffer).digest('hex') }
function bytesHash(value: unknown) { if (Buffer.isBuffer(value)) return value.toString('base64'); if (value instanceof Uint8Array) return Buffer.from(value).toString('base64'); return undefined }
function waHash(message: WAMessage) { return bytesHash(unwrapMessage(message.message)?.stickerMessage?.fileSha256) ?? bytesHash(getContextInfo(message)?.quotedMessage?.stickerMessage?.fileSha256) }
function normalizeTrigger(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ') }
function triggerMatches(text: string, trigger: string) { const a = ` ${normalizeTrigger(text)} `; const b = normalizeTrigger(trigger); return Boolean(b && a.includes(` ${b} `)) }

export const globalStickers = {
  async add(buffer: Buffer, createdBy: string, waSha?: string, label?: string, triggers?: string[]) {
    if (!buffer.length) throw new Error('El sticker está vacío.')
    await mkdir(root, { recursive: true })
    const digest = sha(buffer); const filePath = path.join(root, `${digest}.webp`)
    const cleanTriggers = [...new Set((triggers ?? []).map(normalizeTrigger).filter(Boolean))]
    await writeFile(filePath, buffer, { mode: 0o600 })
    db.prepare(`INSERT INTO global_stickers(content_sha256, wa_sha256, file_path, label, triggers, created_by, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_sha256) DO UPDATE SET wa_sha256 = COALESCE(excluded.wa_sha256, wa_sha256), label = excluded.label, triggers = excluded.triggers, file_path = excluded.file_path`).run(digest, waSha ?? null, filePath, label?.slice(0, 80) ?? null, cleanTriggers.join('|') || null, createdBy, now())
    return db.prepare('SELECT id, label, triggers FROM global_stickers WHERE content_sha256 = ?').get(digest) as { id: number; label?: string; triggers?: string }
  },
  list() { return db.prepare('SELECT id, label, triggers, created_by as createdBy, created_at as createdAt FROM global_stickers ORDER BY id DESC LIMIT 100').all() },
  async remove(id: number) { const row = db.prepare('SELECT file_path as filePath FROM global_stickers WHERE id = ?').get(id) as { filePath?: string } | undefined; if (!row) throw new Error('Sticker global no encontrado.'); db.prepare('DELETE FROM global_stickers WHERE id = ?').run(id); if (row.filePath) await rm(row.filePath, { force: true }).catch(() => undefined) },
  async setAction(action: 'kick', buffer: Buffer, createdBy: string, waSha?: string) {
    if (!buffer.length) throw new Error('El sticker está vacío.')
    await mkdir(root, { recursive: true })
    const contentSha = sha(buffer); const storedWaSha = waSha ?? `content:${contentSha}`; const filePath = path.join(root, `action-${action}-${contentSha}.webp`)
    await writeFile(filePath, buffer, { mode: 0o600 })
    db.prepare(`INSERT INTO global_sticker_actions(action, wa_sha256, content_sha256, file_path, updated_by, updated_at) VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(action) DO UPDATE SET wa_sha256 = excluded.wa_sha256, content_sha256 = excluded.content_sha256, file_path = excluded.file_path, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(action, storedWaSha, contentSha, filePath, createdBy, now())
    return { waSha: waSha ?? null, contentSha }
  },
  clearAction(action: 'kick' | 'ban' | 'warn') { db.prepare('DELETE FROM global_sticker_actions WHERE action = ?').run(action) },
  hashFromMessage: waHash,
  normalizeTrigger,
}

function isBotStaff(sender: string) { const digits = digitsFromJid(sender); return config.owners.includes(digits) || settings.isBotAdmin(digits) }

export async function handleKickSticker(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  const sticker = unwrapMessage(message.message)?.stickerMessage
  if (!sticker) return false
  const configured = db.prepare("SELECT wa_sha256 as waSha, content_sha256 as contentSha FROM global_sticker_actions WHERE action = 'kick'").get() as { waSha?: string | null; contentSha?: string | null } | undefined
  if (!configured?.waSha && !configured?.contentSha) return false
  const incomingWa = bytesHash(sticker.fileSha256)
  let matches = Boolean(configured.waSha && incomingWa && configured.waSha === incomingWa)
  if (!matches && configured.contentSha) { const media = await downloadMessageMedia(message).catch(() => null); matches = Boolean(media?.kind === 'sticker' && sha(media.buffer) === configured.contentSha) }
  if (!matches) return false
  const targetCandidate = sticker.contextInfo?.participant
  if (!targetCandidate) return false
  const metadata = await socket.groupMetadata(chatId).catch(() => null); if (!metadata) return false
  const sender = getSender(message)
  const senderParticipant = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(sender))
  const staffIdentity = senderParticipant?.phoneNumber ?? senderParticipant?.id ?? sender
  if (!senderParticipant?.admin && !isBotStaff(staffIdentity)) return false
  const target = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(targetCandidate)); const targetJid = target?.phoneNumber ?? target?.id ?? targetCandidate
  if (!targetJid || [socket.user?.id, socket.user?.lid].filter(Boolean).includes(targetJid)) return false
  await socket.groupParticipantsUpdate(chatId, [targetJid], 'remove')
  await socket.sendMessage(chatId, { text: `🚫 *EXPULSIÓN POR STICKER*\n━━━━━━━━━━━━━━\n@${targetJid.split('@')[0]} fue expulsado por una acción de moderación.`, mentions: [targetJid] }).catch(() => undefined)
  return true
}

export async function maybeSendHumanSticker(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  const rows = db.prepare('SELECT id, file_path as filePath, triggers FROM global_stickers ORDER BY id DESC LIMIT 100').all() as Array<{ id: number; filePath: string; triggers?: string }>
  if (!rows.length) return false
  const text = getMessageText(message)
  const triggered = rows.filter((row) => (row.triggers ?? '').split('|').filter(Boolean).some((trigger) => triggerMatches(text, trigger)))
  const chance = triggered.length ? 0.62 : 0.03
  if (Math.random() > chance) return false
  const pool = triggered.length ? triggered : rows
  const picked = pool[Math.floor(Math.random() * pool.length)]!
  try { await readFile(picked.filePath); await socket.sendMessage(chatId, { sticker: { url: picked.filePath } }, { quoted: message }); return true } catch { return false }
}
