import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { WASocket } from 'baileys'
import { config } from '../config.js'
import { TelegramBotApiClient } from '../platform/telegram/client.js'
import type { TelegramMessage } from '../platform/telegram/types.js'

export type TelegramCachedMessage = {
  messageId: number
  text?: string
  caption?: string
  type: 'text' | 'photo' | 'video' | 'document' | 'audio'
  fileId?: string
  fileName?: string
  mimeType?: string
  protected?: boolean
  createdAt: number
}

const stateDir = path.join(config.dataDir, 'telegram-bridge')
const stateFile = path.join(stateDir, 'messages.json')
const cache = new Map<number, TelegramCachedMessage>()
let initialized = false

function token() { return config.telegramBotToken.trim() }
function channelId() { return config.telegramChannelId.trim() }
function channelUrl() { return config.telegramChannelUrl.trim() }

async function persist() {
  await mkdir(stateDir, { recursive: true })
  await writeFile(stateFile, JSON.stringify({ messages: [...cache.values()].slice(-100) }), { mode: 0o600 })
}

async function restore() {
  try {
    const data = JSON.parse(await readFile(stateFile, 'utf8')) as { messages?: TelegramCachedMessage[] }
    for (const item of data.messages || []) if (Number.isInteger(item.messageId)) cache.set(item.messageId, item)
  } catch { /* first start */ }
}

function matchesConfiguredChannel(message: TelegramMessage) {
  const configured = channelId()
  if (!configured) return false
  return String(message.chat?.id) === configured || String(message.chat?.username || '') === configured.replace(/^@/, '')
}

function describeMessage(message: TelegramMessage): TelegramCachedMessage | null {
  if (!message || !matchesConfiguredChannel(message)) return null
  const common = {
    messageId: Number(message.message_id),
    caption: message.caption,
    text: message.text,
    protected: Boolean(message.has_protected_content),
    createdAt: Date.now(),
  }
  if (message.photo?.length) return { ...common, type: 'photo', fileId: message.photo.at(-1)?.file_id }
  if (message.video) return { ...common, type: 'video', fileId: message.video.file_id, fileName: message.video.file_name, mimeType: message.video.mime_type }
  if (message.document) return { ...common, type: 'document', fileId: message.document.file_id, fileName: message.document.file_name, mimeType: message.document.mime_type }
  if (message.audio || message.voice) {
    const audio = message.audio || message.voice!
    return { ...common, type: 'audio', fileId: audio.file_id, fileName: audio.file_name, mimeType: audio.mime_type }
  }
  if (message.text) return { ...common, type: 'text' }
  return null
}

export async function initTelegramBridgeCache() {
  if (initialized) return true
  initialized = true
  await restore()
  return true
}

export async function ingestTelegramChannelPost(message: TelegramMessage) {
  await initTelegramBridgeCache()
  const item = describeMessage(message)
  if (!item) return false
  cache.set(item.messageId, item)
  await persist()
  return true
}

// Compatibilidad V7: index.ts conserva este nombre, pero desde Phase 4 ya no
// existe un segundo poller. El arranque se delega al runtime Telegram nativo.
export async function startTelegramBridge() {
  if (!token()) return false
  await initTelegramBridgeCache()
  const { startTelegramPlatform } = await import('../platform/telegram/runtime.js')
  return startTelegramPlatform()
}

export function stopTelegramBridge() { /* el shutdown nativo se maneja en runtime */ }
export function telegramBridgeConfigured() { return Boolean(token() && channelId()) }
export function telegramBridgeStatus() {
  return { configured: telegramBridgeConfigured(), initialized, cachedMessages: cache.size, channelId: channelId() || null }
}

async function downloadFile(fileId: string) {
  const client = new TelegramBotApiClient(token())
  const file = await client.getFile(fileId)
  if (!file.file_path) throw new Error('Telegram no devolvió la ruta del archivo.')
  const response = await fetch(client.fileUrl(file.file_path), { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`No se pudo descargar el contenido de Telegram (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

export async function shareTelegramMessage(socket: WASocket, chatId: string, messageId: number, quoted?: any) {
  await initTelegramBridgeCache()
  const item = cache.get(messageId)
  if (!item) throw new Error('Ese mensaje todavía no está en la caché Telegram. Publica o edita el mensaje mientras la plataforma Telegram esté activa e inténtalo de nuevo.')
  if (item.protected) throw new Error('El mensaje de Telegram tiene contenido protegido y no puede redistribuirse.')
  const footer = `\n\n📢 *Canal de WhatsApp:* ${config.officialChannelUrl}${channelUrl() ? `\nTelegram: ${channelUrl()}` : ''}`
  if (item.type === 'text') {
    await socket.sendMessage(chatId, { text: `${item.text || ''}${footer}` }, quoted ? { quoted } : undefined)
    return
  }
  const data = item.fileId ? await downloadFile(item.fileId) : null
  if (!data) throw new Error('El mensaje no contiene un archivo recuperable.')
  const caption = `${item.caption || item.text || ''}${footer}`
  if (item.type === 'photo') await socket.sendMessage(chatId, { image: data, caption }, quoted ? { quoted } : undefined)
  else if (item.type === 'video') await socket.sendMessage(chatId, { video: data, mimetype: item.mimeType || 'video/mp4', caption }, quoted ? { quoted } : undefined)
  else if (item.type === 'audio') await socket.sendMessage(chatId, { audio: data, mimetype: item.mimeType || 'audio/mpeg', ptt: false }, quoted ? { quoted } : undefined)
  else await socket.sendMessage(chatId, { document: data, mimetype: item.mimeType || 'application/octet-stream', fileName: item.fileName || `telegram-${messageId}`, caption }, quoted ? { quoted } : undefined)
}
