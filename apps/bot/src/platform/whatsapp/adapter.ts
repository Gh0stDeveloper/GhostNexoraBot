import type { WAMessage, WASocket } from 'baileys'
import {
  createPlatformCapabilities,
  normalizedUiToText,
  type NormalizedMedia,
  type NormalizedMessage,
  type NormalizedUi,
  type OutgoingMedia,
  type PlatformAdapter,
  type SentMessage,
  type SendOptions,
  type UiAction,
} from '@ghostnexora/platform-contracts'
import { config } from '../../config.js'
import { resolveChatLocale } from '../../i18n/index.js'
import { getContextInfo, getMessageText, unwrapMessage } from '../../utils/message.js'
import { createLocalizedSocket } from '../../services/localized-socket.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from './interactive.js'

export const WHATSAPP_CAPABILITIES = createPlatformCapabilities({
  editMessage: true,
  reactions: true,
  typing: true,
  buttons: true,
  carousel: true,
  embeds: false,
  files: true,
  polls: true,
  groupModeration: true,
  maxUploadBytes: config.maxDownloadBytes,
})

type NormalizeOverrides = {
  senderId?: string
  text?: string
  isGroup?: boolean
  pushName?: string
}

function numericFileLength(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') {
    const converted = Number(value)
    return Number.isSafeInteger(converted) ? converted : undefined
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const converted = Number(String(value))
    return Number.isSafeInteger(converted) ? converted : undefined
  }
  return undefined
}

function normalizedMediaFromMessage(message: WAMessage): NormalizedMedia | undefined {
  const content = unwrapMessage(message.message)
  if (!content) return undefined

  if (content.imageMessage) {
    return {
      kind: 'image',
      mimeType: content.imageMessage.mimetype ?? undefined,
      sizeBytes: numericFileLength(content.imageMessage.fileLength),
      caption: content.imageMessage.caption ?? undefined,
    }
  }
  if (content.videoMessage) {
    return {
      kind: 'video',
      mimeType: content.videoMessage.mimetype ?? undefined,
      sizeBytes: numericFileLength(content.videoMessage.fileLength),
      caption: content.videoMessage.caption ?? undefined,
    }
  }
  if (content.audioMessage) {
    return {
      kind: 'audio',
      mimeType: content.audioMessage.mimetype ?? undefined,
      sizeBytes: numericFileLength(content.audioMessage.fileLength),
    }
  }
  if (content.documentMessage) {
    return {
      kind: 'document',
      mimeType: content.documentMessage.mimetype ?? undefined,
      fileName: content.documentMessage.fileName ?? undefined,
      sizeBytes: numericFileLength(content.documentMessage.fileLength),
      caption: content.documentMessage.caption ?? undefined,
    }
  }
  if (content.stickerMessage) {
    return {
      kind: 'sticker',
      mimeType: content.stickerMessage.mimetype ?? undefined,
      sizeBytes: numericFileLength(content.stickerMessage.fileLength),
    }
  }
  return undefined
}

export function normalizeWhatsAppMessage(
  message: WAMessage,
  botInstanceId: string,
  overrides: NormalizeOverrides = {},
): NormalizedMessage {
  const chatId = message.key.remoteJid ?? ''
  return {
    platform: 'whatsapp',
    botInstanceId,
    chatId,
    senderId: overrides.senderId ?? message.key.participant ?? chatId,
    messageId: message.key.id ?? '',
    text: overrides.text ?? getMessageText(message),
    isGroup: overrides.isGroup ?? chatId.endsWith('@g.us'),
    replyTo: getContextInfo(message)?.stanzaId ?? undefined,
    pushName: overrides.pushName ?? message.pushName ?? undefined,
    media: normalizedMediaFromMessage(message),
    raw: message,
  }
}

function outgoingSource(media: OutgoingMedia): Buffer | { url: string } {
  if (media.source.kind === 'bytes') return Buffer.from(media.source.value)
  return { url: media.source.value }
}

function actionButton(action: UiAction): InteractiveButton {
  if (action.kind === 'url') return { type: 'url', text: action.label, url: action.value }
  return { type: 'reply', text: action.label, id: action.value }
}

function requireMessageId(sent: WAMessage | undefined, operation: string) {
  const messageId = sent?.key?.id
  if (!messageId) throw new Error(`WhatsApp ${operation} did not return a message ID.`)
  return messageId
}

export class WhatsAppAdapter implements PlatformAdapter {
  readonly id = 'whatsapp' as const
  readonly capabilities = WHATSAPP_CAPABILITIES
  private readonly messageCache = new Map<string, WAMessage>()

  constructor(
    private readonly socket: WASocket,
    readonly botInstanceId: string,
  ) {}

  /**
   * Phase 1 wraps an already-connected Baileys socket. Lifecycle ownership stays
   * in the existing session runtime until the dedicated V2 runtime migration.
   */
  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  rememberMessage(message: WAMessage) {
    const id = message.key.id
    if (!id) return
    this.messageCache.set(id, message)
    while (this.messageCache.size > 64) {
      const oldest = this.messageCache.keys().next().value as string | undefined
      if (!oldest) break
      this.messageCache.delete(oldest)
    }
  }

