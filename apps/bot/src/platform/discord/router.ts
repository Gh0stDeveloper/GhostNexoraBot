import type { NormalizedMessage } from '@ghostnexora/platform-contracts'
import { sharedNeutralCommands } from '../../commands/shared.js'
import { CommandEngine } from '../../core/command-engine.js'
import type { CommandContext } from '../../types.js'
import { settings } from '../../core/settings.js'
import {
  localizeLegacyText,
  resolvePlatformLocale,
  translate,
  type LocaleCode,
} from '../../i18n/index.js'
import { discordCommandAliases } from '../../services/command-platform-support.js'
import { commandRuntimeDecision, markCommandCooldown, resolveConfiguredCommandCategory } from '../../services/command-runtime-config.js'
import { performanceAudit } from '../../services/performance-audit.js'
import { logger } from '../../utils/logger.js'
import type { DiscordAdapter } from './adapter.js'
import { discordOwner, discordStaff } from './config.js'
import { normalizeDiscordMessage } from './normalize.js'
import type {
  DiscordApplicationCommandData,
  DiscordApplicationCommandDefinition,
  DiscordComponentInteractionData,
  DiscordInteraction,
  DiscordMessage,
  DiscordUser,
} from './types.js'

const aliases = discordCommandAliases

function localizedDescription(key: string) {
  return {
    description: translate('es', key),
    description_localizations: {
      'en-US': translate('en', key),
      'en-GB': translate('en', key),
      'es-ES': translate('es', key),
      'es-419': translate('es', key),
    },
  }
}

export const discordApplicationCommands: DiscordApplicationCommandDefinition[] = [
  { name: 'start', ...localizedDescription('discord.command.start') },
  { name: 'help', ...localizedDescription('discord.command.help') },
  { name: 'menu', ...localizedDescription('discord.command.menu') },
  { name: 'ping', ...localizedDescription('discord.command.ping') },
  { name: 'info', ...localizedDescription('discord.command.info') },
  { name: 'version', ...localizedDescription('discord.command.version') },
  {
    name: 'language',
    ...localizedDescription('discord.command.language'),
    options: [{
      type: 3,
      name: 'value',
      description: translate('es', 'discord.command.language.value'),
      description_localizations: {
        'en-US': translate('en', 'discord.command.language.value'),
        'en-GB': translate('en', 'discord.command.language.value'),
        'es-ES': translate('es', 'discord.command.language.value'),
        'es-419': translate('es', 'discord.command.language.value'),
      },
      required: false,
      max_length: 100,
    }],
  },
  {
    name: 'vk',
    ...localizedDescription('discord.command.vk'),
    options: [{
      type: 3,
      name: 'url',
      description: translate('es', 'discord.command.vk.url'),
      description_localizations: {
        'en-US': translate('en', 'discord.command.vk.url'),
        'en-GB': translate('en', 'discord.command.vk.url'),
        'es-ES': translate('es', 'discord.command.vk.url'),
        'es-419': translate('es', 'discord.command.vk.url'),
      },
      required: true,
      max_length: 1900,
    }],
  },
  {
    name: 'apkmirror',
    ...localizedDescription('discord.command.apkmirror'),
    options: [{
      type: 3,
      name: 'query',
      description: translate('es', 'discord.command.query'),
      description_localizations: {
        'en-US': translate('en', 'discord.command.query'),
        'en-GB': translate('en', 'discord.command.query'),
        'es-ES': translate('es', 'discord.command.query'),
        'es-419': translate('es', 'discord.command.query'),
      },
      required: true,
      max_length: 200,
    }],
  },
  {
    name: 'apkpure',
    ...localizedDescription('discord.command.apkpure'),
    options: [{
      type: 3,
      name: 'query',
      description: translate('es', 'discord.command.query'),
      description_localizations: {
        'en-US': translate('en', 'discord.command.query'),
        'en-GB': translate('en', 'discord.command.query'),
        'es-ES': translate('es', 'discord.command.query'),
        'es-419': translate('es', 'discord.command.query'),
      },
      required: true,
      max_length: 200,
    }],
  },
  { name: 'providerhealth', ...localizedDescription('discord.command.providerhealth') },
  { name: 'discordstatus', ...localizedDescription('discord.command.status') },
]

