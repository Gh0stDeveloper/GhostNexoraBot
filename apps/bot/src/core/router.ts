import { jidNormalizedUser, type GroupParticipant, type WAMessage, type WASocket } from 'baileys'
import { config } from '../config.js'
import type { BotCommand, CommandContext } from '../types.js'
import { digitsFromJid, getMessageText, getSender, getSenderCandidates } from '../utils/message.js'
import { logger } from '../utils/logger.js'
import { settings } from './settings.js'

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try {
    return jidNormalizedUser(value)
  } catch {
    return value
  }
}

function participantMatches(participant: GroupParticipant, candidates: string[]) {
  const participantIds = [participant.id, participant.phoneNumber, participant.lid]
    .map(normalizeJid)
    .filter(Boolean)
  return participantIds.some((jid) => candidates.includes(jid))
}

export class CommandRouter {
  private readonly byName = new Map<string, BotCommand>()

  constructor(commands: BotCommand[]) {
    for (const command of commands) {
      this.byName.set(command.name.toLowerCase(), command)
      for (const alias of command.aliases ?? []) this.byName.set(alias.toLowerCase(), command)
    }
  }

  async handle(socket: WASocket, message: WAMessage): Promise<boolean> {
    const text = getMessageText(message)
    const prefix = settings.prefix
    if (!text.startsWith(prefix)) return false

    const raw = text.slice(prefix.length).trim()
    if (!raw) return false
    const [typedName = '', ...args] = raw.split(/\s+/)
    const command = this.byName.get(typedName.toLowerCase())
    if (!command) return false

    const chatId = message.key.remoteJid
    if (!chatId) return false
    const sender = getSender(message)
    const senderCandidates = getSenderCandidates(message).map(normalizeJid).filter(Boolean)
    const senderNumbers = getSenderCandidates(message).map(digitsFromJid).filter(Boolean)
    const isOwner = senderNumbers.some((number) => config.owners.includes(number))
    const isGroup = chatId.endsWith('@g.us')

    const reply = (replyText: string) => socket.sendMessage(chatId, { text: replyText }, { quoted: message })
    const react = (emoji: string) => socket.sendMessage(chatId, { react: { text: emoji, key: message.key } })

    try {
      await react('⚡')

      if (command.ownerOnly && !isOwner) {
        await reply('⛔ Este comando está disponible únicamente para el propietario del bot.')
        await react('🚫')
        return true
      }
      if (command.groupOnly && !isGroup) {
        await reply('👥 Este comando solo se puede usar dentro de un grupo.')
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
        const me = socket.authState.creds.me
        const botCandidates = [me?.id, me?.lid].map(normalizeJid).filter(Boolean)
        const botParticipant = metadata.participants.find((participant) => participantMatches(participant, botCandidates))
        const senderIsAdmin = Boolean(senderParticipant?.admin) || isOwner
        const botIsAdmin = Boolean(botParticipant?.admin)

        if (command.adminOnly && !senderIsAdmin) {
          await reply('🛡️ Necesitas ser administrador del grupo para usar este comando.')
          await react('🚫')
          return true
        }
        if (command.botAdminOnly && !botIsAdmin) {
          await reply('🤖 Necesito ser administrador del grupo para realizar esta acción.')
          await react('🚫')
          return true
        }
      }

      const context: CommandContext = {
        socket,
        message,
        chatId,
        sender,
        pushName: message.pushName ?? 'Usuario',
        commandName: command.name,
        args,
        argText: args.join(' '),
        prefix,
        settings,
        reply,
        react,
      }
      await command.handler(context)
      await react('✅')
      return true
    } catch (error) {
      logger.error({ error, command: command.name, chatId }, 'command failed')
      await reply(`❌ No pude completar *${prefix}${command.name}*. ${error instanceof Error ? error.message : 'Error inesperado.'}`).catch(() => undefined)
      await react('❌').catch(() => undefined)
      return true
    }
  }
}
