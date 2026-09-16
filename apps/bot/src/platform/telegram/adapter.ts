import { randomBytes } from 'node:crypto'
import {
  createPlatformCapabilities,
  normalizedUiToText,
  type NormalizedUi,
  type OutgoingMedia,
  type PlatformAdapter,
  type SendOptions,
  type SentMessage,
  type UiAction,
} from '@ghostnexora/platform-contracts'
import { TelegramBotApiClient, type TelegramMediaInput } from './client.js'
import type { TelegramInlineButton, TelegramMessage } from './types.js'

const TELEGRAM_TEXT_LIMIT = 4096
const CALLBACK_LIMIT_BYTES = 64
const CALLBACK_TTL_MS = 30 * 60_000
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

type CallbackEntry = { command: string; expiresAt: number }

function chunks(text: string, limit = TELEGRAM_TEXT_LIMIT) {
  if (text.length <= limit) return [text]
  const result: string[] = []
  let rest = text
  while (rest.length > limit) {
    let splitAt = rest.lastIndexOf('\n', limit)
    if (splitAt < Math.floor(limit * 0.55)) splitAt = rest.lastIndexOf(' ', limit)
    if (splitAt < Math.floor(limit * 0.55)) splitAt = limit
    result.push(rest.slice(0, splitAt).trimEnd())
    rest = rest.slice(splitAt).trimStart()
  }
  if (rest) result.push(rest)
  return result
}

function replyMarkupOptions(options?: SendOptions) {
  const reply = Number(options?.replyTo)
  return Number.isSafeInteger(reply) && reply > 0
    ? { reply_parameters: { message_id: reply, allow_sending_without_reply: true } }
    : {}
}

function sent(message: TelegramMessage): SentMessage {
  return {
    platform: 'telegram',
    chatId: String(message.chat.id),
    messageId: String(message.message_id),
    raw: message,
  }
}

function mediaInput(media: OutgoingMedia): TelegramMediaInput {
  if (media.source.kind === 'url') return { kind: 'remote', value: media.source.value }
  if (media.source.kind === 'path') {
    return { kind: 'path', value: media.source.value, fileName: media.fileName, mimeType: media.mimeType }
  }
  return {
    kind: 'bytes',
    value: media.source.value,
    fileName: media.fileName || `ghost-nexora-${Date.now()}`,
    mimeType: media.mimeType,
  }
}

export class TelegramAdapter implements PlatformAdapter {
  readonly id = 'telegram' as const
  readonly botInstanceId: string
  readonly capabilities = createPlatformCapabilities({
    editMessage: true,
    reactions: true,
    typing: true,
    buttons: true,
    carousel: false,
    embeds: true,
    files: true,
    polls: false,
    groupModeration: false,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  })

  private readonly callbacks = new Map<string, CallbackEntry>()
  private readonly sentKinds = new Map<string, 'text' | 'media'>()

  constructor(
    readonly client: TelegramBotApiClient,
    botInstanceId = 'telegram-main',
  ) {
    this.botInstanceId = botInstanceId
  }

  async start() { await this.client.getMe() }
  async stop() {}

  private rememberKind(chatId: string, messageId: number, kind: 'text' | 'media') {
    this.sentKinds.set(`${chatId}:${messageId}`, kind)
    if (this.sentKinds.size > 2000) this.sentKinds.delete(this.sentKinds.keys().next().value as string)
  }

  private pruneCallbacks() {
    const now = Date.now()
    for (const [key, row] of this.callbacks) if (row.expiresAt <= now) this.callbacks.delete(key)
  }

  private callbackData(command: string) {
    this.pruneCallbacks()
    const direct = `cmd:${command}`
    if (Buffer.byteLength(direct, 'utf8') <= CALLBACK_LIMIT_BYTES) return direct
    const token = randomBytes(9).toString('base64url')
    this.callbacks.set(token, { command, expiresAt: Date.now() + CALLBACK_TTL_MS })
    return `ref:${token}`
  }

  resolveCallbackData(data?: string) {
    if (!data) return undefined
    if (data.startsWith('cmd:')) return data.slice(4)
    if (!data.startsWith('ref:')) return undefined
    this.pruneCallbacks()
    const token = data.slice(4)
    const row = this.callbacks.get(token)
    if (!row || row.expiresAt <= Date.now()) {
      this.callbacks.delete(token)
      return undefined
    }
    return row.command
  }

