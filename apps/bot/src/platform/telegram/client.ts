import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  TelegramApiResponse,
  TelegramBotIdentity,
  TelegramChatMember,
  TelegramFile,
  TelegramMessage,
  TelegramUpdate,
  TelegramWebhookInfo,
} from './types.js'

const API_ORIGIN = 'https://api.telegram.org'
const DEFAULT_TIMEOUT_MS = 30_000

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly errorCode?: number,
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'TelegramApiError'
  }
}

export type TelegramMediaInput =
  | { kind: 'remote'; value: string }
  | { kind: 'bytes'; value: Uint8Array; fileName: string; mimeType?: string }
  | { kind: 'path'; value: string; fileName?: string; mimeType?: string }

export class TelegramBotApiClient {
  constructor(
    private readonly token: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!token.trim()) throw new Error('TELEGRAM_BOT_TOKEN vacío.')
  }

  private endpoint(method: string) {
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(method)) throw new Error('Método Telegram inválido.')
    return `${API_ORIGIN}/bot${this.token}/${method}`
  }

  fileUrl(filePath: string) {
    const safe = filePath.replace(/^\/+/, '')
    if (!safe || safe.includes('..')) throw new Error('Ruta de archivo Telegram inválida.')
    return `${API_ORIGIN}/file/bot${this.token}/${safe}`
  }

  async call<T>(method: string, body: Record<string, unknown> = {}, timeoutMs = this.timeoutMs, retry429 = true): Promise<T> {
    const response = await fetch(this.endpoint(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const payload = await response.json().catch(() => null) as TelegramApiResponse<T> | null
    if (response.ok && payload?.ok) return payload.result as T

    const retryAfter = Number(payload?.parameters?.retry_after ?? 0)
    if (retry429 && (response.status === 429 || payload?.error_code === 429) && retryAfter > 0 && retryAfter <= 30) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      return this.call<T>(method, body, timeoutMs, false)
    }
    throw new TelegramApiError(
      payload?.description || `Telegram Bot API HTTP ${response.status}`,
      payload?.error_code ?? response.status,
      retryAfter || undefined,
    )
  }

  async callMultipart<T>(method: string, fields: Record<string, unknown>, fieldName: string, media: TelegramMediaInput): Promise<T> {
    if (media.kind === 'remote') return this.call<T>(method, { ...fields, [fieldName]: media.value }, 120_000)

    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue
      form.append(key, typeof value === 'string' ? value : JSON.stringify(value))
    }

    let bytes: Uint8Array
    let fileName: string
    let mimeType: string | undefined
    if (media.kind === 'path') {
      bytes = await readFile(media.value)
      fileName = media.fileName || path.basename(media.value) || 'file.bin'
      mimeType = media.mimeType
    } else {
      bytes = media.value
      fileName = media.fileName
      mimeType = media.mimeType
    }
    const blob = new Blob([bytes], mimeType ? { type: mimeType } : undefined)
    form.append(fieldName, blob, fileName)

    const response = await fetch(this.endpoint(method), {
      method: 'POST',
      body: form,
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    const payload = await response.json().catch(() => null) as TelegramApiResponse<T> | null
    if (!response.ok || !payload?.ok) {
      throw new TelegramApiError(payload?.description || `Telegram Bot API HTTP ${response.status}`, payload?.error_code ?? response.status)
    }
    return payload.result as T
  }

  getMe() { return this.call<TelegramBotIdentity>('getMe') }
  getWebhookInfo() { return this.call<TelegramWebhookInfo>('getWebhookInfo') }
  deleteWebhook(dropPendingUpdates = false) { return this.call<boolean>('deleteWebhook', { drop_pending_updates: dropPendingUpdates }) }

  getUpdates(offset: number, timeoutSeconds = 25, signalTimeoutMs = 35_000) {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query'],
    }, signalTimeoutMs, false)
  }

  sendMessage(chatId: string, text: string, extra: Record<string, unknown> = {}) {
    return this.call<TelegramMessage>('sendMessage', { chat_id: chatId, text, ...extra })
  }

  editMessageText(chatId: string, messageId: number, text: string, extra: Record<string, unknown> = {}) {
    return this.call<TelegramMessage | true>('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra })
  }

  editMessageCaption(chatId: string, messageId: number, caption: string, extra: Record<string, unknown> = {}) {
    return this.call<TelegramMessage | true>('editMessageCaption', { chat_id: chatId, message_id: messageId, caption, ...extra })
  }

  sendChatAction(chatId: string, action: string) {
    return this.call<boolean>('sendChatAction', { chat_id: chatId, action })
  }

  setMessageReaction(chatId: string, messageId: number, emoji: string) {
    return this.call<boolean>('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : [],
    })
  }

  answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.call<boolean>('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
  }

  getChatMember(chatId: string, userId: number) {
    return this.call<TelegramChatMember>('getChatMember', { chat_id: chatId, user_id: userId })
  }

  getFile(fileId: string) { return this.call<TelegramFile>('getFile', { file_id: fileId }) }

  sendMedia(method: 'sendPhoto' | 'sendVideo' | 'sendAudio' | 'sendDocument' | 'sendSticker', chatId: string, fieldName: string, media: TelegramMediaInput, extra: Record<string, unknown> = {}) {
    return this.callMultipart<TelegramMessage>(method, { chat_id: chatId, ...extra }, fieldName, media)
  }
}
