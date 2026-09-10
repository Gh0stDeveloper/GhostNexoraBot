import type { WAMessage, WASocket } from 'baileys'
import type { NormalizedMessage, PlatformAdapter, PlatformId } from '@ghostnexora/platform-contracts'
import type { SettingsStore } from './core/settings.js'
import type { LocaleCode, TranslationValues } from './i18n/types.js'

/**
 * Project-local socket type retained as a V1 compatibility bridge.
 *
 * New shared command work must prefer `adapter` + `normalizedMessage`. Existing
 * WhatsApp-specific commands keep `socket`/`message` until they are migrated in
 * controlled batches, so Phase 1 does not break the current command registry.
 */
export type NexoraSocket = Omit<WASocket, 'sendMessage'> & {
  sendMessage: (...args: any[]) => Promise<any>
}

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

export interface CommandContext {
  /** Neutral V2 transport surface. */
  platform: PlatformId
  adapter: PlatformAdapter
  normalizedMessage: NormalizedMessage

  /** @deprecated V1 WhatsApp compatibility surface. */
  socket: NexoraSocket
  /** @deprecated V1 WhatsApp compatibility surface. */
  message: WAMessage

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
  reply: (text: string) => Promise<unknown>
  react: (emoji: string) => Promise<unknown>
}

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
  handler: (ctx: CommandContext) => Promise<unknown>
}
