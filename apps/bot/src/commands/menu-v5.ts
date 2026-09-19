import { readFileSync } from 'node:fs'
import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import { config } from '../config.js'
import { COIN_NAME, COIN_SYMBOL } from '../services/economy.js'
import { professionsV2 } from '../services/professions-v2.js'
import { isPrivateChatApproved } from '../services/private-chat-policy.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { isGroupAdministrator } from '../utils/target.js'
import { getCurrentBotVisualStyle, resolveBotVisualStyleAsset } from '../services/bot-styles-v13.js'
import { isGroupCommandCategoryAllowed } from '../services/group-command-policy.js'
import { commandRuntimeDecision } from '../services/command-runtime-config.js'
import { localeName } from '../i18n/index.js'
import { mediaDevV6Commands } from './media-dev-v6.js'
import { valleyCompatV21Commands } from './valley-compat-v21.js'
import { editCommands } from './edit.js'
import { valleyPocV22Commands } from './valley-poc-v22.js'

const sectionOrder = [
  'knowledge', 'youtube', 'downloads', 'general', 'minecraft', 'profile', 'progress', 'economy', 'rpg', 'games', 'collection',
  'social', 'stickers', 'groups', 'automation', 'subbots', 'adult', 'personalization', 'support', 'staff', 'other',
] as const

type SectionId = typeof sectionOrder[number]

const sets = {
  knowledge: new Set(['ai','aistatus','investiga','google','wiki','anime','manga','mangachapters','mangadl','deepseek','llm','minillm','localai']),
  youtube: new Set(['yts','ytmp3','ytmp4','play','playvideo','ytmusic','yt','ytformats','lyrics','soundcloud','spotify','spotifydl']),
  progress: new Set(['achievements','titles','season','reputation','rep','reptop','v4profile','clan','clantop','market','sell','buylisting','cancellisting','property','vehicle']),
  rpg: new Set(['grimorio','usar','givegema','inventory','pet','gather','craft','quests','quest','raid']),
  automation: new Set(['groupstats','announce','rss','poll','polls']),
  support: new Set(['ticket','tickets']),
  personalization: new Set(['setbotname','setbotcurrency','setpfp','sb','welbanner','byebanner','delbanner','delwelbanner','delbyebanner','styles','style','styleimg']),
}

const BOT_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: string }
    return pkg.version?.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
})()

const interactiveGameCatalog = [
  { command: 'dino', icon: '🦖', label: 'Dino Runner', descriptionKey: 'games.catalog.dino' },
  { command: 'mario', icon: '🍄', label: 'Mario', descriptionKey: 'games.catalog.mario' },
  { command: 'snake', icon: '🐍', label: 'Snake', descriptionKey: 'games.catalog.snake' },
] as const

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

function visible(ctx: LegacyCompatibleCommandContext, command: BotCommand) {
  if (command.ownerOnly && !ctx.isOwner) return false
  if (command.staffOnly && !ctx.isBotStaff && !(command.subbotOwnerAllowed && ctx.isSubbotOwner) && !ctx.isOwner) return false
  return true
}

function restrictionLabel(ctx: LegacyCompatibleCommandContext, command: BotCommand) {
  return [
    command.groupOnly ? ctx.t('menu.restriction.group') : '',
    command.adminOnly ? ctx.t('menu.restriction.admin') : '',
    command.staffOnly ? ctx.t('menu.restriction.staff') : '',
    command.ownerOnly ? ctx.t('menu.restriction.owner') : '',
  ].filter(Boolean).join('/')
}

function renderTokens(ctx: LegacyCompatibleCommandContext, command: BotCommand, tokens: string[]) {
  const usage = command.usage?.trim()
  const primary = usage ? `${ctx.prefix}${usage}` : `${ctx.prefix}${command.name}`
  const aliases = tokens
    .filter((token) => token !== command.name.toLowerCase())
    .sort((a, b) => a.localeCompare(b, ctx.locale))
  const restriction = restrictionLabel(ctx, command)
  const suffix = restriction ? ` 〔${restriction}〕` : ''

  return [
    `│ ${primary}${suffix}`,
    ...aliases.map((token) => `│ ${ctx.prefix}${token}${suffix}`),
  ].join('\n')
}

function publicBotWebsite() {
  const configured = config.publicWebUrl.trim().replace(/\/+$/, '')
  try {
    const url = new URL(configured)
    if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname)) return configured
  } catch {
    // Falls through to the public browser/proxy origin.
  }

  try {
    return new URL(config.browserProxyPublicUrl).origin
  } catch {
    return 'https://ghostnexorabot.duckdns.org'
  }
}