type Invocation = {
  command: string
  argText: string
  channelId: string
  messageId?: string
  user: DiscordUser
  guildId?: string
  source: 'message' | 'slash' | 'component'
  clientLocale?: string
}

type RuntimeStatusProvider = () => Record<string, unknown>

function t(locale: LocaleCode, key: string, values: Record<string, string | number | boolean | null | undefined> = {}) { return translate(locale, key, values) }

function splitCommand(raw: string) {
  let clean = raw.trim()
  if (clean.startsWith(settings.prefix)) clean = clean.slice(settings.prefix.length).trim()
  else if (clean.startsWith('/')) clean = clean.slice(1).trim()
  const firstSpace = clean.search(/\s/)
  const name = (firstSpace < 0 ? clean : clean.slice(0, firstSpace)).toLowerCase()
  return {
    rawName: name,
    command: aliases.get(name),
    argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(),
  }
}

function parseMessageCommand(message: DiscordMessage, botUserId?: string) {
  let text = message.content.trim()
  if (!text) return undefined

  let mentioned = false
  if (botUserId) {
    const mention = new RegExp(`^<@!?${botUserId}>\\s*`)
    if (mention.test(text)) {
      mentioned = true
      text = text.replace(mention, '').trim()
    }
  }

  let body = text
  if (body.startsWith(settings.prefix)) body = body.slice(settings.prefix.length)
  else if (body.startsWith('/')) body = body.slice(1)
  else if (!mentioned) return undefined

  const parsed = splitCommand(body)
  if (!parsed.rawName) return undefined
  return parsed
}

function interactionUser(interaction: DiscordInteraction) {
  return interaction.member?.user || interaction.user
}

function commandArgText(data: DiscordApplicationCommandData) {
  const values: string[] = []
  const visit = (options = data.options ?? []) => {
    for (const option of options) {
      if (option.value !== undefined) values.push(String(option.value))
      if (option.options?.length) visit(option.options)
    }
  }
  visit()
  return values.join(' ').trim()
}

export class DiscordCommandRouter {
  private botUserId?: string
  private readonly engine = new CommandEngine<CommandContext>(sharedNeutralCommands)

  constructor(
    private readonly adapter: DiscordAdapter,
    botUserId?: string,
    private readonly statusProvider: RuntimeStatusProvider = () => ({}),
  ) {
    this.botUserId = botUserId
  }

  setBotUserId(botUserId: string) { this.botUserId = botUserId }

  private locale(invocation: Pick<Invocation, 'channelId' | 'user' | 'clientLocale'>) {
    return resolvePlatformLocale({
      platform: 'discord',
      botInstanceId: this.adapter.botInstanceId,
      chatId: invocation.channelId,
      userId: invocation.user.id,
      clientLocale: invocation.clientLocale,
    })
  }

