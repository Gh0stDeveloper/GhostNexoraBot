import { jidNormalizedUser, type GroupParticipant, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import type { BotCommand, CommandContext } from '../types.js'
import { digitsFromJid, getMessageText, getSender, getSenderCandidates } from '../utils/message.js'
import { logger } from '../utils/logger.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'
import { settings } from './settings.js'
import { groupControlsV9 } from '../services/group-controls-v9.js'

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

const privateStorefrontCommands = new Set(['menu', 'shop', 'buy', 'balance'])
const disabledGroupBootstrapCommands = new Set(['menu', 'bot'])
const youtubeDownloadCommands = new Set(['play', 'playvideo', 'ytformats', 'ytmp3', 'ytmp4'])
const youtubeSafeClientErrors = [
  /^Debes indicar\b/i,
  /^URL inválida\b/i,
  /^Solo se permiten URLs HTTP\/HTTPS\b/i,
  /^La URL no pertenece a youtube\b/i,
  /^No (?:encontré|se encontraron)\b/i,
  /^El archivo supera el límite configurado\b/i,
]

function publicCommandError(commandName: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
  if (!youtubeDownloadCommands.has(commandName)) return message
  if (youtubeSafeClientErrors.some((pattern) => pattern.test(message))) return message
  return 'Error interno en el servidor, método no disponible por el momento.'
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
    const isSubbotOwner = Boolean(this.options.instanceOwnerJid) && normalizeJid(this.options.instanceOwnerJid) === sender
    const isGroup = chatId.endsWith('@g.us')
    const prefix = settings.prefix
    const hasPrivateAccess = isGroup || isBotStaff || isSubbotOwner || Boolean(economy.hasEntitlement(sender, 'private_access'))

    const reply = (replyText: string) => socket.sendMessage(chatId, { text: replyText }, { quoted: message })
    const react = (emoji: string) => socket.sendMessage(chatId, { react: { text: emoji, key: message.key } })

    let senderIsGroupAdmin = false
    if (isGroup && groupControlsV9.get(chatId).restrictedMode && !isOwner && !isBotStaff && !isSubbotOwner) {
      const metadata = await socket.groupMetadata(chatId).catch(() => null)
      const senderParticipant = metadata?.participants.find((participant) => participantMatches(participant, senderCandidates))
      senderIsGroupAdmin = Boolean(senderParticipant?.admin)
    }

    if (isGroup && groupControlsV9.get(chatId).restrictedMode && !isOwner && !isBotStaff && !isSubbotOwner && !senderIsGroupAdmin) {
      return false
    }

    if (!text.startsWith(prefix)) {
      const response = text.toLowerCase()
      if (response !== 'aceptar' && response !== 'rechazar') return false
      if (!hasPrivateAccess) {
        await reply(`🔐 Esta acción también requiere acceso privado. Consulta *${prefix}shop* y compra *private1d*, *private7d* o *private30d*.`)
        await react('🔒').catch(() => undefined)
        return true
      }
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

    if (isGroup && !community.getGroupSettings(chatId).botEnabled && !isBotStaff && !isSubbotOwner && !disabledGroupBootstrapCommands.has(command.name)) return false

    try {
      await react('⚡')

      if (!hasPrivateAccess && !privateStorefrontCommands.has(command.name)) {
        await reply([
          '╭━━〔 🔐 *CHAT PRIVADO PREMIUM* 〕━━╮',
          '┃ Tu cuenta todavía no tiene acceso privado.',
          '┃ Los comandos del bot funcionan en grupos,',
          '┃ pero este chat requiere una suscripción.',
          '╰━━━━━━━━━━━━━━━━━━━━╯',
          '',
          `🛒 Consulta planes: *${prefix}shop*`,
          `💰 Consulta saldo: *${prefix}balance*`,
          `✅ Compra acceso: *${prefix}buy private1d|private7d|private30d*`,
          '',
          'El acceso se activa inmediatamente después de una compra válida.',
        ].join('\n'))
        await react('🔒')
        return true
      }

      if (command.ownerOnly && !isOwner) {
        await reply('⛔ *ACCESO RESTRINGIDO*\n━━━━━━━━━━━━━━\nEste comando está reservado al propietario principal del bot.')
        await react('🚫')
        return true
      }
      if (command.staffOnly && !isBotStaff && !(command.subbotOwnerAllowed && isSubbotOwner)) {
        await reply('🛡️ *STAFF DEL BOT*\n━━━━━━━━━━━━━━\nNecesitas ser Owner/administrador global o el propietario autorizado de esta instancia de subbot.')
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
        senderIsGroupAdmin = senderIsGroupAdmin || Boolean(senderParticipant?.admin)
        const senderIsAdmin = senderIsGroupAdmin || isBotStaff || isSubbotOwner
        const botIsAdmin = Boolean(botParticipant?.admin)
        if (command.adminOnly && !senderIsAdmin) {
          await reply('🛡️ *PERMISO DE ADMIN*\n━━━━━━━━━━━━━━\nNecesitas ser administrador del grupo, staff global o dueño de esta instancia.')
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
      const publicError = publicCommandError(command.name, error)
      await reply(`❌ *NO PUDE COMPLETAR ${prefix}${command.name}*\n━━━━━━━━━━━━━━\n${publicError}`).catch(() => undefined)
      await react('❌').catch(() => undefined)
      return true
    }
  }
}
