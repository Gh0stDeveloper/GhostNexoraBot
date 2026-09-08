import { createHash } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { economy } from './economy.js'
import { canSendToChatJid } from './private-chat-policy.js'
import { getContextInfo, getMessageText, unwrapMessage } from '../utils/message.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS global_premium_stickers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    label TEXT,
    triggers TEXT,
    pack_name TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_global_premium_stickers_pack ON global_premium_stickers(pack_name, id);
  CREATE TABLE IF NOT EXISTS global_sticker_pack_members (
    pack_name TEXT NOT NULL,
    sticker_kind TEXT NOT NULL,
    sticker_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(pack_name, sticker_kind, sticker_id)
  );
`)

type LooseSticker = Record<string, unknown>

type SerializedPremiumSticker = {
  url?: string
  fileSha256?: string
  fileEncSha256?: string
  mediaKey?: string
  mimetype?: string
  height?: number
  width?: number
  directPath?: string
  fileLength?: number
  mediaKeyTimestamp?: number
  stickerSentTs?: number
  isAnimated?: boolean
  isAvatar?: boolean
  isAiSticker?: boolean
  isLottie?: boolean
  premium?: number
  emojis?: string
}

function normalizePack(value?: string | null) {
  const pack = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  return pack || null
}

function normalizeTrigger(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function triggerMatches(text: string, trigger: string) {
  const a = ` ${normalizeTrigger(text)} `
  const b = normalizeTrigger(trigger)
  return Boolean(b && a.includes(` ${b} `))
}

function asBase64(value: unknown) {
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (typeof value === 'string' && value) return value
  return undefined
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (value && typeof value === 'object') {
    const candidate = value as { toNumber?: () => number; low?: number }
    try {
      if (typeof candidate.toNumber === 'function') return candidate.toNumber()
      if (typeof candidate.low === 'number') return candidate.low
    } catch { return undefined }
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function serializeSticker(sticker: LooseSticker): SerializedPremiumSticker {
  return {
    url: typeof sticker.url === 'string' ? sticker.url : undefined,
    fileSha256: asBase64(sticker.fileSha256),
    fileEncSha256: asBase64(sticker.fileEncSha256),
    mediaKey: asBase64(sticker.mediaKey),
    mimetype: typeof sticker.mimetype === 'string' ? sticker.mimetype : undefined,
    height: asNumber(sticker.height),
    width: asNumber(sticker.width),
    directPath: typeof sticker.directPath === 'string' ? sticker.directPath : undefined,
    fileLength: asNumber(sticker.fileLength),
    mediaKeyTimestamp: asNumber(sticker.mediaKeyTimestamp),
    stickerSentTs: asNumber(sticker.stickerSentTs),
    isAnimated: Boolean(sticker.isAnimated),
    isAvatar: Boolean(sticker.isAvatar),
    isAiSticker: Boolean(sticker.isAiSticker),
    isLottie: sticker.isLottie === undefined ? true : Boolean(sticker.isLottie),
    premium: asNumber(sticker.premium) ?? 1,
    emojis: typeof sticker.emojis === 'string' ? sticker.emojis.slice(0, 120) : undefined,
  }
}

function deserializeSticker(payload: SerializedPremiumSticker) {
  return {
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.fileSha256 ? { fileSha256: Buffer.from(payload.fileSha256, 'base64') } : {}),
    ...(payload.fileEncSha256 ? { fileEncSha256: Buffer.from(payload.fileEncSha256, 'base64') } : {}),
    ...(payload.mediaKey ? { mediaKey: Buffer.from(payload.mediaKey, 'base64') } : {}),
    ...(payload.mimetype ? { mimetype: payload.mimetype } : { mimetype: 'application/was' }),
    ...(payload.height ? { height: payload.height } : { height: 512 }),
    ...(payload.width ? { width: payload.width } : { width: 512 }),
    ...(payload.directPath ? { directPath: payload.directPath } : {}),
    ...(payload.fileLength ? { fileLength: payload.fileLength } : {}),
    ...(payload.mediaKeyTimestamp ? { mediaKeyTimestamp: payload.mediaKeyTimestamp } : {}),
    ...(payload.stickerSentTs ? { stickerSentTs: payload.stickerSentTs } : { stickerSentTs: Date.now() }),
    isAnimated: Boolean(payload.isAnimated),
    isAvatar: Boolean(payload.isAvatar),
    isAiSticker: Boolean(payload.isAiSticker),
    isLottie: payload.isLottie !== false,
    premium: payload.premium ?? 1,
    ...(payload.emojis ? { emojis: payload.emojis } : {}),
  }
}

function rootCandidates(message: WAMessage) {
  const roots: unknown[] = [message.message, getContextInfo(message)?.quotedMessage]
  return roots.filter(Boolean)
}

export function extractPremiumSticker(message: WAMessage): LooseSticker | null {
  for (const root of rootCandidates(message)) {
    const loose = root as Record<string, any>
    const unwrapped = unwrapMessage(root as never) as Record<string, any> | undefined
    const candidates = [
      loose?.lottieStickerMessage?.message?.stickerMessage,
      loose?.lottieStickerMessage?.stickerMessage,
      loose?.stickerMessage,
      unwrapped?.stickerMessage,
    ].filter(Boolean) as LooseSticker[]

    for (const sticker of candidates) {
      const lottie = Boolean(sticker.isLottie) || sticker.mimetype === 'application/was' || Number(sticker.premium ?? 0) > 0
      if (lottie && (sticker.directPath || sticker.url) && sticker.mediaKey) return sticker
    }
  }
  return null
}

function fingerprint(payload: SerializedPremiumSticker) {
  const stable = payload.fileSha256 || payload.fileEncSha256 || payload.directPath || JSON.stringify(payload)
  return createHash('sha256').update(stable).digest('hex')
}

function quotedContext(quoted?: WAMessage) {
  if (!quoted?.message || !quoted.key.id) return undefined
  return {
    stanzaId: quoted.key.id,
    participant: quoted.key.participant ?? quoted.key.remoteJid,
    quotedMessage: quoted.message,
    quotedType: 0,
  }
}

export async function relayPremiumSticker(
  socket: WASocket,
  chatId: string,
  payload: SerializedPremiumSticker,
  quoted?: WAMessage,
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('El socket de WhatsApp todavía no está autenticado.')
  const instanceOwnerJid = process.env.NEXORA_SUBBOT_OWNER_JID || undefined
  if (!canSendToChatJid(chatId, instanceOwnerJid)) throw new Error('Destino no autorizado para esta instancia.')

  const sticker = deserializeSticker(payload) as Record<string, unknown>
  const contextInfo = quotedContext(quoted)
  if (contextInfo) sticker.contextInfo = contextInfo

  const messagePayload = {
    lottieStickerMessage: {
      message: {
        stickerMessage: sticker,
      },
    },
  }
  const generated = generateWAMessageFromContent(chatId, messagePayload as never, { userJid })
  const messageId = generated.key?.id
  if (!messageId || !generated.message) throw new Error('Baileys no pudo generar el mensaje Lottie.')
  await socket.relayMessage(chatId, generated.message, { messageId })
  return messageId
}

export const premiumStickersV18 = {
  normalizeTrigger,
  extract: extractPremiumSticker,

  addFromMessage(message: WAMessage, createdBy: string, options: { packName?: string; label?: string; triggers?: string[] } = {}) {
    const sticker = extractPremiumSticker(message)
    if (!sticker) throw new Error('Responde a un sticker Lottie/premium válido de WhatsApp.')
    const payload = serializeSticker(sticker)
    const digest = fingerprint(payload)
    const packName = normalizePack(options.packName)
    const triggers = [...new Set((options.triggers ?? []).map(normalizeTrigger).filter(Boolean))]
    db.prepare(`INSERT INTO global_premium_stickers(fingerprint, payload_json, label, triggers, pack_name, created_by, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET payload_json = excluded.payload_json, label = excluded.label,
        triggers = excluded.triggers, pack_name = COALESCE(excluded.pack_name, global_premium_stickers.pack_name)`)
      .run(digest, JSON.stringify(payload), options.label?.trim().slice(0, 80) || null, triggers.join('|') || null, packName, createdBy, now())
    const row = db.prepare(`SELECT id, label, triggers, pack_name AS packName FROM global_premium_stickers WHERE fingerprint = ?`).get(digest) as {
      id: number; label?: string | null; triggers?: string | null; packName?: string | null
    }
    if (packName) {
      db.prepare(`INSERT OR IGNORE INTO global_sticker_pack_members(pack_name, sticker_kind, sticker_id, created_at)
        VALUES(?, 'lottie', ?, ?)`).run(packName, row.id, now())
    }
    return row
  },

  list(limit = 100) {
    return db.prepare(`SELECT id, label, triggers, pack_name AS packName, created_by AS createdBy, created_at AS createdAt
      FROM global_premium_stickers ORDER BY id DESC LIMIT ?`).all(Math.max(1, Math.min(200, limit))) as Array<{
      id: number; label?: string | null; triggers?: string | null; packName?: string | null; createdBy: string; createdAt: number
    }>
  },

  remove(id: number) {
    db.prepare('DELETE FROM global_sticker_pack_members WHERE sticker_kind = ? AND sticker_id = ?').run('lottie', id)
    const result = db.prepare('DELETE FROM global_premium_stickers WHERE id = ?').run(id)
    if (!Number(result.changes)) throw new Error('Sticker Lottie no encontrado.')
  },

  addRegularPackMember(packName: string, stickerId: number) {
    const pack = normalizePack(packName)
    if (!pack) throw new Error('Indica el nombre del pack.')
    db.prepare(`INSERT OR IGNORE INTO global_sticker_pack_members(pack_name, sticker_kind, sticker_id, created_at)
      VALUES(?, 'webp', ?, ?)`).run(pack, stickerId, now())
    return pack
  },

  packs() {
    return db.prepare(`SELECT pack_name AS packName, COUNT(*) AS count,
      SUM(CASE WHEN sticker_kind = 'lottie' THEN 1 ELSE 0 END) AS lottieCount,
      SUM(CASE WHEN sticker_kind = 'webp' THEN 1 ELSE 0 END) AS webpCount
      FROM global_sticker_pack_members GROUP BY pack_name ORDER BY pack_name COLLATE NOCASE ASC`).all() as Array<{
      packName: string; count: number; lottieCount: number; webpCount: number
    }>
  },

  async sendById(socket: WASocket, chatId: string, id: number, quoted?: WAMessage) {
    const row = db.prepare('SELECT payload_json AS payloadJson FROM global_premium_stickers WHERE id = ?').get(id) as { payloadJson?: string } | undefined
    if (!row?.payloadJson) throw new Error('Sticker Lottie no encontrado.')
    return relayPremiumSticker(socket, chatId, JSON.parse(row.payloadJson) as SerializedPremiumSticker, quoted)
  },

  async sendPack(socket: WASocket, chatId: string, packName: string, quoted?: WAMessage, limit = 12) {
    const pack = normalizePack(packName)
    if (!pack) throw new Error('Indica el nombre del pack.')
    const members = db.prepare(`SELECT sticker_kind AS kind, sticker_id AS id FROM global_sticker_pack_members
      WHERE pack_name = ? ORDER BY created_at ASC LIMIT ?`).all(pack, Math.max(1, Math.min(20, limit))) as Array<{ kind: string; id: number }>
    if (!members.length) throw new Error(`El pack “${pack}” está vacío o no existe.`)
    let sent = 0
    for (const member of members) {
      if (member.kind === 'lottie') {
        await this.sendById(socket, chatId, member.id, quoted)
      } else {
        const row = db.prepare('SELECT file_path AS filePath FROM global_stickers WHERE id = ?').get(member.id) as { filePath?: string } | undefined
        if (!row?.filePath) continue
        await socket.sendMessage(chatId, { sticker: { url: row.filePath } }, quoted ? { quoted } : undefined)
      }
      sent += 1
      if (members.length > 1) await new Promise((resolve) => setTimeout(resolve, 180))
    }
    return { packName: pack, sent, total: members.length }
  },

  async maybeSend(socket: WASocket, message: WAMessage) {
    const chatId = message.key.remoteJid
    if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
    const rows = db.prepare(`SELECT id, payload_json AS payloadJson, triggers FROM global_premium_stickers ORDER BY id DESC LIMIT 100`).all() as Array<{
      id: number; payloadJson: string; triggers?: string | null
    }>
    if (!rows.length) return false
    const text = getMessageText(message)
    const triggered = rows.filter((row) => (row.triggers ?? '').split('|').filter(Boolean).some((trigger) => triggerMatches(text, trigger)))
    const chance = triggered.length ? 0.62 : 0.025
    if (Math.random() > chance) return false
    const pool = triggered.length ? triggered : rows
    const picked = pool[Math.floor(Math.random() * pool.length)]
    if (!picked) return false
    try {
      await relayPremiumSticker(socket, chatId, JSON.parse(picked.payloadJson) as SerializedPremiumSticker, message)
      return true
    } catch {
      return false
    }
  },
}
