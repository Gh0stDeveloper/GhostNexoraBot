import type { proto, WAMessage, WASocket } from 'baileys'
import { downloadContentFromMessage } from 'baileys'
import { economy } from './economy.js'
import { logger } from '../utils/logger.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS group_control_v9 (
    group_jid TEXT PRIMARY KEY,
    anti_view_once INTEGER NOT NULL DEFAULT 0,
    restricted_mode INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`)

function ensure(groupJid: string) {
  db.prepare('INSERT OR IGNORE INTO group_control_v9(group_jid, updated_at) VALUES(?, ?)').run(groupJid, now())
}

function update(groupJid: string, field: 'anti_view_once' | 'restricted_mode', enabled: boolean) {
  ensure(groupJid)
  db.prepare(`UPDATE group_control_v9 SET ${field} = ?, updated_at = ? WHERE group_jid = ?`).run(enabled ? 1 : 0, now(), groupJid)
}

export const groupControlsV9 = {
  get(groupJid: string) {
    ensure(groupJid)
    const row = db.prepare(
      'SELECT anti_view_once AS antiViewOnce, restricted_mode AS restrictedMode FROM group_control_v9 WHERE group_jid = ?',
    ).get(groupJid) as { antiViewOnce: number; restrictedMode: number }
    return {
      antiViewOnce: Boolean(row?.antiViewOnce),
      restrictedMode: Boolean(row?.restrictedMode),
    }
  },

  setAntiViewOnce(groupJid: string, enabled: boolean) {
    update(groupJid, 'anti_view_once', enabled)
    return this.get(groupJid)
  },

  setRestrictedMode(groupJid: string, enabled: boolean) {
    update(groupJid, 'restricted_mode', enabled)
    return this.get(groupJid)
  },
}

function unwrapForViewOnce(message: proto.IMessage | null | undefined): proto.IMessage | undefined {
  if (!message) return undefined
  if (message.ephemeralMessage?.message) return unwrapForViewOnce(message.ephemeralMessage.message)
  if (message.viewOnceMessage?.message) return unwrapForViewOnce(message.viewOnceMessage.message)
  if (message.viewOnceMessageV2?.message) return unwrapForViewOnce(message.viewOnceMessageV2.message)
  if ((message as any).viewOnceMessageV2Extension?.message) {
    return unwrapForViewOnce((message as any).viewOnceMessageV2Extension.message)
  }
  if (message.documentWithCaptionMessage?.message) {
    return unwrapForViewOnce(message.documentWithCaptionMessage.message)
  }
  return message
}

/**
 * Detecta mensajes “ver una vez” (envoltorio V1/V2 o flag en image/video).
 */
export function isViewOnceMessage(message: WAMessage | { message?: proto.IMessage | null }) {
  const content = message?.message
  if (!content) return false

  if (
    content.viewOnceMessage
    || content.viewOnceMessageV2
    || (content as any).viewOnceMessageV2Extension
  ) {
    return true
  }

  // A veces el flag viene en el media interno (o tras ephemeral)
  const inner = unwrapForViewOnce(content)
  if (!inner) return false
  if ((inner.imageMessage as any)?.viewOnce) return true
  if ((inner.videoMessage as any)?.viewOnce) return true
  return false
}

type ViewOnceMedia = {
  kind: 'image' | 'video'
  node: proto.Message.IImageMessage | proto.Message.IVideoMessage
  caption?: string
}

function extractViewOnceMedia(message: WAMessage): ViewOnceMedia | null {
  const content = unwrapForViewOnce(message.message)
  if (!content) return null

  if (content.imageMessage) {
    return {
      kind: 'image',
      node: content.imageMessage,
      caption: content.imageMessage.caption ?? undefined,
    }
  }
  if (content.videoMessage) {
    return {
      kind: 'video',
      node: content.videoMessage,
      caption: content.videoMessage.caption ?? undefined,
    }
  }
  return null
}

async function downloadViewOnceBuffer(media: ViewOnceMedia) {
  const stream = await downloadContentFromMessage(media.node as never, media.kind)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const buffer = Buffer.concat(chunks)
  if (!buffer.length) throw new Error('Media “ver una vez” vacía.')
  return buffer
}

function antiViewOnceCaption(originalCaption?: string) {
  const base = [
    '👁️ *ANTI VER UNA VEZ*',
    '━━━━━━━━━━━━━━',
    'Contenido “ver una vez” republicado como media normal en este grupo.',
  ]
  const caption = originalCaption?.trim()
  if (caption) base.push('', caption)
  return base.join('\n')
}

/**
 * Si el grupo tiene anti ver una vez activo y el mensaje es view-once,
 * descarga la foto/video y la reenvía al chat como media normal.
 * @returns true si se consumió el mensaje (no seguir con el router normal).
 */
export async function handleAntiViewOnce(socket: WASocket, message: WAMessage): Promise<boolean> {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us')) return false
  if (message.key.fromMe) return false
  if (!groupControlsV9.get(chatId).antiViewOnce) return false
  if (!isViewOnceMessage(message)) return false

  const media = extractViewOnceMedia(message)
  if (!media) {
    await socket.sendMessage(chatId, {
      text: [
        '👁️ *ANTI VER UNA VEZ*',
        '━━━━━━━━━━━━━━',
        'Detecté un mensaje “ver una vez”, pero no pude extraer la foto o el video.',
      ].join('\n'),
    }, { quoted: message }).catch(() => undefined)
    return true
  }

  try {
    const buffer = await downloadViewOnceBuffer(media)
    const caption = antiViewOnceCaption(media.caption)

    if (media.kind === 'image') {
      await socket.sendMessage(chatId, {
        image: buffer,
        caption,
        mimetype: media.node.mimetype ?? 'image/jpeg',
      }, { quoted: message })
    } else {
      await socket.sendMessage(chatId, {
        video: buffer,
        caption,
        mimetype: media.node.mimetype ?? 'video/mp4',
      }, { quoted: message })
    }

    logger.info({ chatId, kind: media.kind, size: buffer.length }, 'anti view-once media republished')
  } catch (error) {
    logger.warn({ error, chatId }, 'anti view-once download/send failed')
    await socket.sendMessage(chatId, {
      text: [
        '👁️ *ANTI VER UNA VEZ*',
        '━━━━━━━━━━━━━━',
        'Detecté un mensaje “ver una vez”, pero no pude descargar o reenviar el archivo.',
        'Es posible que el media ya no esté disponible en el servidor de WhatsApp.',
      ].join('\n'),
    }, { quoted: message }).catch(() => undefined)
  }

  return true
}
