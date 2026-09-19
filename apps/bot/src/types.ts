import type {
  NormalizedMessage,
  NormalizedUi,
  OutgoingMedia,
  PlatformAdapter,
  PlatformId,
  SendOptions,
  SentMessage,
} from '@ghostnexora/platform-contracts'
import type { LegacyWhatsAppCommandContext } from './core/legacy-whatsapp-command-context.js'
import type { SettingsStore } from './core/settings.js'
import type { LocaleCode, TranslationValues } from './i18n/types.js'

export type { NexoraSocket } from './core/legacy-whatsapp-command-context.js'

export type CommandCategory =
  | 'general'
  | 'profile'
  | 'social'
  | 'stickers'
  | 'downloads'
  | 'groups'
  | 'economy'
  | 'games'
  | 'collection'
  | 'subbots'
  | 'adult'
  | 'tools'
  | 'owner'

/**
 * Neutral command execution contract.
 *
 * B1 intentionally keeps Baileys outside this interface. Commands migrated to
 * this surface can execute through any PlatformAdapter without knowing about a
 * WhatsApp socket or WAMessage.
 */
export interface CommandContext {
  platform: PlatformId
  adapter: PlatformAdapter
  normalizedMessage: NormalizedMessage

  chatId: string
  sender: string
  pushName: string
  commandName: string
  args: string[]
  argText: string
  prefix: string
  settings: SettingsStore
  locale: LocaleCode
  t: (key: string, values?: TranslationValues) => string
  isOwner: boolean
  isBotStaff: boolean
  isGroup: boolean
  isSubbotOwner: boolean
  instanceId?: number
  instanceOwnerJid?: string

  /** Reply to the incoming normalized message. */
  reply: (text: string) => Promise<unknown>
  /** React to the incoming normalized message when the platform supports it. */
  react: (emoji: string) => Promise<unknown>

  /** Neutral transport helpers bound to the current chat. */
  sendText: (text: string, options?: SendOptions) => Promise<SentMessage>
  sendMedia: (media: OutgoingMedia, options?: SendOptions) => Promise<SentMessage>
  sendUi: (ui: NormalizedUi, options?: SendOptions) => Promise<SentMessage>
  setTyping: (active: boolean) => Promise<void>
  editMessage: (messageId: string, text: string) => Promise<void>
}

/**
 * Transitional handler type while the existing WhatsApp command catalog is
 * migrated in controlled batches.
 *
 * New commands should type against CommandContext and must not use socket /
 * message. Existing V1 commands continue compiling until their B1/B2 migration.
 */
export type LegacyCompatibleCommandContext = CommandContext & LegacyWhatsAppCommandContext

export interface BotCommand {
  name: string
  aliases?: string[]
  category: CommandCategory
  description: string
  usage?: string
  ownerOnly?: boolean
  staffOnly?: boolean
  subbotOwnerAllowed?: boolean
  groupOnly?: boolean
  adminOnly?: boolean
  botAdminOnly?: boolean
  handler: (ctx: LegacyCompatibleCommandContext) => Promise<unknown>
}

/**
 * Command definition for modules that completed the B1 transport migration.
 * Its handler cannot access the Baileys compatibility surface at compile time.
 */
export interface NeutralBotCommand extends Omit<BotCommand, 'handler'> {
  handler: (ctx: CommandContext) => Promise<unknown>
}
