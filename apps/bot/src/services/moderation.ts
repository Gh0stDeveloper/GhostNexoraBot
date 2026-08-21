import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { economy } from './economy.js'
import { getMessageText, getSender } from '../utils/message.js'

const spamWindows = new Map<string, number[]>()
const linkRegex = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)/i

function spamKey(chatId: string, sender: string) { return `${chatId}:${sender}` }

export async function moderateIncoming(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  const policy = economy.getGroupPolicy(chatId)
  if (!policy.antiLink && !policy.antiSpam) return false
  const text = getMessageText(message)
  const sender = getSender(message)

  if (policy.antiLink && linkRegex.test(text)) {
    const metadata = await socket.groupMetadata(chatId)
    const participant = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(sender))
    if (!participant?.admin) {
      await socket.sendMessage(chatId, { delete: message.key }).catch(() => undefined)
      await socket.sendMessage(chatId, { text: `🔗 @${sender.split('@')[0]}, los enlaces están bloqueados en este grupo.`, mentions: [sender] }).catch(() => undefined)
      return true
    }
  }

  if (policy.antiSpam) {
    const key = spamKey(chatId, sender)
    const cutoff = Date.now() - 8_000
    const history = (spamWindows.get(key) ?? []).filter((stamp) => stamp >= cutoff)
    history.push(Date.now())
    spamWindows.set(key, history)
    if (history.length >= 6) {
      await socket.sendMessage(chatId, { delete: message.key }).catch(() => undefined)
      if (history.length === 6) await socket.sendMessage(chatId, { text: `🚦 @${sender.split('@')[0]}, reduce la velocidad de mensajes.`, mentions: [sender] }).catch(() => undefined)
      return true
    }
  }
  return false
}

export async function handleParticipantUpdate(socket: WASocket, update: { id: string; participants: string[]; action: string }) {
  if (!economy.getGroupPolicy(update.id).welcome) return
  if (!['add', 'remove'].includes(update.action)) return
  for (const jid of update.participants) {
    const text = update.action === 'add'
      ? `👋 Bienvenido/a @${jid.split('@')[0]} a *${(await socket.groupMetadata(update.id)).subject}*.\n\nUsa ${'`'}${config.defaultPrefix}menu${'`'} para conocer Ghost Nexora Bot.`
      : `👋 @${jid.split('@')[0]} salió del grupo.`
    const payload = config.welcomeImageUrl && update.action === 'add'
      ? { image: { url: config.welcomeImageUrl }, caption: text, mentions: [jid] }
      : { text, mentions: [jid] }
    await socket.sendMessage(update.id, payload as never).catch(() => undefined)
  }
}