  normalizeMessage(message: WAMessage, overrides: NormalizeOverrides = {}) {
    this.rememberMessage(message)
    return normalizeWhatsAppMessage(message, this.botInstanceId, overrides)
  }

  private quotedMessage(replyTo?: string) {
    return replyTo ? this.messageCache.get(replyTo) : undefined
  }

  private localizedSocket(chatId: string) {
    return createLocalizedSocket(this.socket, resolveChatLocale(chatId))
  }

  private rememberSent(sent: WAMessage | undefined) {
    if (sent) this.rememberMessage(sent)
    return sent
  }

  async sendText(chatId: string, text: string, options: SendOptions = {}): Promise<SentMessage> {
    const quoted = this.quotedMessage(options.replyTo)
    const sent = this.rememberSent(await this.localizedSocket(chatId).sendMessage(
      chatId,
      { text, ...(options.mentions?.length ? { mentions: options.mentions } : {}) },
      quoted ? { quoted } : undefined,
    ) as WAMessage | undefined)
    return {
      platform: this.id,
      chatId,
      messageId: requireMessageId(sent, 'sendText'),
      raw: sent,
    }
  }

  async sendMedia(chatId: string, media: OutgoingMedia, options: SendOptions = {}): Promise<SentMessage> {
    const source = outgoingSource(media)
    const common = {
      ...(media.caption ? { caption: media.caption } : {}),
      ...(media.mimeType ? { mimetype: media.mimeType } : {}),
      ...(media.fileName ? { fileName: media.fileName } : {}),
      ...(options.mentions?.length ? { mentions: options.mentions } : {}),
    }
    const content = media.kind === 'image'
      ? { image: source, ...common }
      : media.kind === 'video'
        ? { video: source, ...common }
        : media.kind === 'audio'
          ? { audio: source, ...common }
          : media.kind === 'sticker'
            ? { sticker: source }
            : { document: source, ...common }

    const quoted = this.quotedMessage(options.replyTo)
    const sent = this.rememberSent(await this.localizedSocket(chatId).sendMessage(
      chatId,
      content as never,
      quoted ? { quoted } : undefined,
    ) as WAMessage | undefined)
    return {
      platform: this.id,
      chatId,
      messageId: requireMessageId(sent, 'sendMedia'),
      raw: sent,
    }
  }

  async sendUi(chatId: string, ui: NormalizedUi, options: SendOptions = {}): Promise<SentMessage> {
    if (ui.kind === 'text') return this.sendText(chatId, ui.text, options)
    const quoted = this.quotedMessage(options.replyTo)

    if (ui.kind === 'card') {
      const messageId = await sendInteractiveCard(this.socket, chatId, quoted, {
        title: ui.title,
        body: ui.body ?? '',
        imageUrl: ui.imageUrl,
        footer: ui.footer,
        buttons: (ui.buttons ?? []).map(actionButton),
      })
      return { platform: this.id, chatId, messageId }
    }

    if (ui.kind === 'carousel') {
      const messageId = await sendCarousel(this.socket, chatId, quoted, {
        title: ui.title ?? '',
        cards: ui.cards.map((card) => ({
          title: card.title,
          body: card.body ?? '',
          imageUrl: card.imageUrl,
          footer: card.footer,
          buttons: (card.buttons ?? []).map(actionButton),
        })),
      })
      return { platform: this.id, chatId, messageId }
    }

    const commandRows = ui.items.every((item) => item.action?.kind === 'command')
    if (commandRows && ui.items.length > 0) {
      const messageId = await sendInteractiveCard(this.socket, chatId, quoted, {
        title: ui.title ?? '',
        body: ui.body ?? '',
        buttons: [{
          type: 'select',
          text: ui.title || ui.body || 'Seleccionar',
          sections: [{
            title: ui.title || '',
            rows: ui.items.map((item) => ({
              id: item.action!.value,
              title: item.title,
              description: item.description,
            })),
          }],
        }],
      })
      return { platform: this.id, chatId, messageId }
    }

    return this.sendText(chatId, normalizedUiToText(ui), options)
  }

  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    await this.localizedSocket(chatId).sendMessage(chatId, {
      text,
      edit: { remoteJid: chatId, fromMe: true, id: messageId },
    })
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    await this.socket.sendPresenceUpdate(active ? 'composing' : 'paused', chatId)
  }

  async react(chatId: string, messageId: string, reaction: string): Promise<void> {
    const remembered = this.messageCache.get(messageId)
    const key = remembered?.key ?? { remoteJid: chatId, fromMe: false, id: messageId }
    await this.localizedSocket(chatId).sendMessage(chatId, { react: { text: reaction, key } } as never)
  }
}

export function whatsappBotInstanceId(instanceId?: number) {
  return typeof instanceId === 'number' ? `subbot-${instanceId}` : 'main'
}

export function createWhatsAppAdapter(socket: WASocket, instanceId?: number) {
  return new WhatsAppAdapter(socket, whatsappBotInstanceId(instanceId))
}