  private commandContext(
    invocation: Invocation,
    commandName: string,
    locale: LocaleCode,
    isOwner: boolean,
    isStaff: boolean,
  ): CommandContext {
    const replyTo = invocation.messageId
    const normalizedMessage: NormalizedMessage = {
      platform: 'discord',
      botInstanceId: this.adapter.botInstanceId,
      chatId: invocation.channelId,
      senderId: `discord:${invocation.user.id}`,
      messageId: invocation.messageId ?? `discord-${invocation.source}-${Date.now()}`,
      text: [commandName, invocation.argText].filter(Boolean).join(' '),
      isGroup: Boolean(invocation.guildId),
      pushName: invocation.user.global_name ?? invocation.user.username,
      raw: invocation,
    }
    const withReply = <T extends { replyTo?: string }>(options?: T) => ({
      ...options,
      replyTo: options?.replyTo ?? replyTo,
    })
    const sendText: CommandContext['sendText'] = (value, options) =>
      this.adapter.sendText(invocation.channelId, value, withReply(options))
    const sendMedia: CommandContext['sendMedia'] = (media, options) =>
      this.adapter.sendMedia(invocation.channelId, media, withReply(options))
    const sendUi: CommandContext['sendUi'] = (ui, options) =>
      this.adapter.sendUi(invocation.channelId, ui, withReply(options))
    const reply: CommandContext['reply'] = async (value) => (await sendText(value)).raw
    const react: CommandContext['react'] = async (emoji) => {
      if (!replyTo || !this.adapter.react) return undefined
      return this.adapter.react(invocation.channelId, replyTo, emoji)
    }

    return {
      platform: 'discord',
      adapter: this.adapter,
      normalizedMessage,
      chatId: invocation.channelId,
      sender: `discord:${invocation.user.id}`,
      pushName: invocation.user.global_name ?? invocation.user.username,
      commandName,
      args: invocation.argText.trim().split(/\s+/).filter(Boolean),
      argText: invocation.argText,
      prefix: '/',
      settings,
      locale,
      t: (key, values = {}) => translate(locale, key, values),
      isOwner,
      isBotStaff: isStaff,
      isGroup: Boolean(invocation.guildId),
      isGroupAdmin: isStaff,
      isBotGroupAdmin: false,
      isSubbotOwner: false,
      reply,
      react,
      sendText,
      sendMedia,
      sendUi,
      setTyping: async (active) => {
        if (this.adapter.setTyping) await this.adapter.setTyping(invocation.channelId, active)
      },
      editMessage: async (messageId, value) => {
        if (!this.adapter.editMessage) throw new Error('Discord no soporta edición en este adapter.')
        await this.adapter.editMessage(invocation.channelId, messageId, value)
      },
    }
  }

