import type { GroupParticipant, ParticipantAction, WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from './economy.js'
import { community } from './community.js'
import { getBrandingAsset } from './branding.js'
import { subbotCustomization } from './subbot-customization.js'
import { sendInteractiveCard } from './interactive.js'
import { getMessageText, getSender } from '../utils/message.js'
import { preferredJid, registerIdentity } from './identity.js'
import { getCurrentBotVisualStyle, resolveBotVisualStyleAsset } from './bot-styles-v13.js'
import { logger } from '../utils/logger.js'

const db = economy.db
const spamWindows = new Map<string, number[]>()
const linkRegex = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/)/i
const WARNING_TTL = 24 * 60 * 60_000

db.exec(`
  CREATE TABLE IF NOT EXISTS group_warnings (
    group_jid TEXT NOT NULL,
    user_jid TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    last_warning INTEGER NOT NULL,
    PRIMARY KEY(group_jid, user_jid, kind)
  );
`)

function participantJid(participant: GroupParticipant) { return preferredJid([participant.phoneNumber, participant.id, participant.lid]) }
function isAdmin(participant?: GroupParticipant) { return Boolean(participant?.admin) }

function warning(groupJid: string, userJid: string, kind: 'link' | 'spam') {
  const row = db.prepare('SELECT count, last_warning as lastWarning FROM group_warnings WHERE group_jid = ? AND user_jid = ? AND kind = ?').get(groupJid, userJid, kind) as { count?: number; lastWarning?: number } | undefined
  const previous = row && Date.now() - Number(row.lastWarning ?? 0) <= WARNING_TTL ? Number(row.count ?? 0) : 0
  const count = previous + 1
  db.prepare(`INSERT INTO group_warnings(group_jid, user_jid, kind, count, last_warning) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(group_jid, user_jid, kind) DO UPDATE SET count = excluded.count, last_warning = excluded.last_warning`)
    .run(groupJid, userJid, kind, count, Date.now())
  return count
}

function resetWarnings(groupJid: string, userJid: string) {
  db.prepare('DELETE FROM group_warnings WHERE group_jid = ? AND user_jid = ?').run(groupJid, userJid)
}

async function warnOrKick(socket: WASocket, message: WAMessage, kind: 'link' | 'spam', userJid: string) {
  const chatId = message.key.remoteJid!
  const count = warning(chatId, userJid, kind)
  const label = kind === 'link' ? 'ANTI-LINK' : 'ANTI-SPAM'
  const reason = kind === 'link' ? 'Los enlaces no están permitidos en este grupo.' : 'Estás enviando mensajes demasiado rápido.'
  await socket.sendMessage(chatId, { delete: message.key }).catch(() => undefined)

  if (count < 3) {
    await socket.sendMessage(chatId, {
      text: `╭━━〔 ⚠️ *${label}* 〕━━╮\n┃ @${userJid.split('@')[0]}\n┃ ${reason}\n┃ Advertencia: *${count}/3*\n┃ A la tercera advertencia serás expulsado/a.\n╰━━━━━━━━━━━━━━━━╯`,
      mentions: [userJid],
    }).catch(() => undefined)
    return true
  }

  const removed = await socket.groupParticipantsUpdate(chatId, [userJid], 'remove').then(() => true).catch(() => false)
  if (removed) resetWarnings(chatId, userJid)
  await socket.sendMessage(chatId, {
    text: removed
      ? `╭━━〔 🚫 *${label} · 3/3* 〕━━╮\n┃ @${userJid.split('@')[0]} alcanzó 3 advertencias.\n┃ Acción: *EXPULSADO/A*.\n╰━━━━━━━━━━━━━━━━╯`
      : `⚠️ @${userJid.split('@')[0]} alcanzó *3/3* advertencias, pero no pude expulsarlo. Verifica que el bot sea administrador.`,
    mentions: [userJid],
  }).catch(() => undefined)
  return true
}

export async function moderateIncomingV2(socket: WASocket, message: WAMessage) {
  const chatId = message.key.remoteJid
  if (!chatId?.endsWith('@g.us') || message.key.fromMe) return false
  if (!community.getGroupSettings(chatId).botEnabled) return false
  const policy = economy.getGroupPolicy(chatId)
  if (!policy.antiLink && !policy.antiSpam) return false
  const metadata = await socket.groupMetadata(chatId).catch(() => null)
  const senderRaw = getSender(message)
  const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(senderRaw))
  if (isAdmin(participant)) return false
  const aliases = [participant?.id, participant?.phoneNumber, participant?.lid, senderRaw].filter((value): value is string => Boolean(value))
  const sender = preferredJid([participant?.phoneNumber, participant?.id, senderRaw, participant?.lid]) || senderRaw
  registerIdentity(chatId, aliases, sender)
  const text = getMessageText(message)

  if (policy.antiLink && linkRegex.test(text)) return warnOrKick(socket, message, 'link', sender)

  if (policy.antiSpam) {
    const key = `${chatId}:${sender}`
    const cutoff = Date.now() - 8_000
    const history = (spamWindows.get(key) ?? []).filter((stamp) => stamp >= cutoff)
    history.push(Date.now())
    spamWindows.set(key, history)
    if (history.length >= 6) {
      spamWindows.set(key, [])
      return warnOrKick(socket, message, 'spam', sender)
    }
  }
  return false
}

