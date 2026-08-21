import { jidNormalizedUser, type GroupParticipant, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import type { BotCommand, CommandContext } from '../types.js'
import { digitsFromJid, getMessageText, getSender, getSenderCandidates } from '../utils/message.js'
import { logger } from '../utils/logger.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'
import { settings } from './settings.js'

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
    const isGroup = chatId.endsWith('@g.us')
    const prefix = settings.prefix

    const reply = (replyText: string) => socket.sendMessage(chatId, { text: replyText }, { quoted: message })
    const react = (emoji: string) => socket.sendMessage(chatId, { react: { text: emoji, key: message.key } })

    if (!text.startsWith(prefix)) {
      const response = text.toLowerCase()
      if (response !== 'aceptar' && response !== 'rechazar') return false
      try {
        const result = community.resolvePendingRelationship(sender, response === 'aceptar')
        if (!result) return false
        const kind = result.kind === 'marriage' ? 'matrimonio' : 'relación de amantes'
        const messageText = result.accepted
          ? `💞 *PROPUESTA ACEPTADA*\n━━━━━━━━━━━━━━\n@${result.proposerJid.split('@')[0]} y @${result.targetJid.split('@')[0]} ahora tienen una ${kind}.`
          : `💔 *PROPUESTA RECHAZADA*\n━━━━━━━━━━━━━━\n@${result.targetJid.split('@')[0]} rechazó la propuesta de @${result.proposerJid.split('@')[0]}.`
        await socket.sendMessage(chatId, { text: messageText, mentions: [result.proposerJid, result.targetJid] }, { quoted: message })
        await react(result.accepted ? '💞' : '💔').catch(() => undefined)
        return true
      } catch (error) {
        await reply(`❌ ${error instanceof Error ? error.message : 'No pude procesar la propuesta.'}`)
        return true
      }
    }

    const raw = text.slice(prefix.length).trim()
    if (!raw) return false
    const [typedName = '', ...args] = raw.split(/\s+/)
    const command = this.byName.get(typedName.toLowerCase())
    if (!command) return false

    if (isGroup && !community.getGroupSettings(chatId).botEnabled && !isBotStaff && command.name !== 'bot') return false

    try {
      await react('⚡')

      if (!isGroup && settings.privateCommandsRequireAccess && !isBotStaff) {
        const freeCategories = new Set(['general', 'profile', 'social', 'economy', 'games', 'collection', 'subbots'])
        if (!freeCategories.has(command.category) && !economy.hasEntitlement(sender, 'private_access')) {
          await reply(`🔐 *ACCESO PRIVADO*\n━━━━━━━━━━━━━━\nEste módulo requiere acceso privado. Consulta *${prefix}shop* para adquirirlo con ${settings.currencyName}.`)
          await react('🔒')
          return true
        }
      }

      if (command.ownerOnly && !isOwner) {
        await reply('⛔ *ACCESO RESTRINGIDO*\n━━━━━━━━━━━━━━\nEste comando está reservado al propietario principal del bot.')
        await react('🚫')
        return true
      }
      if (command.staffOnly && !isBotStaff) {
        await reply('🛡️ *STAFF DEL BOT*\n━━━━━━━━━━━━━━\nNecesitas ser Owner o administrador global de Ghost Nexora Bot.')
        await react('🚫')
        return true
      }
      if (command.groupOnly && !isGroup) {
        await reply('👥 *SOLO GRUPOS*\n━━━━━━━━━━━━━━\nEste comando solo se puede usar dentro de un grupo.')
        await react('🚫')
        return true
      }

      if (command.adminOnly || command.botAdminOnly) {
        if (!isGroup) {
          await reply('👥 Este comando solo se puede usar dentro de un grupo.')
          await react('🚫')
          return true
        }
        const metadata = await socket.groupMetadata(chatId)
        const senderParticipant = metadata.participants.find((participant) => participantMatches(participant, senderCandidates))
        const botCandidates = selfCandidates.map(normalizeJid).filter(Boolean)
        const botParticipant = metadata.participants.find((participant) => participantMatches(participant, botCandidates))
        const senderIsAdmin = Boolean(senderParticipant?.admin) || isBotStaff
        const botIsAdmin = Boolean(botParticipant?.admin)
        if (command.adminOnly && !senderIsAdmin) {
          await reply('🛡️ *PERMISO DE ADMIN*\n━━━━━━━━━━━━━━\nNecesitas ser administrador del grupo o staff global del bot.')
          await react('🚫')
          return true
        }
        if (command.botAdminOnly && !botIsAdmin) {
          await reply('🤖 *PERMISO FALTANTE*\n━━━━━━━━━━━━━━\nNecesito ser administrador del grupo para realizar esta acción.')
          await react('🚫')
          return true
        }
      }

      const context: CommandContext = {
        socket, message, chatId, sender,
        pushName: message.pushName ?? (message.key.fromMe ? 'Owner' : 'Usuario'),
        commandName: command.name, args, argText: args.join(' '), prefix, settings,
        isOwner, isBotStaff, isGroup,
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
      await reply(`❌ *NO PUDE COMPLETAR ${prefix}${command.name}*\n━━━━━━━━━━━━━━\n${error instanceof Error ? error.message : 'Ocurrió un error inesperado.'}`).catch(() => undefined)
      await react('❌').catch(() => undefined)
      return true
    }
  }
}