  private button(action: UiAction): TelegramInlineButton {
    return action.kind === 'url'
      ? { text: action.label, url: action.value }
      : { text: action.label, callback_data: this.callbackData(action.value) }
  }

  private keyboard(ui: NormalizedUi) {
    const rows: TelegramInlineButton[][] = []
    if (ui.kind === 'card') {
      for (const action of ui.buttons ?? []) rows.push([this.button(action)])
    } else if (ui.kind === 'list') {
      for (const item of ui.items) if (item.action) rows.push([this.button(item.action)])
    } else if (ui.kind === 'carousel') {
      for (const card of ui.cards) for (const action of card.buttons ?? []) rows.push([this.button(action)])
    }
    return rows.length ? { inline_keyboard: rows.slice(0, 100) } : undefined
  }

  async sendText(chatId: string, text: string, options?: SendOptions): Promise<SentMessage> {
    let last: TelegramMessage | undefined
    const parts = chunks(text || ' ')
    for (let index = 0; index < parts.length; index += 1) {
      last = await this.client.sendMessage(chatId, parts[index], index === 0 ? replyMarkupOptions(options) : {})
      this.rememberKind(chatId, last.message_id, 'text')
    }
    if (!last) throw new Error('Telegram no devolvió mensaje al enviar texto.')
    return sent(last)
  }

  async sendMedia(chatId: string, media: OutgoingMedia, options?: SendOptions): Promise<SentMessage> {
    const input = mediaInput(media)
    const extra: Record<string, unknown> = {
      ...replyMarkupOptions(options),
      ...(media.caption ? { caption: media.caption.slice(0, 1024) } : {}),
    }
    let message: TelegramMessage
    if (media.kind === 'image') message = await this.client.sendMedia('sendPhoto', chatId, 'photo', input, extra)
    else if (media.kind === 'video') message = await this.client.sendMedia('sendVideo', chatId, 'video', input, extra)
    else if (media.kind === 'audio') message = await this.client.sendMedia('sendAudio', chatId, 'audio', input, { ...extra, ...(media.fileName ? { title: media.fileName } : {}) })
    else if (media.kind === 'sticker') message = await this.client.sendMedia('sendSticker', chatId, 'sticker', input, replyMarkupOptions(options))
    else message = await this.client.sendMedia('sendDocument', chatId, 'document', input, { ...extra, ...(media.fileName ? { disable_content_type_detection: false } : {}) })
    this.rememberKind(chatId, message.message_id, 'media')
    return sent(message)
  }

  async sendUi(chatId: string, ui: NormalizedUi, options?: SendOptions): Promise<SentMessage> {
    const text = normalizedUiToText(ui) || 'Ghost Nexora Bot'
    const keyboard = this.keyboard(ui)
    const parts = chunks(text)
    let last: TelegramMessage | undefined
    for (let index = 0; index < parts.length; index += 1) {
      last = await this.client.sendMessage(chatId, parts[index], {
        ...(index === 0 ? replyMarkupOptions(options) : {}),
        ...(index === parts.length - 1 && keyboard ? { reply_markup: keyboard } : {}),
      })
      this.rememberKind(chatId, last.message_id, 'text')
    }
    if (!last) throw new Error('Telegram no devolvió mensaje para UI.')
    return sent(last)
  }

  async editMessage(chatId: string, messageId: string, text: string) {
    const id = Number(messageId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('messageId Telegram inválido.')
    const kind = this.sentKinds.get(`${chatId}:${id}`)
    if (kind === 'media') await this.client.editMessageCaption(chatId, id, text.slice(0, 1024))
    else await this.client.editMessageText(chatId, id, text.slice(0, TELEGRAM_TEXT_LIMIT))
  }

  async setTyping(chatId: string, active: boolean) {
    if (active) await this.client.sendChatAction(chatId, 'typing')
  }

  async react(chatId: string, messageId: string, reaction: string) {
    const id = Number(messageId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('messageId Telegram inválido.')
    await this.client.setMessageReaction(chatId, id, reaction)
  }
}
