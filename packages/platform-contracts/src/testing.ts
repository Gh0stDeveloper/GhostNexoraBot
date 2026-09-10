import {
  createPlatformCapabilities,
  normalizedUiToText,
  type NormalizedUi,
  type OutgoingMedia,
  type PlatformAdapter,
  type PlatformCapabilities,
  type PlatformId,
  type SendOptions,
  type SentMessage,
} from './index.js'

export type MemoryDelivery = {
  kind: 'text' | 'media' | 'ui' | 'edit' | 'typing' | 'reaction'
  chatId: string
  messageId?: string
  text?: string
  media?: OutgoingMedia
  ui?: NormalizedUi
  options?: SendOptions
  active?: boolean
  reaction?: string
}

export class MemoryPlatformAdapter implements PlatformAdapter {
  readonly capabilities: Readonly<PlatformCapabilities>
  readonly deliveries: MemoryDelivery[] = []
  private sequence = 0
  started = false

  constructor(
    readonly id: PlatformId = 'whatsapp',
    readonly botInstanceId = 'test',
    capabilities: Partial<PlatformCapabilities> = {},
  ) {
    this.capabilities = createPlatformCapabilities(capabilities)
  }

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.started = false
  }

  async sendText(chatId: string, text: string, options?: SendOptions): Promise<SentMessage> {
    const messageId = this.nextMessageId()
    this.deliveries.push({ kind: 'text', chatId, messageId, text, options })
    return { platform: this.id, chatId, messageId }
  }

  async sendMedia(chatId: string, media: OutgoingMedia, options?: SendOptions): Promise<SentMessage> {
    const messageId = this.nextMessageId()
    this.deliveries.push({ kind: 'media', chatId, messageId, media, options })
    return { platform: this.id, chatId, messageId }
  }

  async sendUi(chatId: string, ui: NormalizedUi, options?: SendOptions): Promise<SentMessage> {
    const messageId = this.nextMessageId()
    this.deliveries.push({ kind: 'ui', chatId, messageId, ui, text: normalizedUiToText(ui), options })
    return { platform: this.id, chatId, messageId }
  }

  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    this.deliveries.push({ kind: 'edit', chatId, messageId, text })
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    this.deliveries.push({ kind: 'typing', chatId, active })
  }

  async react(chatId: string, messageId: string, reaction: string): Promise<void> {
    this.deliveries.push({ kind: 'reaction', chatId, messageId, reaction })
  }

  clear(): void {
    this.deliveries.length = 0
  }

  private nextMessageId(): string {
    this.sequence += 1
    return `${this.id}-${this.botInstanceId}-${this.sequence}`
  }
}
