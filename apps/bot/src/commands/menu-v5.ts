import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { COIN_NAME, COIN_SYMBOL } from '../services/economy.js'
import { professionsV2 } from '../services/professions-v2.js'
import { privateAccessStatus } from '../services/private-access.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { isGroupAdministrator } from '../utils/target.js'
import { getCurrentBotVisualStyle, resolveBotVisualStyleAsset } from '../services/bot-styles-v13.js'
import { mediaDevV6Commands } from './media-dev-v6.js'

const sectionOrder = [
  'knowledge', 'youtube', 'downloads', 'general', 'minecraft', 'profile', 'progress', 'economy', 'rpg', 'games', 'collection',
  'social', 'stickers', 'groups', 'automation', 'subbots', 'adult', 'personalization', 'support', 'staff', 'other',
] as const

type SectionId = typeof sectionOrder[number]

const sectionTitles: Record<SectionId, string> = {
  knowledge: '🧠 *IA · BÚSQUEDA · CONOCIMIENTO*', youtube: '🎵 *DESCARGAS · YOUTUBE Y AUDIO*',
  downloads: '📲 *DESCARGAS · REDES Y ARCHIVOS*', general: '🌐 *GENERAL*', minecraft: '⛏️ *MINECRAFT · JAVA Y BEDROCK*', profile: '👤 *PERFIL*',
  progress: '🏆 *PROGRESO · TEMPORADAS · MUNDO*', economy: '🪙 *ECONOMÍA Y FINANZAS*',
  rpg: '📖 *RPG · CRAFTING · MASCOTAS*', games: '🎮 *JUEGOS Y APUESTAS NXC*', collection: '🌸 *GACHA Y COLECCIÓN*',
  social: '💞 *SOCIAL · REACCIONES · REPUTACIÓN*', stickers: '🎨 *STICKERS Y HERRAMIENTAS*',
  groups: '👥 *ADMINISTRACIÓN DE GRUPOS*', automation: '📊 *COMUNIDAD · AUTOMATIZACIÓN*', subbots: '🤖 *SUBBOTS*',
  adult: '🔞 *DESCARGAS Y CONTENIDO 18+*', personalization: '🎛️ *PERSONALIZACIÓN*', support: '🎫 *SOPORTE*',
  staff: '🛡️ *STAFF DEL BOT*', other: '🧩 *OTROS COMANDOS*',
}

const sets = {
  knowledge: new Set(['ai','aistatus','investiga','google','wiki','anime','manga','mangachapters','mangadl','deepseek','llm','minillm','localai']),
  youtube: new Set(['yts','ytmp3','ytmp4','play','playvideo','ytmusic','yt','ytformats','lyrics','soundcloud']),
  progress: new Set(['achievements','titles','season','reputation','rep','reptop','v4profile','clan','clantop','market','sell','buylisting','cancellisting','property','vehicle']),
  rpg: new Set(['grimorio','usar','givegema','inventory','pet','gather','craft','quests','quest','raid']),
  automation: new Set(['groupstats','announce','rss','poll','polls']),
  support: new Set(['ticket','tickets']),
  personalization: new Set(['setbotname','setbotcurrency','setpfp','sb','welbanner','byebanner','delbanner','delwelbanner','delbyebanner','styles','style','styleimg']),
}

function sectionFor(command: BotCommand): SectionId {
  const name = command.name.toLowerCase()
  if (name === 'mc' || name.startsWith('mc')) return 'minecraft'
  if (sets.knowledge.has(name)) return 'knowledge'
  if (sets.youtube.has(name)) return 'youtube'
  if (sets.progress.has(name)) return 'progress'
  if (sets.rpg.has(name)) return 'rpg'
  if (sets.automation.has(name)) return 'automation'
  if (sets.support.has(name)) return 'support'
  if (sets.personalization.has(name)) return 'personalization'
  if (command.category === 'downloads') return 'downloads'
  if (command.category === 'profile') return 'profile'
  if (command.category === 'economy') return 'economy'
  if (command.category === 'games') return 'games'
  if (command.category === 'collection') return 'collection'
  if (command.category === 'social') return 'social'
  if (command.category === 'stickers' || command.category === 'tools') return 'stickers'
  if (command.category === 'groups') return 'groups'
  if (command.category === 'subbots') return 'subbots'
  if (command.category === 'adult') return 'adult'
  if (command.category === 'owner') return 'staff'
  if (command.category === 'general') return 'general'
  return 'other'
}