function renderTemplate(template: string, jid: string, groupName: string) {
  return template.replaceAll('$user', `@${jid.split('@')[0]}`).replaceAll('$namegroup', groupName)
}

async function currentBotAvatar(socket: WASocket) {
  const jid = socket.user?.id
  if (!jid) return undefined
  return socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function currentVisualIdentity(socket: WASocket) {
  const style = getCurrentBotVisualStyle()
  const fallback = await currentBotAvatar(socket)
  if (style.id === 'default') {
    return { style, imageUrl: fallback, displayName: 'Ghost Nexora Bot' }
  }
  try {
    const asset = await resolveBotVisualStyleAsset(style)
    return {
      style,
      imageUrl: asset.imageUrl || fallback,
      displayName: asset.characterName || style.characterQuery || style.name.split('·')[0]!.trim(),
    }
  } catch {
    return {
      style,
      imageUrl: fallback,
      displayName: style.characterQuery || style.name.split('·')[0]!.trim(),
    }
  }
}

export async function handleParticipantUpdateV2(socket: WASocket, update: { id: string; participants: GroupParticipant[]; action: ParticipantAction }, instanceId?: number) {
  if (!['add', 'remove'].includes(update.action)) return
  const policy = economy.getGroupPolicy(update.id)
  const groupSettings = community.getGroupSettings(update.id)
  if (!groupSettings.botEnabled) return
  if (update.action === 'add' && !policy.welcome) return
  if (update.action === 'remove' && !groupSettings.goodbyeEnabled) return
  const metadata = await socket.groupMetadata(update.id).catch(() => null)
  const groupName = metadata?.subject ?? 'este grupo'
  const botName = instanceId ? subbotCustomization.get(instanceId).longName : settings.botDisplayName
  const goodbyeAsset = update.action === 'remove' ? await getBrandingAsset('goodbye', instanceId).catch(() => null) : null
  const visual = update.action === 'add' ? await currentVisualIdentity(socket) : null

  for (const participant of update.participants) {
    const jid = participantJid(participant)
    if (!jid) continue
    registerIdentity(update.id, [participant.id, participant.phoneNumber, participant.lid].filter((value): value is string => Boolean(value)), jid)
    if (update.action === 'add') {
      const waifuLine = visual && visual.style.id !== 'default' ? `🌸 Apariencia activa: *${visual.displayName}*` : ''
      const defaultText = [
        `🎉 *¡BIENVENIDO/A A ${groupName.toUpperCase()}!*`,
        '━━━━━━━━━━━━━━━━━━',
        `👤 @${jid.split('@')[0]}`,
        `🤖 Soy *${botName}* y estoy aquí para juegos, economía NXC, descargas, IA, stickers y administración.`,
        waifuLine,
        '',
        `📜 Revisa las reglas con *${settings.prefix}rules*`,
        `👤 Crea/consulta tu perfil con *${settings.prefix}profile*`,
        `📚 Descubre funciones con *${settings.prefix}menu*`,
        '',
        '✨ Participa, respeta a los demás y disfruta del grupo.',
      ].filter(Boolean).join('\n')
      const text = groupSettings.welcomeText ? renderTemplate(groupSettings.welcomeText, jid, groupName) : defaultText
      const title = visual && visual.style.id !== 'default'
        ? `${visual.style.icon} ${visual.displayName} · BIENVENIDA`
        : `👻 ${botName} · BIENVENIDA`
      await sendInteractiveCard(socket, update.id, { key: { remoteJid: update.id, id: `welcome-${Date.now()}` }, message: {} } as WAMessage, {
        title,
        body: text,
        imageUrl: visual?.imageUrl,
        footer: `${groupName} · ${botName} · Ghost Nexora Bot`,
        buttons: [
          { type: 'reply', text: '📜 Ver reglas', id: `${settings.prefix}rules` },
          { type: 'reply', text: '👤 Mi perfil', id: `${settings.prefix}profile` },
          { type: 'url', text: '📢 Canal', url: config.officialChannelUrl },
        ],
      }).catch(async () => {
        await socket.sendMessage(update.id, { text, mentions: [jid] }).catch(() => undefined)
      })
      continue
    }

    const goodbye = groupSettings.goodbyeText
      ? renderTemplate(groupSettings.goodbyeText, jid, groupName)
      : `🍂 *HASTA PRONTO*\n━━━━━━━━━━━━━━━━━━\n@${jid.split('@')[0]} salió de *${groupName}*.\n\n👻 *${botName}* agradece el tiempo compartido. Que te vaya bien en lo que sigue.`
    if (goodbyeAsset?.kind === 'image') await socket.sendMessage(update.id, { image: { url: goodbyeAsset.path }, caption: goodbye, mentions: [jid] }).catch(() => undefined)
    else if (goodbyeAsset?.kind === 'video') await socket.sendMessage(update.id, { video: { url: goodbyeAsset.path }, gifPlayback: true, caption: goodbye, mentions: [jid] }).catch(() => undefined)
    else await socket.sendMessage(update.id, { text: goodbye, mentions: [jid] }).catch((error) => logger.warn({ error, groupId: update.id }, 'goodbye failed'))
  }
}
