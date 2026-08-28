import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import type { WASocket } from 'baileys'

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
let started = false
let offset = 0

function token() { return process.env.TELEGRAM_BOT_TOKEN?.trim() || '' }
function channelId() { return process.env.TELEGRAM_CHANNEL_ID?.trim() || '' }
function channelUrl() { return process.env.TELEGRAM_CHANNEL_URL?.trim() || '' }

async function tg<T>(method: string, body: Record<string, unknown> = {}) {
  const key = token()
  if (!key) throw new Error('Telegram bridge no configurado.')
  const response = await fetch(`https://api.telegram.org/bot${key}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  })
  const json = await response.json() as { ok?: boolean; result?: T; description?: string }
  if (!response.ok || !json.ok) throw new Error(json.description || `Telegram API HTTP ${response.status}`)
  return json.result as T
}

async function persist() {
  await mkdir(stateDir, { recursive: true })
  await writeFile(stateFile, JSON.stringify({ offset, messages: [...cache.values()].slice(-100) }), { mode: 0o600 })
}

async function restore() {
  try {
    const data = JSON.parse(await readFile(stateFile, 'utf8')) as { offset?: number; messages?: TelegramCachedMessage[] }
    offset = Number(data.offset || 0)
    for (const item of data.messages || []) if (Number.isInteger(item.messageId)) cache.set(item.messageId, item)
  } catch { /* first start */ }
}

function describeMessage(message: any): TelegramCachedMessage | null {
  if (!message || (channelId() && String(message.chat?.id) !== channelId() && String(message.chat?.username || '') !== channelId().replace(/^@/, ''))) return null
  const common = { messageId: Number(message.message_id), caption: message.caption as string | undefined, text: message.text as string | undefined, protected: Boolean(message.has_protected_content), createdAt: Date.now() }
  if (message.photo?.length) return { ...common, type: 'photo', fileId: message.photo[message.photo.length - 1].file_id }
  if (message.video) return { ...common, type: 'video', fileId: message.video.file_id, mimeType: message.video.mime_type }
  if (message.document) return { ...common, type: 'document', fileId: message.document.file_id, fileName: message.document.file_name, mimeType: message.document.mime_type }
  if (message.audio) return { ...common, type: 'audio', fileId: message.audio.file_id, fileName: message.audio.file_name, mimeType: message.audio.mime_type }
  if (message.text) return { ...common, type: 'text' }
  return null
}

async function pollOnce() {
  const updates = await tg<any[]>('getUpdates', { offset, timeout: 5, allowed_updates: ['channel_post'] })
  for (const update of updates) {
    offset = Math.max(offset, Number(update.update_id) + 1)
    const item = describeMessage(update.channel_post)
    if (item) cache.set(item.messageId, item)
  }
  await persist()
}

async function downloadFile(fileId: string) {
  const file = await tg<{ file_path?: string }>('getFile', { file_id: fileId })
  if (!file.file_path) throw new Error('Telegram no devolvió la ruta del archivo.')
  const response = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`No se pudo descargar el contenido de Telegram (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

export async function startTelegramBridge() {
  if (started || !token() || !channelId()) return false
  started = true
  await restore()
  const loop = async () => {
    while (started) {
      try { await pollOnce() } catch { await new Promise((resolve) => setTimeout(resolve, 5000)) }
    }
  }
  void loop()
  return true
}

export function telegramBridgeConfigured() { return Boolean(token() && channelId()) }

export async function shareTelegramMessage(socket: WASocket, chatId: string, messageId: number, quoted?: any) {
  const item = cache.get(messageId)
  if (!item) throw new Error('Ese mensaje todavía no está en la caché del puente Telegram. Publica/edita el mensaje mientras el puente esté activo e inténtalo de nuevo.')
  if (item.protected) throw new Error('El mensaje de Telegram tiene contenido protegido y no puede redistribuirse.')
  const footer = channelUrl() ? `\n\n📢 *Canal de WhatsApp:* ${config.officialChannelUrl}` : `\n\n📢 *Canal de WhatsApp:* ${config.officialChannelUrl}`
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
