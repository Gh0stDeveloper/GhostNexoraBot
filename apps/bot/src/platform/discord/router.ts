import { resolveCapabilityRequirements, type NormalizedUi } from '@ghostnexora/platform-contracts'
import { config } from '../../config.js'
import { settings } from '../../core/settings.js'
import {
  clearPlatformLocale,
  localizeLegacyText,
  localeName,
  platformLocalePreference,
  resolvePlatformLocale,
  setPlatformLocale,
  translate,
  type LocaleCode,
} from '../../i18n/index.js'
import { isSupportedLocale } from '../../i18n/types.js'
import { downloadPhase3Apk, searchApkMirror, searchApkPure, type Phase3ApkStore } from '../../services/download-providers/apk-stores.js'
import { withProviderLease } from '../../services/download-providers/lease.js'
import { providerHealthSnapshot } from '../../services/download-providers/runtime.js'
import { downloadVkVideo } from '../../services/download-providers/vk.js'
import { discordCommandAliases } from '../../services/command-platform-support.js'
import {
  commandMetadataForPlatformToken,
  commandMetadataVisibleTo,
  discordSlashCommandTokens,
  platformCommandMetadata,
} from '../../services/command-metadata.js'
import { commandRuntimeDecision, markCommandCooldown, resolveConfiguredCommandCategory } from '../../services/command-runtime-config.js'
import { performanceAudit } from '../../services/performance-audit.js'
import { logger } from '../../utils/logger.js'
import { createNeutralCommandContext, SharedCommandEngine } from '../../core/shared-command-engine.js'
import { createRequestContext } from '../../core/request-context.js'
import { sharedNeutralCommands } from '../../commands/shared-neutral.js'
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
const sharedCommandEngine = new SharedCommandEngine(sharedNeutralCommands, sharedNeutralCommands)

function slashDescription(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return (normalized || 'Ghost Nexora Bot command').slice(0, 100)
}

function localizedSlashDescription(value: string, key?: string) {
  const es = slashDescription(key ? translate('es', key) : value)
  const en = slashDescription(key ? translate('en', key) : value)
  return {
    description: es,
    description_localizations: {
      'en-US': en,
      'en-GB': en,
      'es-ES': es,
      'es-419': es,
    },
  }
}

export const discordApplicationCommands: DiscordApplicationCommandDefinition[] = discordSlashCommandTokens()
  .flatMap((token): DiscordApplicationCommandDefinition[] => {
    const metadata = commandMetadataForPlatformToken('discord', token)
    if (!metadata) return []
    const options = metadata.arguments.map((argument) => ({
      type: 3 as const,
      name: argument.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32),
      ...localizedSlashDescription(argument.description || argument.name, argument.descriptionKey),
      required: argument.required === true,
      ...(argument.maxLength ? { max_length: argument.maxLength } : {}),
    }))
    return [{
      name: token,
      ...localizedSlashDescription(metadata.description, metadata.descriptionKey),
      ...(options.length ? { options } : {}),
    }]
  })

type Invocation = {
  command: string
  argText: string
  channelId: string
  messageId?: string
  requestMessageId: string
  user: DiscordUser
  guildId?: string
  source: 'message' | 'slash' | 'component'
  clientLocale?: string
}

type RuntimeStatusProvider = () => Record<string, unknown>

function humanBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function storeLabel(store: Phase3ApkStore) { return store === 'apkmirror' ? 'APKMirror' : 'APKPure' }
function t(locale: LocaleCode, key: string, values: Record<string, string | number | boolean | null | undefined> = {}) { return translate(locale, key, values) }

function parseLocale(raw?: string): LocaleCode | null {
  const value = raw?.trim().toLowerCase()
  if (!value) return null
  if (['español', 'espanol', 'spanish'].includes(value)) return 'es'
  if (['inglés', 'ingles', 'english'].includes(value)) return 'en'
  return isSupportedLocale(value) ? value : null
}

function inheritValue(raw?: string) {
  return ['inherit', 'heredar', 'default', 'auto', 'clear', 'reset'].includes(raw?.trim().toLowerCase() ?? '')
}

