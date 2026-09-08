import { jidNormalizedUser, type GroupParticipant, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import type { BotCommand, CommandContext } from '../types.js'
import { digitsFromJid, getMessageText, getSender, getSenderCandidates } from '../utils/message.js'
import { logger } from '../utils/logger.js'
import { community } from '../services/community.js'
import { canProcessPrivateMessage } from '../services/private-chat-policy.js'
import { settings } from './settings.js'
import { groupControlsV9 } from '../services/group-controls-v9.js'
import { createLocalizedSocket } from '../services/localized-socket.js'
import { resolveChatLocale, translate, type LocaleCode } from '../i18n/index.js'

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try { return jidNormalizedUser(value) } catch { return value }
}

function participantMatches(participant: GroupParticipant, candidates: string[]) {
  const participantIds = [participant.id, participant.phoneNumber, participant.lid].map(normalizeJid).filter(Boolean)
  return participantIds.some((jid) => candidates.includes(jid))
}

function canonicalUserJid(candidates: string[], fallback: string) {
  const pn = candidates.find((jid) => /@s\.whatsapp\.net$/i.test(jid))
  return normalizeJid(pn ?? fallback)
}

const disabledGroupBootstrapCommands = new Set(['menu', 'bot', 'language'])
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
  if (!youtubeDownloadCommands.has(commandName)) return message
  if (youtubeSafeClientErrors.some((pattern) => pattern.test(message))) return message
  return translate(locale, 'router.internalUnavailable')
}

export type RouterOptions = { instanceId?: number; instanceOwnerJid?: string }

export class CommandRouter {
  private readonly byName = new Map<string, BotCommand>()

  constructor(commands: BotCommand[], private readonly options: RouterOptions = {}) {
    for (const command of commands) {
      this.byName.set(command.name.toLowerCase(), command)
      for (const alias of command.aliases ?? []) this.byName.set(alias.toLowerCase(), command)
    }
  }

  async handle(socket: WASocket, message: WAMessage): Promise<boolean> {
    const text = getMessageText(message).trim()
    const chatId = message.key.remoteJid
    if (!chatId) return false

    // Defensa en profundidad: un privado no autorizado se consume en silencio.
    // No se responde, no se reacciona y ningún comando alcanza su handler.
    if (!canProcessPrivateMessage(message, this.options.instanceOwnerJid)) return true

    const me = socket.authState.creds.me
    const selfCandidates = [me?.id, me?.lid].filter((value): value is string => Boolean(value))
    const incomingCandidates = getSenderCandidates(message)
    const rawSenderCandidates = message.key.fromMe ? selfCandidates : incomingCandidates
    const senderCandidates = rawSenderCandidates.map(normalizeJid).filter(Boolean)
    const rawSender = message.key.fromMe ? (me?.id ?? getSender(message)) : getSender(message)
    const sender = canonicalUserJid(rawSenderCandidates, rawSender)
    const senderNumbers = rawSenderCandidates.map(digitsFromJid).filter(Boolean)
    const isOwner = Boolean(message.key.fromMe) || senderNumbers.some((number) => config.owners.includes(number))
    const isBotStaff = isOwner || senderNumbers.some((number) => settings.isBotAdmin(number))
    const isSubbotOwner = Boolean(this.options.instanceOwnerJid) && normalizeJid(this.options.instanceOwnerJid) === sender
    const isGroup = chatId.endsWith('@g.us')
    const prefix = settings.prefix
    const locale = resolveChatLocale(chatId)
    const localizedSocket = createLocalizedSocket(socket, locale)
    const t = (key: string, values: Record<string, string | number | boolean | null | undefined> = {}) => translate(locale, key, values)

    const reply = (replyText: string) => localizedSocket.sendMessage(chatId, { text: replyText }, { quoted: message })
    const react = (emoji: string) => localizedSocket.sendMessage(chatId, { react: { text: emoji, key: message.key } })

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
        await localizedSocket.sendMessage(chatId, { text: messageText, mentions: [result.proposerJid, result.targetJid] }, { quoted: message })
        await react(result.accepted ? '💞' : '💔').catch(() => undefined)
        return true
      } catch (error) {
        await reply(`❌ ${error instanceof Error ? error.message : t('router.relationship.error')}`)
        return true
      }
    }

    const raw = text.slice(prefix.length).trim()
    if (!raw) return false
    const [typedName = '', ...args] = raw.split(/\s+/)
    const command = this.byName.get(typedName.toLowerCase())
    if (!command) return false

    if (isGroup && !community.getGroupSettings(chatId).botEnabled && !isBotStaff && !isSubbotOwner && !disabledGroupBootstrapCommands.has(command.name)) return false

    try {
      await react('⚡')

      if (command.ownerOnly && !isOwner) {
        await reply(t('router.ownerOnly'))
        await react('🚫')
        return true
      }
      if (command.staffOnly && !isBotStaff && !(command.subbotOwnerAllowed && isSubbotOwner)) {
        await reply(t('router.staffOnly'))
        await react('🚫')
        return true
      }
      if (command.groupOnly && !isGroup) {
        await reply(t('router.groupOnly'))
        await react('🚫')
        return true
      }

      if (command.adminOnly || command.botAdminOnly) {
        if (!isGroup) {
          await reply(t('router.groupRequired'))
          await react('🚫')
          return true
        }
        const metadata = await socket.groupMetadata(chatId)
        const senderParticipant = metadata.participants.find((participant) => participantMatches(participant, senderCandidates))
        const botCandidates = selfCandidates.map(normalizeJid).filter(Boolean)
        const botParticipant = metadata.participants.find((participant) => participantMatches(participant, botCandidates))
        senderIsGroupAdmin = senderIsGroupAdmin || Boolean(senderParticipant?.admin)
        const senderIsAdmin = senderIsGroupAdmin || isBotStaff || isSubbotOwner
        const botIsAdmin = Boolean(botParticipant?.admin)
        if (command.adminOnly && !senderIsAdmin) {
          await reply(t('router.adminOnly'))
          await react('🚫')
          return true
        }
        if (command.botAdminOnly && !botIsAdmin) {
          await reply(t('router.botAdminOnly'))
          await react('🚫')
          return true
        }
      }

      const context: CommandContext = {
        socket: localizedSocket, message, chatId, sender,
        pushName: message.pushName ?? (message.key.fromMe ? 'Owner' : t('router.defaultUser')),
        commandName: command.name, args, argText: args.join(' '), prefix, settings, locale, t,
        isOwner, isBotStaff, isGroup, isSubbotOwner,
        instanceId: this.options.instanceId,
        instanceOwnerJid: this.options.instanceOwnerJid,
        reply, react,
      }
      await command.handler(context)
      community.awardCommandXp(sender)
      await react('✅')
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
