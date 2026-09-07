import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { COIN_NAME, COIN_SYMBOL } from '../services/economy.js'
import { professionsV2 } from '../services/professions-v2.js'
import { privateAccessStatus } from '../services/private-access.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { isGroupAdministrator } from '../utils/target.js'
import { getCurrentBotVisualStyle, resolveBotVisualStyleAsset } from '../services/bot-styles-v13.js'
import { localeName } from '../i18n/index.js'
import { mediaDevV6Commands } from './media-dev-v6.js'

const sectionOrder = [
  'knowledge', 'youtube', 'downloads', 'general', 'minecraft', 'profile', 'progress', 'economy', 'rpg', 'games', 'collection',
  'social', 'stickers', 'groups', 'automation', 'subbots', 'adult', 'personalization', 'support', 'staff', 'other',
] as const

type SectionId = typeof sectionOrder[number]

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

function renderTokens(ctx: CommandContext, command: BotCommand, tokens: string[]) {
  const usage = command.usage?.trim()
  const primary = usage ? `${ctx.prefix}${usage}` : `${ctx.prefix}${command.name}`
  const aliases = tokens.filter((token) => token !== command.name.toLowerCase()).slice(0, 8).map((token) => `${ctx.prefix}${token}`)
  const suffix = aliases.length ? ` · ${aliases.join(' · ')}` : ''
  const restriction = [
    command.groupOnly ? ctx.t('menu.restriction.group') : '',
    command.adminOnly ? ctx.t('menu.restriction.admin') : '',
    command.staffOnly ? ctx.t('menu.restriction.staff') : '',
    command.ownerOnly ? ctx.t('menu.restriction.owner') : '',
  ].filter(Boolean).join('/')
  return `│ ${primary}${suffix}${restriction ? ` 〔${restriction}〕` : ''}`
}

function formatUptime() {
  const seconds = Math.floor(process.uptime())
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

async function roleLabel(ctx: CommandContext) {
  if (ctx.isOwner) return ctx.t('menu.role.owner')
  if (ctx.isBotStaff) return ctx.t('menu.role.staff')
  if (ctx.isGroup && await isGroupAdministrator(ctx).catch(() => false)) return ctx.t('menu.role.groupAdmin')
  return ctx.t('menu.role.user')
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

async function menu(ctx: CommandContext) {
  const profession = professionsV2.get(ctx.sender)
  const role = await roleLabel(ctx)
  const privateAccess = Boolean(privateAccessStatus(ctx.sender)) || ctx.isOwner || ctx.isBotStaff
  const instance = ctx.instanceId ? `Subbot #${ctx.instanceId}` : 'MainBot'
  const visual = await currentVisualIdentity(ctx)
  const grouped = new Map<SectionId, string[]>()
  for (const id of sectionOrder) grouped.set(id, [])
  for (const row of effectiveCommands()) if (visible(ctx, row.command)) grouped.get(sectionFor(row.command))!.push(renderTokens(ctx, row.command, row.tokens))

  const sections = sectionOrder.flatMap((id) => {
    const rows = grouped.get(id) ?? []
    if (!rows.length) return []
    rows.sort((a, b) => a.localeCompare(b, ctx.locale))
    return [`╭─〔 ${ctx.t(`menu.section.${id}`)} 〕`, ...rows, '╰────────────────', '']
  })

  const visualHeader = visual.style.id === 'default'
    ? '╭━━━〔 👻 *GHOST NEXORA BOT* 〕━━━╮'
    : `╭━━━〔 ${visual.style.icon} *${visual.displayName.toUpperCase()}* 〕━━━╮`

  const effectiveCount = effectiveCommands().filter((row) => visible(ctx, row.command)).length
  const body = [
    visualHeader,
    visual.style.id !== 'default' ? ctx.t('menu.header.activeWaifu', { name: visual.displayName }) : '',
    ctx.t('menu.header.instance', { value: instance }),
    ctx.t('menu.header.user', { value: ctx.pushName }),
    ctx.t('menu.header.prefix', { value: ctx.prefix }),
    ctx.t('menu.header.language', { value: `${localeName(ctx.locale, ctx.locale)} (${ctx.locale})` }),
    ctx.t('menu.header.uptime', { value: formatUptime() }),
    ctx.t('menu.header.currency', { value: `${COIN_NAME} (${COIN_SYMBOL})` }),
    ctx.t('menu.header.profession', { value: `${profession.emoji} ${profession.label}` }),
    ctx.t('menu.header.role', { value: role }),
    ctx.t('menu.header.private', { value: privateAccess ? ctx.t('menu.private.enabled') : ctx.t('menu.private.disabled') }),
    '╰━━━━━━━━━━━━━━━━━━━━╯', '',
    ...sections,
    ctx.t('menu.totalCommands', { count: effectiveCount }),
    '',
    visual.style.id !== 'default' ? ctx.t('menu.appearance', { icon: visual.style.icon, name: visual.displayName }) : '',
    '*Ghost Nexora Bot*',
  ].filter(Boolean).join('\n')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: ctx.t('menu.title', { icon: visual.style.id === 'default' ? '👻' : visual.style.icon, name: visual.style.id === 'default' ? 'Ghost Nexora Bot' : visual.displayName }),
    body,
    imageUrl: visual.imageUrl,
    footer: 'Ghost Nexora Bot',
    buttons: [
      { type: 'url', text: ctx.t('menu.button.channel'), url: config.officialChannelUrl },
      { type: 'reply', text: ctx.t('menu.button.profile'), id: `${ctx.prefix}profile` },
      { type: 'reply', text: ctx.t('menu.button.shop'), id: `${ctx.prefix}shop` },
    ],
  })
}

export const menuV5Commands: BotCommand[] = [
  ...mediaDevV6Commands,
  { name: 'menu', aliases: ['help','comandos'], category: 'general', description: 'Menú completo generado desde todos los comandos activos con avatar/waifu visual de la instancia.', handler: menu },
]