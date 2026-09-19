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
import { telegramBridgeStatus } from '../../services/telegram-bridge-v7.js'
import { telegramCommandAliases } from '../../services/command-platform-support.js'
import { commandRuntimeDecision, markCommandCooldown, resolveConfiguredCommandCategory } from '../../services/command-runtime-config.js'
import { performanceAudit } from '../../services/performance-audit.js'
import { logger } from '../../utils/logger.js'
import { telegramOwner, telegramStaff } from './config.js'
import type { TelegramAdapter } from './adapter.js'
import { normalizeTelegramMessage } from './normalize.js'
import type { TelegramMessage } from './types.js'

const aliases = telegramCommandAliases

function t(locale: LocaleCode, key: string, values: Record<string, string | number | boolean | null | undefined> = {}) { return translate(locale, key, values) }

function parseCommand(text: string, botUsername?: string) {
  const clean = text.trim()
  const prefix = clean.startsWith('/') ? '/' : clean.startsWith(settings.prefix) ? settings.prefix : ''
  if (!prefix) return undefined
  const firstSpace = clean.search(/\s/)
  const head = (firstSpace < 0 ? clean : clean.slice(0, firstSpace))
    .slice(prefix.length)
    .replace(/^\/+/, '')
  const [rawName, mention] = head.split('@', 2)
  if (mention && botUsername && mention.toLowerCase() !== botUsername.toLowerCase()) return undefined
  const command = aliases.get(rawName.toLowerCase())
  if (!command) return { command: rawName.toLowerCase(), argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(), known: false }
  return { command, argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(), known: true }
}

export class TelegramCommandRouter {
  private readonly engine = new CommandEngine<CommandContext>(sharedNeutralCommands)

  constructor(
    private readonly adapter: TelegramAdapter,
    private readonly botUsername?: string,
  ) {}

  private locale(message: TelegramMessage) {
    return resolvePlatformLocale({
      platform: 'telegram',
      botInstanceId: this.adapter.botInstanceId,
      chatId: message.chat.id,
      userId: message.from?.id,
      clientLocale: message.from?.language_code,
    })
  }

  private commandContext(
    message: TelegramMessage,
    normalizedMessage: NormalizedMessage,
    commandName: string,
    argText: string,
    locale: LocaleCode,
    isOwner: boolean,
    isStaff: boolean,
  ): CommandContext {
    const chatId = normalizedMessage.chatId
    const replyTo = normalizedMessage.messageId
    const sendText: CommandContext['sendText'] = (value, options) =>
      this.adapter.sendText(chatId, value, { ...options, replyTo: options?.replyTo ?? replyTo })
    const sendMedia: CommandContext['sendMedia'] = (media, options) =>
      this.adapter.sendMedia(chatId, media, { ...options, replyTo: options?.replyTo ?? replyTo })
    const sendUi: CommandContext['sendUi'] = (ui, options) =>
      this.adapter.sendUi(chatId, ui, { ...options, replyTo: options?.replyTo ?? replyTo })
    const reply: CommandContext['reply'] = async (value) => (await sendText(value)).raw
    const react: CommandContext['react'] = async (emoji) => {
      if (!this.adapter.react) return undefined
      return this.adapter.react(chatId, replyTo, emoji)
    }

    return {
      platform: 'telegram',
      adapter: this.adapter,
      normalizedMessage,
      chatId,
      sender: `telegram:${message.from?.id ?? message.sender_chat?.id ?? message.chat.id}`,
      pushName: normalizedMessage.pushName ?? 'Telegram',
      commandName,
      args: argText.trim().split(/\s+/).filter(Boolean),
      argText,
      prefix: '/',
      settings,
      locale,
      t: (key, values = {}) => translate(locale, key, values),
      isOwner,
      isBotStaff: isStaff,
      isGroup: normalizedMessage.isGroup,
      isGroupAdmin: isStaff,
      isBotGroupAdmin: false,
      isSubbotOwner: false,
      reply,
      react,
      sendText,
      sendMedia,
      sendUi,
      setTyping: async (active) => {
        if (this.adapter.setTyping) await this.adapter.setTyping(chatId, active)
      },
      editMessage: async (messageId, value) => {
        if (!this.adapter.editMessage) throw new Error('Telegram no soporta edición en este adapter.')
        await this.adapter.editMessage(chatId, messageId, value)
      },
    }
  }