function splitCommand(raw: string) {
  const clean = raw.trim()
  const firstSpace = clean.search(/\s/)
  const name = (firstSpace < 0 ? clean : clean.slice(0, firstSpace)).toLowerCase()
  return {
    rawName: name,
    command: aliases.get(name) ?? sharedCommandEngine.resolve(name)?.name,
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

async function progress(adapter: DiscordAdapter, channelId: string, replyTo: string | undefined, subject: string, locale: LocaleCode) {
  const sent = await adapter.sendText(channelId, `${subject}\n${t(locale, 'common.preparing')}`, replyTo ? { replyTo } : undefined)
  return async (stage: string) => adapter.editMessage?.(channelId, sent.messageId, `${subject}\n${stage}`).catch(() => undefined)
}

export class DiscordCommandRouter {
  private botUserId?: string

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

  private async help(invocation: Invocation, locale: LocaleCode) {
    const visibility = {
      isOwner: discordOwner(invocation.user.id),
      isStaff: discordStaff(invocation.user.id),
      isGroup: Boolean(invocation.guildId),
    }
    const items = platformCommandMetadata('discord')
      .filter((metadata) => commandMetadataVisibleTo(metadata, visibility))
      .map((metadata) => ({
        id: metadata.name,
        title: `/${metadata.usage || metadata.name}`,
        description: metadata.descriptionKey ? translate(locale, metadata.descriptionKey) : metadata.description,
        action: { kind: 'command' as const, label: metadata.name, value: metadata.name },
      }))
    const ui: NormalizedUi = {
      kind: 'list',
      title: `${config.botName} · Discord`,
      body: t(locale, 'discord.help.body'),
      items,
    }
    await this.adapter.sendUi(invocation.channelId, ui, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
  }

  private async language(invocation: Invocation, locale: LocaleCode) {
    const platform = { platform: 'discord' as const, botInstanceId: this.adapter.botInstanceId }
    const args = invocation.argText.trim().split(/\s+/).filter(Boolean)
    let scope: 'user' | 'chat' | 'bot' = 'user'
    let value = args[0] ?? ''
    if (['user', 'usuario', 'me', 'personal'].includes(value.toLowerCase())) { scope = 'user'; value = args[1] ?? '' }
    else if (['chat', 'group', 'grupo'].includes(value.toLowerCase())) { scope = 'chat'; value = args[1] ?? '' }
    else if (['bot', 'platform', 'plataforma'].includes(value.toLowerCase())) { scope = 'bot'; value = args[1] ?? '' }

    if (!invocation.argText.trim() || ['status', 'estado', 'current', 'actual'].includes(value.toLowerCase())) {
      const user = platformLocalePreference(platform, 'user', invocation.user.id)
      const chat = platformLocalePreference(platform, 'chat', invocation.channelId)
      const bot = platformLocalePreference(platform, 'bot', 'self')
      const effective = this.locale(invocation)
      await this.adapter.sendText(invocation.channelId, [
        t(effective, 'language.status.title'),
        '━━━━━━━━━━━━━━',
        `${t(effective, 'language.status.user')}: ${user ? `${localeName(user, effective)} (${user})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.chat')}: ${chat ? `${localeName(chat, effective)} (${chat})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.bot')}: ${bot ? `${localeName(bot, effective)} (${bot})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.effective')}: ${localeName(effective, effective)} (${effective})`,
        '',
        t(effective, 'language.usage.phase6', { command: '/language' }),
      ].join('\n'), invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      return
    }

    if ((scope === 'chat' || scope === 'bot') && !discordStaff(invocation.user.id)) {
      throw new Error(t(locale, scope === 'chat' ? 'language.error.chatPermission' : 'language.error.botPermission'))
    }
    const scopeId = scope === 'user' ? invocation.user.id : scope === 'chat' ? invocation.channelId : 'self'
    if (inheritValue(value)) {
      clearPlatformLocale(platform, scope, scopeId)
      const next = this.locale(invocation)
      const key = scope === 'user' ? 'language.changed.userInherit' : scope === 'chat' ? 'language.changed.chatInherit' : 'language.changed.botInherit'
      await this.adapter.sendText(invocation.channelId, t(next, key), invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      return
    }
    const nextLocale = parseLocale(value)
    if (!nextLocale) throw new Error(t(locale, 'language.error.invalid'))
    setPlatformLocale(platform, scope, scopeId, nextLocale)
    const key = scope === 'user' ? 'language.changed.user' : scope === 'chat' ? 'language.changed.chat' : 'language.changed.bot'
    await this.adapter.sendText(invocation.channelId, t(nextLocale, key, { language: localeName(nextLocale, nextLocale) }), invocation.messageId ? { replyTo: invocation.messageId } : undefined)
  }

  private async store(invocation: Invocation, store: Phase3ApkStore, locale: LocaleCode) {
    if (!invocation.argText) throw new Error(t(locale, 'common.storeUsage', { store }))
    const results = store === 'apkmirror' ? await searchApkMirror(invocation.argText) : await searchApkPure(invocation.argText)
    const command = store === 'apkmirror' ? 'apkmirrordl' : 'apkpuredl'
    const ui: NormalizedUi = {
      kind: 'carousel',
      title: `${storeLabel(store)} · ${t(locale, 'common.results')}`,
      cards: results.map((item) => ({
        id: item.token,
        title: item.name,
        body: [
          item.packageName && `${t(locale, 'common.package')}: ${item.packageName}`,
          item.version && `${t(locale, 'common.version')}: ${item.version}`,
          item.sizeLabel && `${t(locale, 'common.size')}: ${item.sizeLabel}`,
        ].filter(Boolean).join('\n') || t(locale, 'common.availableRelease'),
        imageUrl: item.icon,
        footer: storeLabel(store),
        buttons: [{ kind: 'command', label: t(locale, 'common.download'), value: `${command} ${item.token}` }],
      })),
    }
    await this.adapter.sendUi(invocation.channelId, ui, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
  }

  private async storeDownload(invocation: Invocation, store: Phase3ApkStore, locale: LocaleCode) {
    const token = invocation.argText.split(/\s+/)[0] || ''
    if (!token) throw new Error(t(locale, 'common.storeSelectFirst', { store }))
    const update = await progress(this.adapter, invocation.channelId, invocation.messageId, `${storeLabel(store)} · Android`, locale)
    await update(t(locale, store === 'apkmirror' ? 'common.storeResolvingMirror' : 'common.storeResolvingSigned'))
    const result = store === 'apkmirror'
      ? await withProviderLease('apkmirror', () => downloadPhase3Apk(token))
      : await downloadPhase3Apk(token)
    try {
      if (result.store !== store) throw new Error(t(locale, 'common.storeWrongToken'))
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(t(locale, 'common.storeUploadLimit', { size: humanBytes(result.size), platform: 'Discord', limit: humanBytes(this.adapter.capabilities.maxUploadBytes) }))
      }
      await update(t(locale, 'common.sending', { value: `${result.packageKind} · ${humanBytes(result.size)}` }))
      await this.adapter.sendMedia(invocation.channelId, {
        kind: 'document',
        source: { kind: 'path', value: result.filePath },
        mimeType: result.packageKind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip',
        fileName: result.fileName,
        caption: [
          `${storeLabel(store)} · ${result.item.name}`,
          result.item.packageName && `${t(locale, 'common.package')}: ${result.item.packageName}`,
          result.item.version && `${t(locale, 'common.version')}: ${result.item.version}`,
          `${t(locale, 'common.format')}: ${result.packageKind}`,
          `${t(locale, 'common.size')}: ${humanBytes(result.size)}`,
        ].filter(Boolean).join('\n'),
      }, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      await update(t(locale, 'common.sent', { value: result.packageKind }))
    } finally {
      await result.cleanup()
    }
  }

  private async vk(invocation: Invocation, locale: LocaleCode) {
    try { new URL(invocation.argText) } catch { throw new Error(t(locale, 'common.vkUsage')) }
    const update = await progress(this.adapter, invocation.channelId, invocation.messageId, 'VK Video', locale)
    await update(t(locale, 'common.vkResolving'))
    const result = await downloadVkVideo(invocation.argText)
    try {
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(t(locale, 'common.vkUploadLimit', { size: humanBytes(result.size), platform: 'Discord' }))
      }
      await update(t(locale, 'common.sending', { value: humanBytes(result.size) }))
      await this.adapter.sendMedia(invocation.channelId, {
        kind: 'video',
        source: { kind: 'path', value: result.filePath },
        mimeType: 'video/mp4',
        fileName: 'vk-video.mp4',
        caption: `VK Video · ${result.quality ? `${result.quality}p · ` : ''}${humanBytes(result.size)}`,
      }, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      await update(t(locale, 'common.videoSent'))
    } finally {
      await result.cleanup()
    }
  }

  private async execute(invocation: Invocation) {
    const locale = this.locale(invocation)
    const isOwner = discordOwner(invocation.user.id)
    const isStaff = discordStaff(invocation.user.id)
    const request = createRequestContext({
      platform: 'discord',
      botInstanceId: this.adapter.botInstanceId,
      chatId: invocation.channelId,
      userId: `discord:${invocation.user.id}`,
      locale,
      messageId: invocation.requestMessageId,
      permissions: {
        isOwner,
        isStaff,
        isGroup: Boolean(invocation.guildId),
        isGroupAdmin: false,
        isBotGroupAdmin: false,
        isInstanceOwner: false,
      },
    })
    const sharedCommand = sharedCommandEngine.resolve(invocation.command)
    if (!sharedCommand) {
      const metadata = commandMetadataForPlatformToken('discord', invocation.command)
      const capabilityResolution = resolveCapabilityRequirements(
        this.adapter.capabilities,
        metadata?.requiredCapabilities ?? [],
      )
      if (capabilityResolution.missing.length) {
        await this.adapter.sendText(
          invocation.channelId,
          t(locale, 'router.capabilityUnavailable', {
            platform: 'Discord',
            capabilities: capabilityResolution.missing.join(', '),
          }),
          invocation.messageId ? { replyTo: invocation.messageId } : undefined,
        )
        return true
      }
    }
    const category = sharedCommand?.category ?? resolveConfiguredCommandCategory(invocation.command)
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
    await this.adapter.setTyping?.(invocation.channelId, true).catch(() => undefined)
    try {
      if (sharedCommand) {
        const args = invocation.argText.trim() ? invocation.argText.trim().split(/\\s+/) : []
        const normalizedMessage = {
          platform: 'discord' as const,
          botInstanceId: this.adapter.botInstanceId,
          chatId: invocation.channelId,
          senderId: `discord:${invocation.user.id}`,
          messageId: invocation.requestMessageId,
          text: [invocation.command, invocation.argText].filter(Boolean).join(' '),
          isGroup: Boolean(invocation.guildId),
          pushName: invocation.user.global_name ?? invocation.user.username,
        }
        const context = createNeutralCommandContext({
          request,
          adapter: this.adapter,
          normalizedMessage,
          replyToMessageId: invocation.messageId ?? null,
          commandName: sharedCommand.name,
          args,
          prefix: '/',
          settings,
          t: (key, values = {}) => translate(locale, key, values),
        })
        const result = await sharedCommandEngine.execute(sharedCommand, context, { enforceMetadata: true })
        if (!result.executed) throw new Error(t(locale, 'common.commandUnavailable', { platform: 'Discord', command: invocation.command, help: '/help' }))
      } else if (invocation.command === 'help') await this.help(invocation, locale)
      else if (invocation.command === 'language') await this.language(invocation, locale)
      else if (invocation.command === 'vk') await this.vk(invocation, locale)
      else if (invocation.command === 'apkmirror') await this.store(invocation, 'apkmirror', locale)
      else if (invocation.command === 'apkpure') await this.store(invocation, 'apkpure', locale)
      else if (invocation.command === 'apkmirrordl') await this.storeDownload(invocation, 'apkmirror', locale)
      else if (invocation.command === 'apkpuredl') await this.storeDownload(invocation, 'apkpure', locale)
      else if (invocation.command === 'providerhealth') {
        if (!discordStaff(invocation.user.id)) throw new Error(t(locale, 'common.staffRequired', { platform: 'Discord' }))
        const rows = providerHealthSnapshot()
        await this.adapter.sendText(invocation.channelId, rows.length
          ? ['PROVIDER HEALTH', ...rows.map((row) => `${row.provider}: ${row.successes}/${row.attempts} OK · ${t(locale, 'common.providerFailures')} ${row.failures}${row.lastError ? ` · ${localizeLegacyText(row.lastError, locale)}` : ''}`)].join('\n')
          : t(locale, 'common.providerAttemptsEmpty'))
      } else if (invocation.command === 'discordstatus') {
        if (!discordOwner(invocation.user.id)) throw new Error(t(locale, 'common.ownerRequired', { platform: 'Discord' }))
        const status = this.statusProvider()
        await this.adapter.sendText(invocation.channelId, [t(locale, 'discord.runtime.title'), ...Object.entries(status).map(([key, value]) => t(locale, 'discord.status.line', { key, value: String(value) }))].join('\n'))
      }
      try {
        performanceAudit.recordRuntimeCommand(invocation.command, performance.now() - auditStarted, true, undefined, {
          userJid: invocation.user.id,
          displayName: invocation.user.global_name ?? invocation.user.username,
        })
      } catch {}
      return true
    } catch (error) {
      try {
        performanceAudit.recordRuntimeCommand(invocation.command, performance.now() - auditStarted, false, undefined, {
          userJid: invocation.user.id,
          displayName: invocation.user.global_name ?? invocation.user.username,
        })
      } catch {}
      logger.warn({
        error,
        chatId: invocation.channelId,
        command: invocation.command,
        correlationId: request.correlationId,
      }, 'Discord command failed')
      const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
      await this.adapter.sendText(invocation.channelId, t(locale, 'discord.error.public', { error: publicError }), invocation.messageId ? { replyTo: invocation.messageId } : undefined).catch(() => undefined)
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
      requestMessageId: normalized.messageId,
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
      const command = aliases.get(data.name.toLowerCase()) ?? sharedCommandEngine.resolve(data.name)?.name
      if (!command) return false
      return this.execute({
        command,
        argText: commandArgText(data),
        channelId,
        requestMessageId: interaction.id,
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
        requestMessageId: interaction.id,
        user,
        guildId: interaction.guild_id,
        source: 'component',
        clientLocale,
      })
    }

    return false
  }
}
