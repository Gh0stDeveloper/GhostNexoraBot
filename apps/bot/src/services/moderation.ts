import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { economy } from './economy.js'
import { community } from './community.js'
import { getBrandingAsset } from './branding.js'
import { settings } from '../core/settings.js'
import { getMessageText, getSender } from '../utils/message.js'

const spamWindows = new Map<string, number[]>()
const linkRegex = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)/i

function spamKey(chatId: string, sender: string) { return `${chatId}:${sender}` }

function renderTemplate(template: string, jid: string, groupName: string) {
  return template
    .replaceAll('$user', `@${jid.split('@')[0]}`)
    .replaceAll('$namegroup', groupName)
}

export async function moderateIncoming(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  if (!community.getGroupSettings(chatId).botEnabled) return false
  const policy = economy.getGroupPolicy(chatId)
  if (!policy.antiLink && !policy.antiSpam) return false
  const text = getMessageText(message)
  const sender = getSender(message)

  if (policy.antiLink && linkRegex.test(text)) {
    const metadata = await socket.groupMetadata(chatId)
    const participant = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(sender))
    if (!participant?.admin) {
      await socket.sendMessage(chatId, { delete: message.key }).catch(() => undefined)
      await socket.sendMessage(chatId, {
        text: `╭─〔 🔗 *ANTI-LINK* 〕\n│ @${sender.split('@')[0]}, los enlaces están bloqueados.\n│ Pide permiso a un administrador.\n╰──────────────`,
        mentions: [sender],
      }).catch(() => undefined)
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
      if (history.length === 6) await socket.sendMessage(chatId, {
        text: `╭─〔 🚦 *ANTI-SPAM* 〕\n│ @${sender.split('@')[0]}, reduce la velocidad.\n│ Espera unos segundos antes de continuar.\n╰──────────────`,
        mentions: [sender],
      }).catch(() => undefined)
      return true
    }
  }
  return false
}

export async function handleParticipantUpdate(socket: WASocket, update: { id: string; participants: string[]; action: string }) {
  if (!['add', 'remove'].includes(update.action)) return
  const policy = economy.getGroupPolicy(update.id)
  const groupSettings = community.getGroupSettings(update.id)
  if (!groupSettings.botEnabled) return
  if (update.action === 'add' && !policy.welcome) return
  if (update.action === 'remove' && !groupSettings.goodbyeEnabled) return

  const metadata = await socket.groupMetadata(update.id).catch(() => null)
  const groupName = metadata?.subject ?? 'este grupo'
  const customAsset = await getBrandingAsset(update.action === 'add' ? 'welcome' : 'goodbye').catch(() => null)

  for (const jid of update.participants) {
    const defaultWelcome = [
      '╭━━〔 🌿 *NUEVO MIEMBRO* 〕━━╮',
      `┃ Bienvenido/a $user`,
      `┃ a *$namegroup*`,
      '╰━━━━━━━━━━━━━━━━╯',
      '',
      `✦ Soy *${settings.botDisplayName}*`,
      `✦ Usa *${settings.prefix}menu* para conocer mis comandos.`,
      '✦ Respeta las reglas y disfruta tu estancia.',
    ].join('\n')
    const defaultGoodbye = [
      '╭━━〔 🍂 *DESPEDIDA* 〕━━╮',
      `┃ $user dejó *$namegroup*`,
      '╰━━━━━━━━━━━━━━━━╯',
      '',
      'Que tengas un buen camino. Siempre habrá un lugar si decides volver.',
    ].join('\n')

    const template = update.action === 'add'
      ? groupSettings.welcomeText ?? defaultWelcome
      : groupSettings.goodbyeText ?? defaultGoodbye
    const text = renderTemplate(template, jid, groupName)

    if (customAsset?.kind === 'video') {
      await socket.sendMessage(update.id, {
        video: { url: customAsset.path }, gifPlayback: true, caption: text, mentions: [jid],
      }).catch(() => undefined)
      continue
    }
    if (customAsset?.kind === 'image') {
      await socket.sendMessage(update.id, {
        image: { url: customAsset.path }, caption: text, mentions: [jid],
      }).catch(() => undefined)
      continue
    }

    const imageUrl = update.action === 'add' && config.welcomeImageUrl
      ? config.welcomeImageUrl
      : await socket.profilePictureUrl(jid, 'image').catch(() => undefined)
    const payload = imageUrl
      ? { image: { url: imageUrl }, caption: text, mentions: [jid] }
      : { text, mentions: [jid] }
    await socket.sendMessage(update.id, payload as never).catch(() => undefined)
  }
}
