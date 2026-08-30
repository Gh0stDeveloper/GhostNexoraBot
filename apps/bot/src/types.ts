import type { WAMessage, WASocket } from 'baileys'
import type { SettingsStore } from './core/settings.js'

/**
 * Project-local socket type.
 * Baileys supports message editing through the `edit` field, while the
 * installed typings in this project do not expose that field consistently.
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
  socket: NexoraSocket
  message: WAMessage
  chatId: string
  sender: string
  pushName: string
  commandName: string
  args: string[]
  argText: string
  prefix: string
  settings: SettingsStore
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