  async handle(message: TelegramMessage) {
    if (message.from?.is_bot) return false
    const normalized = normalizeTelegramMessage(message, this.adapter.botInstanceId)
    const locale = this.locale(message)
    const parsed = parseCommand(normalized.text, this.botUsername)
    if (!parsed) return false
    if (!parsed.known) {
      await this.adapter.sendText(
        normalized.chatId,
        t(locale, 'common.commandUnavailable', { platform: 'Telegram', command: `/${parsed.command}`, help: '/help' }),
        { replyTo: normalized.messageId },
      )
      return true
    }

    const userId = String(message.from?.id ?? '')
    const isOwner = telegramOwner(message.from?.id)
    const isStaff = telegramStaff(message.from?.id)
    const sharedCommand = this.engine.resolve(parsed.command)

    if (sharedCommand) {
      await this.adapter.setTyping?.(normalized.chatId, true).catch(() => undefined)
      try {
        const ctx = this.commandContext(
          message,
          normalized,
          sharedCommand.name,
          parsed.argText,
          locale,
          isOwner,
          isStaff,
        )
        await this.engine.execute(sharedCommand, ctx, {
          auditIdentity: {
            userJid: ctx.sender,
            displayName: normalized.pushName,
          },
        })
        return true
      } catch (error) {
        logger.warn({ error, chatId: normalized.chatId, command: sharedCommand.name }, 'Telegram shared command failed')
        const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
        await this.adapter.sendText(
          normalized.chatId,
          t(locale, 'telegram.error.public', { error: publicError }),
          { replyTo: normalized.messageId },
        ).catch(() => undefined)
        return true
      }
    }

    if (parsed.command !== 'tgstatus') return false

    const category = resolveConfiguredCommandCategory(parsed.command, 'owner')
    const runtimeDecision = commandRuntimeDecision({
      commandName: parsed.command,
      category,
      platform: 'telegram',
      isGroup: normalized.isGroup,
      userId,
      isOwner,
      isStaff,
    })
    if (!runtimeDecision.allowed) {
      const policyMessage = runtimeDecision.reason === 'disabled'
        ? t(locale, 'router.commandDisabled')
        : runtimeDecision.reason === 'category_disabled'
          ? t(locale, 'router.commandCategoryDisabled', { category })
          : runtimeDecision.reason === 'platform_disabled'
            ? t(locale, 'router.commandPlatformDisabled', { platform: 'Telegram' })
            : runtimeDecision.reason === 'groups_disabled'
              ? t(locale, 'router.commandGroupsDisabled')
              : runtimeDecision.reason === 'private_disabled'
                ? t(locale, 'router.commandPrivateDisabled')
                : runtimeDecision.reason === 'permission'
                  ? t(locale, 'router.commandPermission')
                  : t(locale, 'router.commandCooldown', { seconds: Math.max(1, Math.ceil(Number(runtimeDecision.remainingMs ?? 0) / 1000)) })
      await this.adapter.sendText(normalized.chatId, policyMessage, { replyTo: normalized.messageId })
      return true
    }

    if (!isStaff && runtimeDecision.config.cooldownMs > 0) {
      markCommandCooldown('telegram', runtimeDecision.commandName, userId)
    }

    const auditStarted = performance.now()
    const auditIdentity = message.from
      ? {
          userJid: `telegram:${message.from.id}`,
          displayName: [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || message.from.username,
        }
      : undefined

    try {
      if (!isOwner) throw new Error(t(locale, 'common.ownerRequired', { platform: 'Telegram' }))
      const bridge = telegramBridgeStatus()
      await this.adapter.sendText(
        normalized.chatId,
        [
          t(locale, 'telegram.status.active'),
          t(locale, 'telegram.status.bridge', { value: bridge.initialized ? t(locale, 'common.initialized') : t(locale, 'common.pending') }),
          t(locale, 'telegram.status.cached', { count: bridge.cachedMessages }),
          t(locale, 'telegram.status.channel', { value: bridge.configured ? t(locale, 'common.yes') : t(locale, 'common.no') }),
        ].join('\n'),
        { replyTo: normalized.messageId },
      )
      try { performanceAudit.recordRuntimeCommand(parsed.command, performance.now() - auditStarted, true, undefined, auditIdentity) } catch {}
      return true
    } catch (error) {
      try { performanceAudit.recordRuntimeCommand(parsed.command, performance.now() - auditStarted, false, undefined, auditIdentity) } catch {}
      logger.warn({ error, chatId: normalized.chatId, command: parsed.command }, 'Telegram command failed')
      const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
      await this.adapter.sendText(
        normalized.chatId,
        t(locale, 'telegram.error.public', { error: publicError }),
        { replyTo: normalized.messageId },
      ).catch(() => undefined)
      return true
    }
  }

}
