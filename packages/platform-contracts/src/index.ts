export const PLATFORM_IDS = ['whatsapp', 'telegram', 'discord'] as const

export type PlatformId = typeof PLATFORM_IDS[number]
export type CapabilityName = Exclude<keyof PlatformCapabilities, 'maxUploadBytes'>

export type NormalizedMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export interface NormalizedMedia {
  kind: NormalizedMediaKind
  mimeType?: string
  fileName?: string
  sizeBytes?: number
  url?: string
  caption?: string
}

export interface NormalizedMessage {
  platform: PlatformId
  botInstanceId: string
  chatId: string
  senderId: string
  messageId: string
  text: string
  isGroup: boolean
  replyTo?: string
  pushName?: string
  media?: NormalizedMedia
  raw?: unknown
}

export interface PlatformCapabilities {
  editMessage: boolean
  reactions: boolean
  typing: boolean
  buttons: boolean
  carousel: boolean
  embeds: boolean
  files: boolean
  polls: boolean
  groupModeration: boolean
  maxUploadBytes: number
}

export type UiAction =
  | { kind: 'command'; label: string; value: string }
  | { kind: 'url'; label: string; value: string }

export interface UiItem {
  id: string
  title: string
  description?: string
  action?: UiAction
}

export interface UiCard {
  id: string
  title: string
  body?: string
  imageUrl?: string
  footer?: string
  buttons?: UiAction[]
}

export type NormalizedUi =
  | { kind: 'text'; text: string }
  | { kind: 'card'; title: string; body?: string; imageUrl?: string; footer?: string; buttons?: UiAction[] }
  | { kind: 'list'; title?: string; body?: string; items: UiItem[] }
  | { kind: 'carousel'; title?: string; cards: UiCard[] }

export type OutgoingMediaSource =
  | { kind: 'url'; value: string }
  | { kind: 'path'; value: string }
  | { kind: 'bytes'; value: Uint8Array }

export interface OutgoingMedia {
  kind: NormalizedMediaKind
  source: OutgoingMediaSource
  mimeType?: string
  fileName?: string
  caption?: string
}

export interface SendOptions {
  replyTo?: string
  mentions?: string[]
}

export interface SentMessage {
  platform: PlatformId
  chatId: string
  messageId: string
  raw?: unknown
}

export interface PlatformAdapter {
  readonly id: PlatformId
  readonly botInstanceId: string
  readonly capabilities: Readonly<PlatformCapabilities>

  start(): Promise<void>
  stop(): Promise<void>
  sendText(chatId: string, text: string, options?: SendOptions): Promise<SentMessage>
  sendMedia(chatId: string, media: OutgoingMedia, options?: SendOptions): Promise<SentMessage>
  sendUi(chatId: string, ui: NormalizedUi, options?: SendOptions): Promise<SentMessage>
  editMessage?(chatId: string, messageId: string, text: string): Promise<void>
  setTyping?(chatId: string, active: boolean): Promise<void>
  react?(chatId: string, messageId: string, reaction: string): Promise<void>
}

const DEFAULT_CAPABILITIES: PlatformCapabilities = {
  editMessage: false,
  reactions: false,
  typing: false,
  buttons: false,
  carousel: false,
  embeds: false,
  files: false,
  polls: false,
  groupModeration: false,
  maxUploadBytes: 0,
}

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (PLATFORM_IDS as readonly string[]).includes(value)
}

export function createPlatformCapabilities(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...overrides }
  if (!Number.isSafeInteger(capabilities.maxUploadBytes) || capabilities.maxUploadBytes < 0) {
    throw new TypeError('maxUploadBytes must be a non-negative safe integer')
  }
  return capabilities
}

export function supportsCapabilities(
  capabilities: Readonly<PlatformCapabilities>,
  required: readonly CapabilityName[] = [],
): boolean {
  return required.every((name) => capabilities[name] === true)
}

function actionText(action: UiAction): string {
  return action.kind === 'url'
    ? `${action.label}: ${action.value}`
    : `${action.label}: ${action.value}`
}

export function normalizedUiToText(ui: NormalizedUi): string {
  if (ui.kind === 'text') return ui.text

  if (ui.kind === 'card') {
    return [
      ui.title,
      ui.body,
      ...(ui.buttons ?? []).map(actionText),
      ui.footer,
    ].filter(Boolean).join('\n')
  }

  if (ui.kind === 'list') {
    const items = ui.items.map((item, index) => {
      const action = item.action ? ` — ${actionText(item.action)}` : ''
      const description = item.description ? ` — ${item.description}` : ''
      return `${index + 1}. ${item.title}${description}${action}`
    })
    return [ui.title, ui.body, ...items].filter(Boolean).join('\n')
  }

  const cards = ui.cards.map((card, index) => {
    const actions = (card.buttons ?? []).map(actionText)
    return [
      `${index + 1}. ${card.title}`,
      card.body,
      ...actions,
      card.footer,
    ].filter(Boolean).join('\n')
  })
  return [ui.title, ...cards].filter(Boolean).join('\n\n')
}