function formatUptime() {
  const seconds = Math.floor(process.uptime())
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

async function roleLabel(ctx: LegacyCompatibleCommandContext) {
  if (ctx.isOwner) return ctx.t('menu.role.owner')
  if (ctx.isSubbotOwner) return ctx.t('menu.role.owner')
  if (ctx.isBotStaff) return ctx.t('menu.role.staff')
  if (ctx.isGroup && await isGroupAdministrator(ctx).catch(() => false)) return ctx.t('menu.role.groupAdmin')
  return ctx.t('menu.role.user')
}

async function currentBotAvatar(ctx: LegacyCompatibleCommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function currentVisualIdentity(ctx: LegacyCompatibleCommandContext) {
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

async function gamesCatalog(ctx: LegacyCompatibleCommandContext) {
  const lines = interactiveGameCatalog.map((game) => [
    `${game.icon} *${ctx.prefix}${game.command}* · ${game.label}`,
    `   ${ctx.t(game.descriptionKey)}`,
  ].join('\n'))

  const buttons: InteractiveButton[] = interactiveGameCatalog.length <= 3
    ? interactiveGameCatalog.map((game) => ({
        type: 'reply' as const,
        text: `${game.icon} ${game.label}`,
        id: `${ctx.prefix}${game.command}`,
      }))
    : [{
        type: 'select',
        text: ctx.t('games.catalog.select'),
        sections: [{
          title: ctx.t('games.catalog.section'),
          rows: interactiveGameCatalog.map((game) => ({
            id: `${ctx.prefix}${game.command}`,
            title: `${game.icon} ${game.label}`,
            description: ctx.t(game.descriptionKey),
          })),
        }],
      }]

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: ctx.t('games.catalog.title'),
    body: [
      ctx.t('games.catalog.intro'),
      '',
      ...lines,
      '',
      ctx.t('games.catalog.hint', { prefix: ctx.prefix }),
    ].join('\n'),
    footer: ctx.t('games.catalog.footer'),
    buttons,
  })
}

async function menu(ctx: LegacyCompatibleCommandContext) {
  const profession = professionsV2.get(ctx.sender)
  const role = await roleLabel(ctx)
  const privateAccess = ctx.isOwner || ctx.isSubbotOwner || isPrivateChatApproved(ctx.sender)
  const instance = ctx.instanceId ? `Subbot #${ctx.instanceId}` : 'MainBot'
  const visual = await currentVisualIdentity(ctx)
  const groupAdmin = ctx.isGroup ? await isGroupAdministrator(ctx).catch(() => false) : false
  const groupPolicyBypass = ctx.isOwner || ctx.isBotStaff || ctx.isSubbotOwner || groupAdmin
  const menuRows = effectiveCommands().filter((row) => {
    if (!visible(ctx, row.command)) return false
    const runtime = commandRuntimeDecision({
      commandName: row.command.name,
      category: row.command.category,
      platform: 'whatsapp',
      isGroup: ctx.isGroup,
      userId: ctx.sender,
      isOwner: ctx.isOwner,
      isStaff: ctx.isBotStaff,
      isSubbotOwner: ctx.isSubbotOwner,
      checkCooldown: false,
    })
    if (!runtime.allowed) return false
    if (!ctx.isGroup || groupPolicyBypass) return true
    return isGroupCommandCategoryAllowed(ctx.chatId, row.command.category)
  })
  const grouped = new Map<SectionId, string[]>()
  for (const id of sectionOrder) grouped.set(id, [])
  for (const row of menuRows) grouped.get(sectionFor(row.command))!.push(renderTokens(ctx, row.command, row.tokens))

  const sections = sectionOrder.flatMap((id) => {
    const rows = grouped.get(id) ?? []
    if (!rows.length) return []
    rows.sort((a, b) => a.localeCompare(b, ctx.locale))
    return [`╭─〔 ${ctx.t(`menu.section.${id}`)} 〕`, ...rows, '╰────────────────', '']
  })

  const visualHeader = visual.style.id === 'default'
    ? '╭━━━〔 👻 *GHOST NEXORA BOT* 〕━━━╮'
    : `╭━━━〔 ${visual.style.icon} *${visual.displayName.toUpperCase()}* 〕━━━╮`

  // Cuenta rutas realmente utilizables (nombre principal + aliases únicos), no
  // solo handlers canónicos. Así el total coincide con los comandos que el menú
  // muestra y que el router acepta, sin volver a registrar implementaciones duplicadas.
  const effectiveCount = new Set(menuRows.flatMap((row) => row.tokens)).size
  const website = publicBotWebsite()
  const body = [
    visualHeader,
    visual.style.id !== 'default' ? ctx.t('menu.header.activeWaifu', { name: visual.displayName }) : '',
    ctx.t('menu.header.instance', { value: instance }),
    ctx.t('menu.header.version', { value: BOT_VERSION }),
    ctx.t('menu.header.website', { value: website }),
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
    ctx.t('menu.discovery.games', { prefix: ctx.prefix }),
    visual.style.id !== 'default' ? ctx.t('menu.appearance', { icon: visual.style.icon, name: visual.displayName }) : '',
    '*Ghost Nexora Bot*',
  ].filter(Boolean).join('\n')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: ctx.t('menu.title', {
      icon: visual.style.id === 'default' ? '👻' : visual.style.icon,
      name: visual.style.id === 'default' ? 'Ghost Nexora Bot' : visual.displayName,
    }),
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
  ...valleyCompatV21Commands,
  ...editCommands,
  ...valleyPocV22Commands,
  { name: 'game', aliases: ['games'], category: 'games', description: 'Muestra el catálogo de juegos interactivos HTML/Rich disponibles.', handler: gamesCatalog },
  { name: 'menu', aliases: ['help','comandos'], category: 'general', description: 'Menú completo generado desde todos los comandos activos con avatar/waifu visual de la instancia.', handler: menu },
]
