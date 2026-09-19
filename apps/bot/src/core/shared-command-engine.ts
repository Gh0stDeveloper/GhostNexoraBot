import {
  resolveCapabilityRequirements,
  type CapabilityName,
  type NormalizedMessage,
  type PlatformAdapter,
  type PlatformId,
} from '@ghostnexora/platform-contracts'
import type {
  BotCommand,
  CommandContext,
  LegacyCompatibleCommandContext,
  NeutralBotCommand,
} from '../types.js'
import type { SettingsStore } from './settings.js'
import type { LocaleCode, TranslationValues } from '../i18n/types.js'

export type SharedCommandContextInput = {
  platform: PlatformId
  adapter: PlatformAdapter
  normalizedMessage: NormalizedMessage
  commandName: string
  args: string[]
  prefix: string
  settings: SettingsStore
  locale: LocaleCode
  t: (key: string, values?: TranslationValues) => string
  isOwner: boolean
  isBotStaff: boolean
  isSubbotOwner?: boolean
  instanceId?: number
  instanceOwnerJid?: string
}

export type SharedCommandExecuteOptions = {
  allowLegacy?: boolean
  enforceMetadata?: boolean
  enforceCapabilities?: boolean
  isGroupAdmin?: boolean
  botIsGroupAdmin?: boolean
}

export type SharedCommandExecutionResult =
  | { executed: true; command: BotCommand; fallbackCapabilities: CapabilityName[] }
  | { executed: false; reason: 'not_found' | 'legacy_only'; command?: BotCommand }

export function createNeutralCommandContext(input: SharedCommandContextInput): CommandContext {
  const {
    platform,
    adapter,
    normalizedMessage,
    commandName,
    args,
    prefix,
    settings,
    locale,
    t,
    isOwner,
    isBotStaff,
    isSubbotOwner = false,
    instanceId,
    instanceOwnerJid,
  } = input
  const chatId = normalizedMessage.chatId
  const currentReplyTo = normalizedMessage.messageId || undefined
  const withCurrentReply = <T extends { replyTo?: string }>(options?: T) => ({
    ...options,
    replyTo: options?.replyTo ?? currentReplyTo,
  })
  const sendText: CommandContext['sendText'] = (text, options) =>
    adapter.sendText(chatId, text, withCurrentReply(options))
  const sendMedia: CommandContext['sendMedia'] = async (media, options) => {
    if (adapter.capabilities.files) return adapter.sendMedia(chatId, media, withCurrentReply(options))
    if (media.source.kind === 'url') {
      const fallbackText = [media.caption, media.source.value].filter(Boolean).join('\n')
      return adapter.sendText(chatId, fallbackText || media.source.value, withCurrentReply(options))
    }
    throw new Error(t('router.capabilityUnavailable', { platform, capabilities: 'files' }))
  }
  const sendUi: CommandContext['sendUi'] = (ui, options) =>
    adapter.sendUi(chatId, ui, withCurrentReply(options))
  const setTyping: CommandContext['setTyping'] = async (active) => {
    if (adapter.capabilities.typing && adapter.setTyping) await adapter.setTyping(chatId, active)
  }
  const editMessage: CommandContext['editMessage'] = async (messageId, text) => {
    if (adapter.capabilities.editMessage && adapter.editMessage) {
      await adapter.editMessage(chatId, messageId, text)
      return
    }
    await sendText(text)
  }
  const reply: CommandContext['reply'] = async (text) => {
    const sent = await sendText(text)
    return sent.raw
  }
  const react: CommandContext['react'] = async (reaction) => {
    if (!normalizedMessage.messageId || !adapter.capabilities.reactions || !adapter.react) return undefined
    await adapter.react(chatId, normalizedMessage.messageId, reaction)
    return undefined
  }

  return {
    platform,
    adapter,
    normalizedMessage,
    chatId,
    sender: normalizedMessage.senderId,
    pushName: normalizedMessage.pushName ?? normalizedMessage.senderId,
    commandName,
    args,
    argText: args.join(' '),
    prefix,
    settings,
    locale,
    t,
    isOwner,
    isBotStaff,
    isGroup: normalizedMessage.isGroup,
    isSubbotOwner,
    instanceId,
    instanceOwnerJid,
    reply,
    react,
    sendText,
    sendMedia,
    sendUi,
    setTyping,
    editMessage,
  }
}

function commandTokens(command: Pick<BotCommand, 'name' | 'aliases'>) {
  return [command.name, ...(command.aliases ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export class SharedCommandEngine {
  private readonly byName = new Map<string, BotCommand>()
  private readonly neutralNames = new Set<string>()

  constructor(commands: readonly BotCommand[], neutralCommands: readonly NeutralBotCommand[] = []) {
    for (const command of commands) {
      for (const token of commandTokens(command)) this.byName.set(token, command)
    }
    for (const command of neutralCommands) this.neutralNames.add(command.name.toLowerCase())
  }

  resolve(token: string) {
    return this.byName.get(token.trim().toLowerCase())
  }

  isNeutral(command: Pick<BotCommand, 'name'>) {
    return this.neutralNames.has(command.name.toLowerCase())
  }

  async execute(
    commandOrToken: BotCommand | string,
    context: CommandContext | LegacyCompatibleCommandContext,
    options: SharedCommandExecuteOptions = {},
  ): Promise<SharedCommandExecutionResult> {
    const command = typeof commandOrToken === 'string' ? this.resolve(commandOrToken) : commandOrToken
    if (!command) return { executed: false, reason: 'not_found' }
    if (!options.allowLegacy && !this.isNeutral(command)) {
      return { executed: false, reason: 'legacy_only', command }
    }

    const capabilityResolution = resolveCapabilityRequirements(
      context.adapter.capabilities,
      command.requiresCapabilities ?? [],
    )
    if (options.enforceCapabilities !== false && capabilityResolution.missing.length) {
      throw new Error(context.t('router.capabilityUnavailable', {
        platform: context.platform,
        capabilities: capabilityResolution.missing.join(', '),
      }))
    }

    if (options.enforceMetadata !== false) {
      if (command.ownerOnly && !context.isOwner) throw new Error(context.t('router.ownerOnly'))
      if (command.staffOnly && !context.isBotStaff && !(command.subbotOwnerAllowed && context.isSubbotOwner)) {
        throw new Error(context.t('router.staffOnly'))
      }
      if (command.groupOnly && !context.isGroup) throw new Error(context.t('router.groupOnly'))
      if (command.adminOnly && !context.isOwner && !context.isBotStaff && !context.isSubbotOwner && !options.isGroupAdmin) {
        throw new Error(context.t('router.adminOnly'))
      }
      if (command.botAdminOnly && context.isGroup && !options.botIsGroupAdmin) {
        throw new Error(context.t('router.botAdminOnly'))
      }
    }

    await command.handler(context as LegacyCompatibleCommandContext)
    return {
      executed: true,
      command,
      fallbackCapabilities: capabilityResolution.fallback.map((entry) => entry.name),
    }
  }
}
