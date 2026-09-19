import { jidNormalizedUser, type GroupParticipant, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import { digitsFromJid, getMessageText, getSender, getSenderCandidates } from '../utils/message.js'
import { logger } from '../utils/logger.js'
import { community } from '../services/community.js'
import { economy } from '../services/economy.js'
import { isGroupCommandCategoryAllowed } from '../services/group-command-policy.js'
import { performanceAudit } from '../services/performance-audit.js'
import { canProcessPrivateMessage } from '../services/private-chat-policy.js'
import { resolveStoredIdentity } from '../services/identity.js'
import { settings } from './settings.js'
import { CommandEngine } from './command-engine.js'
import { groupControlsV9 } from '../services/group-controls-v9.js'
import { createLocalizedSocket } from '../services/localized-socket.js'
import { createWhatsAppAdapter, whatsappBotInstanceId } from '../platform/whatsapp/adapter.js'
import { resolveChatLocale, translate, type LocaleCode } from '../i18n/index.js'

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try { return jidNormalizedUser(value) } catch { return value }
}

function identityCandidates(value?: string | null) {
  if (!value) return []
  const normalized = normalizeJid(value)
  const resolved = normalizeJid(resolveStoredIdentity(normalized))
  return [...new Set([normalized, resolved].filter(Boolean))]
}

function sameIdentity(left?: string | null, right?: string | null) {
  const leftCandidates = identityCandidates(left)
  const rightCandidates = identityCandidates(right)
  if (leftCandidates.some((candidate) => rightCandidates.includes(candidate))) return true
  const leftNumbers = new Set(leftCandidates.map(digitsFromJid).filter(Boolean))
  return rightCandidates.some((candidate) => {
    const number = digitsFromJid(candidate)
    return Boolean(number && leftNumbers.has(number))
  })
}

function participantMatches(participant: GroupParticipant, candidates: string[]) {
  const participantIds = [participant.id, participant.phoneNumber, participant.lid]
    .flatMap((value) => identityCandidates(value))
    .filter(Boolean)
  const expandedCandidates = candidates.flatMap((value) => identityCandidates(value))
  return participantIds.some((jid) => expandedCandidates.includes(jid))
}

function canonicalUserJid(candidates: string[], fallback: string) {
  const expanded = [...new Set(candidates.flatMap((candidate) => identityCandidates(candidate)))]
  const pn = expanded.find((jid) => /@s\.whatsapp\.net$/i.test(jid))
  return normalizeJid(pn ?? resolveStoredIdentity(fallback) ?? fallback)
}

const disabledGroupBootstrapCommands = new Set(['menu', 'bot', 'language'])
const adultConsentBootstrapCommands = new Set(['adult18'])
const youtubeDownloadCommands = new Set(['play', 'playvideo', 'ytformats', 'ytmp3', 'ytmp4'])
const youtubeSafeClientErrors = [
  /^Debes indicar\b/i,
  /^URL inválida\b/i,
  /^Solo se permiten URLs HTTP\/HTTPS\b/i,
  /^La URL no pertenece a youtube\b/i,
  /^No (?:encontré|se encontraron)\b/i,
  /^El archivo supera el límite configurado\b/i,
]

function publicCommandError(commandName: string, error: unknown, locale: LocaleCode) {
  const message = error instanceof Error ? error.message : translate(locale, 'router.unexpectedError')
  const normalized = message.toLowerCase()
  if (
    normalized.includes('rate-overlimit')
    || normalized.includes('rate overlimit')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
  ) {
    return translate(locale, 'router.rateLimited')
  }
  if (!youtubeDownloadCommands.has(commandName)) return message
  if (youtubeSafeClientErrors.some((pattern) => pattern.test(message))) return message
  return translate(locale, 'router.internalUnavailable')
}

export type RouterOptions = { instanceId?: number; instanceOwnerJid?: string }

export class CommandRouter {
  private readonly engine: CommandEngine<LegacyCompatibleCommandContext>

  constructor(commands: BotCommand[], private readonly options: RouterOptions = {}) {
    this.engine = new CommandEngine<LegacyCompatibleCommandContext>(commands)
    try {
      performanceAudit.registerCommands(commands)
    } catch (error) {
      logger.warn({ error, instanceId: options.instanceId }, 'command audit catalog registration failed')
    }
  }

