import type { WAMessage, WASocket } from 'baileys'
import {
  createPlatformCapabilities,
  normalizedUiToText,
  type DeliveryContext,
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
import { resolveChatLocale, type LocaleCode } from '../../i18n/index.js'
import { isSupportedLocale } from '../../i18n/types.js'
import { deliverWithOutbox } from '../../services/delivery-outbox.js'
import { withPreparedMedia, type MediaPipelinePrepared } from '../../services/media-pipeline.js'
import { getContextInfo, getMessageText, unwrapMessage } from '../../utils/message.js'
import { logger } from '../../utils/logger.js'
import { createLocalizedSocket } from '../../services/localized-socket.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from './interactive.js'
import { whatsappMessageCache } from './message-cache.js'
import { whatsappOpsInstanceKey } from './instance.js'
import { whatsappUiFallbackChain } from './ui-fallback.js'
import { trackedAdapterOperation } from '../../services/ops-observability-metrics.js'

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

function outgoingSource(prepared: MediaPipelinePrepared): Buffer | { url: string } {
  if (prepared.source.kind === 'bytes') return Buffer.from(prepared.source.value)
  return { url: prepared.source.value }
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
  private readonly messageCache

  constructor(
    private readonly socket: WASocket,
    readonly botInstanceId: string,
  ) {
    this.messageCache = whatsappMessageCache(botInstanceId)
  }

  /**
   * Phase 1 wraps an already-connected Baileys socket. Lifecycle ownership stays
   * in the existing session runtime until the dedicated V2 runtime migration.
   */
  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  rememberMessage(message: WAMessage) {
    const chatId = message.key.remoteJid
    if (!chatId) return
    this.messageCache.set(chatId, message)
  }

  normalizeMessage(message: WAMessage, overrides: NormalizeOverrides = {}) {
    this.rememberMessage(message)
    return normalizeWhatsAppMessage(message, this.botInstanceId, overrides)
  }

  private quotedMessage(chatId: string, replyTo?: string) {
    return replyTo ? this.messageCache.get(chatId, replyTo) : undefined
  }

  private deliveryLocale(chatId: string, delivery?: DeliveryContext): LocaleCode {
    if (delivery?.locale && isSupportedLocale(delivery.locale)) return delivery.locale
    return resolveChatLocale(chatId, delivery?.userId, this.botInstanceId)
  }

  private localizedSocket(chatId: string, delivery?: DeliveryContext) {
    return createLocalizedSocket(this.socket, this.deliveryLocale(chatId, delivery), {
      contextChatId: chatId,
      botInstanceId: this.botInstanceId,
    })
  }

  private rememberSent(sent: WAMessage | undefined) {
    if (sent) this.rememberMessage(sent)
    return sent
  }

  private async sendTextDirect(chatId: string, text: string, options: SendOptions = {}): Promise<SentMessage> {
    const quoted = this.quotedMessage(chatId, options.replyTo)
    const sent = this.rememberSent(await this.localizedSocket(chatId, options.delivery).sendMessage(
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

  async sendText(chatId: string, text: string, options: SendOptions = {}): Promise<SentMessage> {
    const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
    return trackedAdapterOperation('whatsapp', 'send', () => deliverWithOutbox({
      platform: this.id,
      chatId,
      kind: 'text',
      label: 'whatsapp_text',
      correlationId: options.delivery?.correlationId,
      instanceKey,
    }, () => this.sendTextDirect(chatId, text, options)), { instanceKey })
  }

  async sendMedia(chatId: string, media: OutgoingMedia, options: SendOptions = {}): Promise<SentMessage> {
    return withPreparedMedia(media, {
      platform: 'WhatsApp',
      maxBytes: this.capabilities.maxUploadBytes,
      mode: media.source.kind === 'url' ? 'materialize' : 'direct',
      retries: 2,
    }, (prepared) => {
      const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
      return trackedAdapterOperation('whatsapp', 'media', () => deliverWithOutbox({
      platform: this.id,
      chatId,
      kind: 'media',
      label: `whatsapp_media_${media.kind}`,
      correlationId: options.delivery?.correlationId,
      instanceKey,
    }, async () => {
      const source = outgoingSource(prepared)
      const common = {
        ...(prepared.media.caption ? { caption: prepared.media.caption } : {}),
        ...(prepared.mimeType ? { mimetype: prepared.mimeType } : {}),
        ...(prepared.fileName ? { fileName: prepared.fileName } : {}),
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

      const quoted = this.quotedMessage(chatId, options.replyTo)
      const sent = this.rememberSent(await this.localizedSocket(chatId, options.delivery).sendMessage(
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
    }), { uploadBytes: prepared.size, instanceKey })
    })
  }

  private async sendUiStage(chatId: string, ui: NormalizedUi, options: SendOptions): Promise<SentMessage> {
    if (ui.kind === 'text') return this.sendTextDirect(chatId, ui.text, options)
    const quoted = this.quotedMessage(chatId, options.replyTo)
    const localizedSocket = this.localizedSocket(chatId, options.delivery)

    if (ui.kind === 'card') {
      const messageId = await sendInteractiveCard(localizedSocket, chatId, quoted, {
        title: ui.title,
        body: ui.body ?? '',
        imageUrl: ui.imageUrl,
        footer: ui.footer,
        buttons: (ui.buttons ?? []).map(actionButton),
        fallbackToText: false,
      })
      return { platform: this.id, chatId, messageId }
    }

    if (ui.kind === 'carousel') {
      const messageId = await sendCarousel(localizedSocket, chatId, quoted, {
        title: ui.title ?? '',
        cards: ui.cards.map((card) => ({
          title: card.title,
          body: card.body ?? '',
          imageUrl: card.imageUrl,
          footer: card.footer,
          buttons: (card.buttons ?? []).map(actionButton),
        })),
        fallbackToText: false,
      })
      return { platform: this.id, chatId, messageId }
    }

    const commandRows = ui.items.every((item) => item.action?.kind === 'command')
    if (commandRows && ui.items.length > 0) {
      const messageId = await sendInteractiveCard(localizedSocket, chatId, quoted, {
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
        fallbackToText: false,
      })
      return { platform: this.id, chatId, messageId }
    }

    return this.sendTextDirect(chatId, normalizedUiToText(ui), options)
  }

  async sendUi(chatId: string, ui: NormalizedUi, options: SendOptions = {}): Promise<SentMessage> {
    const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
    return trackedAdapterOperation('whatsapp', 'ui', () => deliverWithOutbox({
      platform: this.id,
      chatId,
      kind: 'ui',
      label: `whatsapp_ui_${ui.kind}`,
      correlationId: options.delivery?.correlationId,
      instanceKey,
    }, async () => {
      let lastError: unknown
      for (const stage of whatsappUiFallbackChain(ui)) {
        try {
          return await this.sendUiStage(chatId, stage, options)
        } catch (error) {
          lastError = error
          logger.warn({ error, chatId, from: ui.kind, fallback: stage.kind }, 'WhatsApp UI stage failed; trying lower capability fallback')
        }
      }
      throw lastError instanceof Error ? lastError : new Error('WhatsApp UI delivery failed.')
    }), { instanceKey })
  }

  async editMessage(chatId: string, messageId: string, text: string, delivery?: DeliveryContext): Promise<void> {
    const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
    await trackedAdapterOperation('whatsapp', 'edit', () => deliverWithOutbox({
      platform: this.id,
      chatId,
      kind: 'edit',
      label: 'whatsapp_edit',
      correlationId: delivery?.correlationId,
      instanceKey,
    }, async () => {
      await this.localizedSocket(chatId, delivery).sendMessage(chatId, {
        text,
        edit: { remoteJid: chatId, fromMe: true, id: messageId },
      })
    }), { instanceKey })
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
    await trackedAdapterOperation('whatsapp', 'typing', () =>
      this.socket.sendPresenceUpdate(active ? 'composing' : 'paused', chatId), { instanceKey })
  }

  async react(chatId: string, messageId: string, reaction: string, delivery?: DeliveryContext): Promise<void> {
    const instanceKey = whatsappOpsInstanceKey(this.botInstanceId)
    await trackedAdapterOperation('whatsapp', 'reaction', async () => {
      const remembered = this.messageCache.get(chatId, messageId)
      const key = remembered?.key ?? { remoteJid: chatId, fromMe: false, id: messageId }
      await this.localizedSocket(chatId, delivery).sendMessage(chatId, { react: { text: reaction, key } } as never)
    }, { instanceKey })
  }
}

export function whatsappBotInstanceId(instanceId?: number) {
  return typeof instanceId === 'number' ? `subbot-${instanceId}` : 'main'
}

export function createWhatsAppAdapter(socket: WASocket, instanceId?: number) {
  return new WhatsAppAdapter(socket, whatsappBotInstanceId(instanceId))
}
