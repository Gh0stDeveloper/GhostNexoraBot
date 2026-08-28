import type { WASocket } from 'baileys'
import { config } from '../config.js'

type AnySocket = WASocket & Record<string, any>

function channelCodeFromUrl(value: string) {
  const match = value.match(/whatsapp\.com\/channel\/([^/?#]+)/i)
  return match?.[1] ?? value.replace(/^@/, '').trim()
}

export async function resolveOfficialChannel(socket: WASocket, value = config.officialChannelUrl) {
  const code = channelCodeFromUrl(value)
  const sock = socket as AnySocket
  if (typeof sock.newsletterMetadata !== 'function') throw new Error('Esta versión de Baileys no expone la API de canales/newsletters.')
  const meta = await sock.newsletterMetadata('invite', code)
  if (!meta?.id) throw new Error('No pude resolver el canal oficial de WhatsApp.')
  return { jid: String(meta.id), metadata: meta }
}

export function channelMessageIdFromUrl(value: string) {
  const match = value.match(/whatsapp\.com\/channel\/[^/]+\/(\d+)/i)
  return match?.[1] ?? null
}

export async function fetchChannelMessages(socket: WASocket, channelJid: string, count = 50) {
  const sock = socket as AnySocket
  if (typeof sock.newsletterFetchMessages !== 'function') throw new Error('La versión de Baileys instalada no permite leer publicaciones del canal.')
  return await sock.newsletterFetchMessages(channelJid, count)
}

export async function publishChannelText(socket: WASocket, channelJid: string, text: string) {
  const sock = socket as AnySocket
  if (typeof sock.newsletterSendMessage === 'function') return await sock.newsletterSendMessage(channelJid, { text })
  return await socket.sendMessage(channelJid, { text })
}

export async function reactChannelMessage(socket: WASocket, channelJid: string, serverId: string, emoji: string) {
  const sock = socket as AnySocket
  if (typeof sock.newsletterReactMessage !== 'function') throw new Error('Esta versión de Baileys no expone reacciones de canal.')
  return await sock.newsletterReactMessage(channelJid, serverId, emoji)
}

export async function updateChannel(socket: WASocket, channelJid: string, field: 'name' | 'description', value: string) {
  const sock = socket as AnySocket
  const method = field === 'name' ? 'newsletterUpdateName' : 'newsletterUpdateDescription'
  if (typeof sock[method] !== 'function') throw new Error(`Esta versión de Baileys no expone la actualización de ${field} del canal.`)
  return await sock[method](channelJid, value)
}

function extractText(message: any) {
  return message?.message?.conversation
    ?? message?.message?.extendedTextMessage?.text
    ?? message?.message?.imageMessage?.caption
    ?? message?.message?.videoMessage?.caption
    ?? message?.text
    ?? message?.caption
    ?? ''
}

export async function shareChannelPostToGroup(socket: WASocket, groupJid: string, rawPost: any, channelUrl = config.officialChannelUrl) {
  const forwarded = rawPost?.message ? rawPost : rawPost?.message?.message ? rawPost.message : null
  if (forwarded?.key?.remoteJid) {
    try {
      await socket.sendMessage(groupJid, { forward: forwarded } as any)
      await socket.sendMessage(groupJid, { text: `📢 *Canal oficial:* ${channelUrl}` })
      return 'forwarded'
    } catch { /* fallback textual */ }
  }
  const text = extractText(rawPost)
  if (!text) throw new Error('La publicación no contiene un texto reenviable en esta versión de Baileys.')
  await socket.sendMessage(groupJid, { text: `${text}\n\n📢 *Canal oficial:* ${channelUrl}` })
  return 'text'
}

export function postServerId(post: any) {
  return String(post?.server_id ?? post?.serverId ?? post?.id ?? post?.message?.key?.id ?? '')
}