function visible(ctx: CommandContext, command: BotCommand) {
  if (command.ownerOnly && !ctx.isOwner) return false
  if (command.staffOnly && !ctx.isBotStaff && !ctx.isOwner) return false
  return true
}

function renderTokens(prefix: string, command: BotCommand, tokens: string[]) {
  const usage = command.usage?.trim()
  const primary = usage ? `${prefix}${usage}` : `${prefix}${command.name}`
  const aliases = tokens.filter((token) => token !== command.name.toLowerCase()).slice(0, 8).map((token) => `${prefix}${token}`)
  const suffix = aliases.length ? ` · ${aliases.join(' · ')}` : ''
  const restriction = [command.groupOnly ? 'grupo' : '', command.adminOnly ? 'admin' : '', command.staffOnly ? 'staff' : '', command.ownerOnly ? 'owner' : ''].filter(Boolean).join('/')
  return `│ ${primary}${suffix}${restriction ? ` 〔${restriction}〕` : ''}`
}

function formatUptime() {
  const seconds = Math.floor(process.uptime())
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

async function roleLabel(ctx: CommandContext) {
  if (ctx.isOwner) return 'Owner'
  if (ctx.isBotStaff) return 'Staff global'
  if (ctx.isGroup && await isGroupAdministrator(ctx).catch(() => false)) return 'Administrador de grupo'
  return 'Usuario'
}

async function currentBotAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function currentVisualIdentity(ctx: CommandContext) {
  const style = getCurrentBotVisualStyle()
  const fallback = await currentBotAvatar(ctx)
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

function menuBody(ctx: CommandContext, rows: ReturnType<typeof effectiveCommands>, displayName: string, role: string) {
  const sections = new Map<SectionId, string[]>()
  for (const id of sectionOrder) sections.set(id, [])
  for (const row of rows) {
    if (!visible(ctx, row.command)) continue
    const section = sectionFor(row.command)
    sections.get(section)!.push(renderTokens(ctx.prefix, row.command, row.tokens))
  }

  const rendered = sectionOrder
    .map((id) => {
      const lines = sections.get(id) ?? []
      return lines.length ? [sectionTitles[id], ...lines].join('\n') : ''
    })
    .filter(Boolean)
    .join('\n\n')

  return [
    `╭━━━〔 ${displayName.toUpperCase()} 〕━━━╮`,
    `┃ 👤 Usuario » ${ctx.pushName || 'Usuario'}`,
    `┃ 🛡️ Rol » ${role}`,
    `┃ ⏱️ Uptime » ${formatUptime()}`,
    `┃ 💰 Moneda » ${COIN_NAME} (${COIN_SYMBOL})`,
    `┃ ⌨️ Prefijo » ${ctx.prefix}`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    rendered,
    '',
    'Ghost Nexora Bot',
  ].join('\n')
}

async function menu(ctx: CommandContext) {
  const rows = effectiveCommands()
  const role = await roleLabel(ctx)
  const visual = await currentVisualIdentity(ctx)
  const body = menuBody(ctx, rows, visual.displayName, role)
  const access = privateAccessStatus(ctx.sender)
  const footer = [
    visual.style.id !== 'default' ? `${visual.style.icon} ${visual.displayName}` : '',
    access.active ? `Privado · ${access.label}` : '',
    'Ghost Nexora Bot',
  ].filter(Boolean).join(' · ')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `${visual.style.icon} ${visual.displayName} · MENÚ`,
    body,
    footer,
    imageUrl: visual.imageUrl,
    buttons: [
      { type: 'reply', text: '🎛️ Personalización', id: `${ctx.prefix}styles` },
      { type: 'reply', text: '🧠 IA', id: `${ctx.prefix}ai` },
      { type: 'reply', text: '🎮 Juegos', id: `${ctx.prefix}menu games` },
    ],
  })
}

const legacyMenuCommand = mediaDevV6Commands.find((command) => command.name === 'menu')

export const menuV5Commands: BotCommand[] = [
  ...(legacyMenuCommand ? [{ ...legacyMenuCommand, description: 'Menú completo con todos los comandos y avatar/waifu visual activa.', handler: menu }] : [{
    name: 'menu', aliases: ['help', 'comandos'], category: 'general' as const, description: 'Menú completo con todos los comandos y avatar/waifu visual activa.', handler: menu,
  }]),
]