  private async execute(invocation: Invocation) {
    const locale = this.locale(invocation)
    const isOwner = discordOwner(invocation.user.id)
    const isStaff = discordStaff(invocation.user.id)
    const sharedCommand = this.engine.resolve(invocation.command)

    if (sharedCommand) {
      await this.adapter.setTyping?.(invocation.channelId, true).catch(() => undefined)
      try {
        const ctx = this.commandContext(invocation, sharedCommand.name, locale, isOwner, isStaff)
        await this.engine.execute(sharedCommand, ctx, {
          auditIdentity: {
            userJid: ctx.sender,
            displayName: invocation.user.global_name ?? invocation.user.username,
          },
        })
        return true
      } catch (error) {
        logger.warn({ error, chatId: invocation.channelId, command: sharedCommand.name }, 'Discord shared command failed')
        const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
        await this.adapter.sendText(
          invocation.channelId,
          t(locale, 'discord.error.public', { error: publicError }),
          invocation.messageId ? { replyTo: invocation.messageId } : undefined,
        ).catch(() => undefined)
        return true
      }
    }

    if (invocation.command !== 'discordstatus') return false

    const category = resolveConfiguredCommandCategory(invocation.command, 'owner')
    const runtimeDecision = commandRuntimeDecision({
      commandName: invocation.command,
      category,
      platform: 'discord',
      isGroup: Boolean(invocation.guildId),
      userId: invocation.user.id,
      isOwner,
      isStaff,
    })
    if (!runtimeDecision.allowed) {
      const message = runtimeDecision.reason === 'disabled'
        ? t(locale, 'router.commandDisabled')
        : runtimeDecision.reason === 'category_disabled'
          ? t(locale, 'router.commandCategoryDisabled', { category })
          : runtimeDecision.reason === 'platform_disabled'
            ? t(locale, 'router.commandPlatformDisabled', { platform: 'Discord' })
            : runtimeDecision.reason === 'groups_disabled'
              ? t(locale, 'router.commandGroupsDisabled')
              : runtimeDecision.reason === 'private_disabled'
                ? t(locale, 'router.commandPrivateDisabled')
                : runtimeDecision.reason === 'permission'
                  ? t(locale, 'router.commandPermission')
                  : t(locale, 'router.commandCooldown', { seconds: Math.max(1, Math.ceil(Number(runtimeDecision.remainingMs ?? 0) / 1000)) })
      await this.adapter.sendText(invocation.channelId, message, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      return true
    }

    if (!isStaff && runtimeDecision.config.cooldownMs > 0) {
      markCommandCooldown('discord', runtimeDecision.commandName, invocation.user.id)
    }

    const auditStarted = performance.now()
    try {
      if (!isOwner) throw new Error(t(locale, 'common.ownerRequired', { platform: 'Discord' }))
      const status = this.statusProvider()
      await this.adapter.sendText(
        invocation.channelId,
        [t(locale, 'discord.runtime.title'), ...Object.entries(status).map(([key, value]) => t(locale, 'discord.status.line', { key, value: String(value) }))].join('\n'),
        invocation.messageId ? { replyTo: invocation.messageId } : undefined,
      )
      try {
        performanceAudit.recordRuntimeCommand(invocation.command, performance.now() - auditStarted, true, undefined, {
          userJid: `discord:${invocation.user.id}`,
          displayName: invocation.user.global_name ?? invocation.user.username,
        })
      } catch {}
      return true
    } catch (error) {
      try {
        performanceAudit.recordRuntimeCommand(invocation.command, performance.now() - auditStarted, false, undefined, {
          userJid: `discord:${invocation.user.id}`,
          displayName: invocation.user.global_name ?? invocation.user.username,
        })
      } catch {}
      logger.warn({ error, chatId: invocation.channelId, command: invocation.command }, 'Discord command failed')
      const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
      await this.adapter.sendText(
        invocation.channelId,
        t(locale, 'discord.error.public', { error: publicError }),
        invocation.messageId ? { replyTo: invocation.messageId } : undefined,
      ).catch(() => undefined)
      return true
    }
  }

  async handleMessage(message: DiscordMessage) {
    if (message.author.bot) return false
    const normalized = normalizeDiscordMessage(message, this.adapter.botInstanceId)
    const parsed = parseMessageCommand(message, this.botUserId)
    if (!parsed) return false
    const locale = resolvePlatformLocale({
      platform: 'discord',
      botInstanceId: this.adapter.botInstanceId,
      chatId: normalized.chatId,
      userId: message.author.id,
    })
    if (!parsed.command) {
      await this.adapter.sendText(normalized.chatId, t(locale, 'common.commandUnavailable', { platform: 'Discord', command: parsed.rawName, help: '/help' }), { replyTo: normalized.messageId })
      return true
    }
    return this.execute({
      command: parsed.command,
      argText: parsed.argText,
      channelId: normalized.chatId,
      messageId: normalized.messageId,
      user: message.author,
      guildId: message.guild_id,
      source: 'message',
    })
  }

  async handleInteraction(interaction: DiscordInteraction) {
    const user = interactionUser(interaction)
    const channelId = interaction.channel_id
    if (!user || user.bot || !channelId || !interaction.data) return false
    const clientLocale = interaction.locale || interaction.guild_locale

    if (interaction.type === 2) {
      const data = interaction.data as DiscordApplicationCommandData
      const command = aliases.get(data.name.toLowerCase())
      if (!command) return false
      return this.execute({
        command,
        argText: commandArgText(data),
        channelId,
        user,
        guildId: interaction.guild_id,
        source: 'slash',
        clientLocale,
      })
    }

    if (interaction.type === 3) {
      const data = interaction.data as DiscordComponentInteractionData
      const raw = this.adapter.resolveComponentCustomId(data.custom_id)
      if (!raw) {
        const locale = resolvePlatformLocale({
          platform: 'discord',
          botInstanceId: this.adapter.botInstanceId,
          chatId: channelId,
          userId: user.id,
          clientLocale,
        })
        await this.adapter.sendText(channelId, t(locale, 'discord.component.expired'))
        return true
      }
      const parsed = splitCommand(raw)
      if (!parsed.command) return false
      return this.execute({
        command: parsed.command,
        argText: parsed.argText,
        channelId,
        user,
        guildId: interaction.guild_id,
        source: 'component',
        clientLocale,
      })
    }

    return false
  }
}