  async handle(socket: WASocket, message: WAMessage): Promise<boolean> {
    const ingestStarted = performance.now()
    const chatId = message.key.remoteJid
    performanceAudit.recordStage('01', performance.now() - ingestStarted)
    if (!chatId) return false

    if (!canProcessPrivateMessage(message, this.options.instanceOwnerJid)) return true

    const serializeStarted = performance.now()
    const text = getMessageText(message).trim()
    performanceAudit.recordStage('02', performance.now() - serializeStarted)

    const stateStarted = performance.now()
    const me = socket.authState.creds.me
    const selfCandidates = [me?.id, me?.lid].filter((value): value is string => Boolean(value))
    const incomingCandidates = getSenderCandidates(message)
    const rawSenderCandidates = message.key.fromMe ? selfCandidates : incomingCandidates
    const senderCandidates = rawSenderCandidates.flatMap((candidate) => identityCandidates(candidate)).filter(Boolean)
    const rawSender = message.key.fromMe ? (me?.id ?? getSender(message)) : getSender(message)
    const sender = canonicalUserJid(rawSenderCandidates, rawSender)
    const senderNumbers = senderCandidates.map(digitsFromJid).filter(Boolean)
    const isOwner = Boolean(message.key.fromMe) || senderNumbers.some((number) => config.owners.includes(number))
    const isBotStaff = isOwner || senderNumbers.some((number) => settings.isBotAdmin(number))
    const isSubbotOwner = Boolean(this.options.instanceOwnerJid) && sameIdentity(sender, this.options.instanceOwnerJid)
    const isGroup = chatId.endsWith('@g.us')
    const prefix = settings.prefix
    const botInstanceId = whatsappBotInstanceId(this.options.instanceId)
    const locale = resolveChatLocale(chatId, sender, botInstanceId)
    const localizedSocket = createLocalizedSocket(socket, locale, { contextChatId: chatId, botInstanceId })
    const t = (key: string, values: Record<string, string | number | boolean | null | undefined> = {}) => translate(locale, key, values)
    const pushName = message.pushName ?? (message.key.fromMe ? 'Owner' : t('router.defaultUser'))

    const adapter = createWhatsAppAdapter(socket, this.options.instanceId)
    const normalizedMessage = adapter.normalizeMessage(message, {
      senderId: sender,
      text,
      isGroup,
      pushName,
    })
    performanceAudit.recordStage('03', performance.now() - stateStarted)

    const currentReplyTo = normalizedMessage.messageId || undefined
    const withCurrentReply = <T extends { replyTo?: string }>(options?: T) => ({
      ...options,
      replyTo: options?.replyTo ?? currentReplyTo,
    })
    const sendText: LegacyCompatibleCommandContext['sendText'] = (value, options) =>
      adapter.sendText(chatId, value, withCurrentReply(options))
    const sendMedia: LegacyCompatibleCommandContext['sendMedia'] = (media, options) =>
      adapter.sendMedia(chatId, media, withCurrentReply(options))
    const sendUi: LegacyCompatibleCommandContext['sendUi'] = (ui, options) =>
      adapter.sendUi(chatId, ui, withCurrentReply(options))
    const setTyping: LegacyCompatibleCommandContext['setTyping'] = async (active) => {
      if (adapter.setTyping) await adapter.setTyping(chatId, active)
    }
    const editMessage: LegacyCompatibleCommandContext['editMessage'] = async (messageId, value) => {
      if (!adapter.editMessage) throw new Error(`La plataforma ${adapter.id} no soporta edición de mensajes.`)
      await adapter.editMessage(chatId, messageId, value)
    }
    const reply = async (replyText: string) => {
      const sent = await sendText(replyText)
      return sent.raw
    }
    const react = async (emoji: string) => {
      const messageId = normalizedMessage.messageId
      if (!messageId || !adapter.react) return undefined
      return adapter.react(chatId, messageId, emoji)
    }

    let senderIsGroupAdmin = false
    if (isGroup && groupControlsV9.get(chatId).restrictedMode && !isOwner && !isBotStaff && !isSubbotOwner) {
      const metadata = await socket.groupMetadata(chatId).catch(() => null)
      const senderParticipant = metadata?.participants.find((participant) => participantMatches(participant, senderCandidates))
      senderIsGroupAdmin = Boolean(senderParticipant?.admin)
    }

    if (isGroup && groupControlsV9.get(chatId).restrictedMode && !isOwner && !isBotStaff && !isSubbotOwner && !senderIsGroupAdmin) {
      return true
    }

    if (!text.startsWith(prefix)) {
      const response = text.toLowerCase()
      const relationshipResponse = new Map<string, boolean>([
        ['aceptar', true], ['accept', true], ['rechazar', false], ['reject', false],
      ])
      if (!relationshipResponse.has(response)) return false
      try {
        const result = community.resolvePendingRelationship(sender, relationshipResponse.get(response) === true)
        if (!result) return false
        const kind = result.kind === 'marriage' ? t('router.relationship.marriage') : t('router.relationship.lover')
        const messageText = result.accepted
          ? t('router.relationship.accepted', { proposer: result.proposerJid.split('@')[0] ?? '', target: result.targetJid.split('@')[0] ?? '', kind })
          : t('router.relationship.rejected', { proposer: result.proposerJid.split('@')[0] ?? '', target: result.targetJid.split('@')[0] ?? '' })
        await adapter.sendText(chatId, messageText, {
          replyTo: message.key.id ?? undefined,
          mentions: [result.proposerJid, result.targetJid],
        })
        await react(result.accepted ? '💞' : '💔').catch(() => undefined)
        return true
      } catch (error) {
        await reply(`❌ ${error instanceof Error ? error.message : t('router.relationship.error')}`)
        return true
      }
    }

    const matcherStarted = performance.now()
    const raw = text.slice(prefix.length).trim()
    if (!raw) {
      performanceAudit.recordStage('05', performance.now() - matcherStarted)
      return false
    }
    const [typedName = '', ...args] = raw.split(/\s+/)
    const command = this.engine.resolve(typedName)
    performanceAudit.recordStage('05', performance.now() - matcherStarted)
    if (!command) return false

    if (isGroup && !community.getGroupSettings(chatId).botEnabled && !isBotStaff && !isSubbotOwner && !disabledGroupBootstrapCommands.has(command.name)) return false

    try {
      await react('⚡').catch(() => undefined)
      const filtersStarted = performance.now()
      let filtersRecorded = false
      const finishFilters = () => {
        if (filtersRecorded) return
        filtersRecorded = true
        performanceAudit.recordStage('04', performance.now() - filtersStarted)
      }

      if (command.ownerOnly && !isOwner) {
        finishFilters()
        await reply(t('router.ownerOnly'))
        await react('🚫').catch(() => undefined)
        return true
      }
      if (command.staffOnly && !isBotStaff && !(command.subbotOwnerAllowed && isSubbotOwner)) {
        finishFilters()
        await reply(t('router.staffOnly'))
        await react('🚫').catch(() => undefined)
        return true
      }
      if (command.groupOnly && !isGroup) {
        finishFilters()
        await reply(t('router.groupOnly'))
        await react('🚫').catch(() => undefined)
        return true
      }

      if (command.adminOnly || command.botAdminOnly) {
        if (!isGroup) {
          finishFilters()
          await reply(t('router.groupRequired'))
          await react('🚫').catch(() => undefined)
          return true
        }
        const metadata = await socket.groupMetadata(chatId)
        const senderParticipant = metadata.participants.find((participant) => participantMatches(participant, senderCandidates))
        const botCandidates = selfCandidates.flatMap((candidate) => identityCandidates(candidate)).filter(Boolean)
        const botParticipant = metadata.participants.find((participant) => participantMatches(participant, botCandidates))
        senderIsGroupAdmin = senderIsGroupAdmin || Boolean(senderParticipant?.admin)
        const senderIsAdmin = senderIsGroupAdmin || isBotStaff || isSubbotOwner
        const botIsAdmin = Boolean(botParticipant?.admin)
        if (command.adminOnly && !senderIsAdmin) {
          finishFilters()
          await reply(t('router.adminOnly'))
          await react('🚫').catch(() => undefined)
          return true
        }
        if (command.botAdminOnly && !botIsAdmin) {
          finishFilters()
          await reply(t('router.botAdminOnly'))
          await react('🚫').catch(() => undefined)
          return true
        }
      }

      const runtimeDecision = commandRuntimeDecision({
        commandName: command.name,
        category: command.category,
        platform: 'whatsapp',
        isGroup,
        userId: sender,
        isOwner,
        isStaff: isBotStaff,
        isSubbotOwner,
      })
      if (!runtimeDecision.allowed) {
        finishFilters()
        const runtimeMessage = runtimeDecision.reason === 'disabled'
          ? t('router.commandDisabled')
          : runtimeDecision.reason === 'category_disabled'
            ? t('router.commandCategoryDisabled', { category: command.category })
            : runtimeDecision.reason === 'platform_disabled'
              ? t('router.commandPlatformDisabled', { platform: 'WhatsApp' })
              : runtimeDecision.reason === 'groups_disabled'
                ? t('router.commandGroupsDisabled')
                : runtimeDecision.reason === 'private_disabled'
                  ? t('router.commandPrivateDisabled')
                  : runtimeDecision.reason === 'permission'
                    ? t('router.commandPermission')
                    : t('router.commandCooldown', { seconds: Math.max(1, Math.ceil(Number(runtimeDecision.remainingMs ?? 0) / 1000)) })
        await reply(runtimeMessage)
        await react('🚫').catch(() => undefined)
        return true
      }

      if (isGroup && !isOwner && !isBotStaff && !isSubbotOwner) {
        const categoryAllowed = command.category === 'adult'
          ? economy.getGroupPolicy(chatId).adultAllowed || adultConsentBootstrapCommands.has(command.name)
          : isGroupCommandCategoryAllowed(chatId, command.category)
        if (!categoryAllowed) {
          if (!senderIsGroupAdmin) {
            const metadata = await socket.groupMetadata(chatId).catch(() => null)
            const senderParticipant = metadata?.participants.find((participant) => participantMatches(participant, senderCandidates))
            senderIsGroupAdmin = Boolean(senderParticipant?.admin)
          }
          if (!senderIsGroupAdmin) {
            finishFilters()
            await reply(t('router.categoryDisabled', { category: command.category }))
            await react('🚫').catch(() => undefined)
            return true
          }
        }
      }
      finishFilters()

      const context: LegacyCompatibleCommandContext = {
        platform: 'whatsapp',
        adapter,
        normalizedMessage,
        socket: localizedSocket,
        message,
        chatId,
        sender,
        pushName,
        commandName: command.name,
        args,
        argText: args.join(' '),
        prefix,
        settings,
        locale,
        t,
        isOwner,
        isBotStaff,
        isGroup,
        isSubbotOwner,
        instanceId: this.options.instanceId,
        instanceOwnerJid: this.options.instanceOwnerJid,
        reply,
        react,
        sendText,
        sendMedia,
        sendUi,
        setTyping,
        editMessage,
      }

      const executionStarted = performance.now()
      const heapBefore = process.memoryUsage().heapUsed
      if (!isOwner && !isBotStaff && !isSubbotOwner && runtimeDecision.config.cooldownMs > 0) {
        markCommandCooldown('whatsapp', command.name, sender)
      }
      try {
        await command.handler(context)
        const durationMs = performance.now() - executionStarted
        performanceAudit.recordStage('06', durationMs)
        performanceAudit.recordCommand(command, durationMs, true, process.memoryUsage().heapUsed - heapBefore, undefined, { userJid: sender, displayName: pushName })
      } catch (error) {
        const durationMs = performance.now() - executionStarted
        performanceAudit.recordStage('06', durationMs)
        performanceAudit.recordCommand(command, durationMs, false, process.memoryUsage().heapUsed - heapBefore, undefined, { userJid: sender, displayName: pushName })
        throw error
      }

      community.awardCommandXp(sender)
      await react('✅').catch(() => undefined)
      return true
    } catch (error) {
      logger.error({ error, command: command.name, chatId, instanceId: this.options.instanceId }, 'command failed')
      const publicError = publicCommandError(command.name, error, locale)
      await reply(t('router.commandError', { prefix, command: command.name, error: publicError })).catch(() => undefined)
      await react('❌').catch(() => undefined)
      return true
    }
  }
}
