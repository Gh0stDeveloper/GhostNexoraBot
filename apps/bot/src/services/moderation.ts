import type { GroupParticipant, ParticipantAction, WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { economy } from './economy.js'
import { community } from './community.js'
import { getBrandingAsset } from './branding.js'
import { subbotCustomization } from './subbot-customization.js'
import { settings } from '../core/settings.js'
import { getMessageText, getSender } from '../utils/message.js'
import { logger } from '../utils/logger.js'

const spamWindows = new Map<string, number[]>()
const linkRegex = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)/i

function spamKey(chatId: string, sender: string) { return `${chatId}:${sender}` }

function renderTemplate(template: string, jid: string, groupName: string) {
  return template
    .replaceAll('$user', `@${jid.split('@')[0]}`)
    .replaceAll('$namegroup', groupName)
}

function participantJid(participant: GroupParticipant) {
  return participant.phoneNumber || participant.id || participant.lid || ''
}

async function participantProfilePicture(socket: WASocket, participant: GroupParticipant) {
  const candidates = [participant.phoneNumber, participant.id, participant.lid].filter((value): value is string => Boolean(value))
  for (const jid of candidates) {
    const image = await socket.profilePictureUrl(jid, 'image').catch(() => undefined)
    if (image) return image
  }
  return undefined
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

export async function handleParticipantUpdate(
  socket: WASocket,
  update: { id: string; participants: GroupParticipant[]; action: ParticipantAction },
  instanceId?: number,
) {
  if (update.action !== 'add' && update.action !== 'remove') return

  const participants = update.participants
    .map((participant) => ({ participant, jid: participantJid(participant) }))
    .filter((item) => Boolean(item.jid))
  if (!participants.length) {
    logger.warn({ groupId: update.id, action: update.action }, 'participant update contained no usable JIDs')
    return
  }

  const policy = economy.getGroupPolicy(update.id)
  const groupSettings = community.getGroupSettings(update.id)
  if (!groupSettings.botEnabled) return
  if (update.action === 'add' && !policy.welcome) return
  if (update.action === 'remove' && !groupSettings.goodbyeEnabled) return

  const metadata = await socket.groupMetadata(update.id).catch(() => null)
  const groupName = metadata?.subject ?? 'este grupo'
  const botName = instanceId ? subbotCustomization.get(instanceId).longName : settings.botDisplayName
  const customAsset = await getBrandingAsset(update.action === 'add' ? 'welcome' : 'goodbye', instanceId).catch(() => null)

  logger.info({ groupId: update.id, action: update.action, participants: participants.map((item) => item.jid), instanceId }, 'group participant event')

  for (const { participant, jid } of participants) {
    const defaultWelcome = [
      '╭━━〔 🌿 *NUEVO MIEMBRO* 〕━━╮',
      '┃ Bienvenido/a $user',
      '┃ a *$namegroup*',
      '╰━━━━━━━━━━━━━━━━╯',
      '',
      `✦ Soy *${botName}*`,
      `✦ Usa *${settings.prefix}menu* para conocer mis comandos.`,
      '✦ Respeta las reglas del grupo y disfruta tu estancia.',
    ].join('\n')
    const defaultGoodbye = [
      '╭━━〔 🍂 *DESPEDIDA* 〕━━╮',
      '┃ $user dejó *$namegroup*',
      '╰━━━━━━━━━━━━━━━━╯',
      '',
      `*${botName}* te desea un buen camino.`,
    ].join('\n')

    const template = update.action === 'add'
      ? groupSettings.welcomeText ?? defaultWelcome
      : groupSettings.goodbyeText ?? defaultGoodbye
    const text = renderTemplate(template, jid, groupName)

    let delivered = false
    if (customAsset?.kind === 'video') {
      delivered = Boolean(await socket.sendMessage(update.id, {
        video: { url: customAsset.path }, gifPlayback: true, caption: text, mentions: [jid],
      }).then(() => true).catch(() => false))
    } else if (customAsset?.kind === 'image') {
      delivered = Boolean(await socket.sendMessage(update.id, {
        image: { url: customAsset.path }, caption: text, mentions: [jid],
      }).then(() => true).catch(() => false))
    }
    if (delivered) continue

    const imageUrl = update.action === 'add' && config.welcomeImageUrl
      ? config.welcomeImageUrl
      : await participantProfilePicture(socket, participant)

    if (imageUrl) {
      delivered = Boolean(await socket.sendMessage(update.id, {
        image: { url: imageUrl }, caption: text, mentions: [jid],
      }).then(() => true).catch(() => false))
    }
    if (delivered) continue

    await socket.sendMessage(update.id, { text, mentions: [jid] }).catch((error) => {
      logger.warn({ error, groupId: update.id, jid, action: update.action, instanceId }, 'welcome/goodbye delivery failed')
    })
  }
}
