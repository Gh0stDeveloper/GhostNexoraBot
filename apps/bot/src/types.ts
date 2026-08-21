import type { WAMessage, WASocket } from 'baileys'
import type { SettingsStore } from './core/settings.js'

export type CommandCategory = 'general' | 'stickers' | 'downloads' | 'groups' | 'economy' | 'collection' | 'subbots' | 'adult' | 'owner'

export interface CommandContext {
  socket: WASocket
  message: WAMessage
  chatId: string
  sender: string
  pushName: string
  commandName: string
  args: string[]
  argText: string
  prefix: string
  settings: SettingsStore
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
  groupOnly?: boolean
  adminOnly?: boolean
  botAdminOnly?: boolean
  handler: (ctx: CommandContext) => Promise<void>
}
