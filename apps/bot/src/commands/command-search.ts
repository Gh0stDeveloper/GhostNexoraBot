import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import type { CommandMetadata } from '../services/command-metadata.js'
import { effectiveCommandMetadata } from '../services/menu-registry.js'
import { isGroupCommandCategoryAllowed } from '../services/group-command-policy.js'
import { commandRuntimeDecision } from '../services/command-runtime-config.js'
import { isGroupAdministrator } from '../utils/target.js'

type SearchHit = {
  command: CommandMetadata
  tokens: string[]
  score: number
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function permissions(command: CommandMetadata) {
  const rows: string[] = []
  if (command.permissions.ownerOnly) rows.push('owner')
  if (command.permissions.staffOnly) rows.push('staff')
  if (command.permissions.groupOnly) rows.push('solo grupos')
  if (command.permissions.adminOnly) rows.push('admin')
  if (command.permissions.botAdminOnly) rows.push('bot admin')
  if (command.permissions.subbotOwnerAllowed) rows.push('owner de subbot')
  return rows.length ? rows.join(', ') : 'todos'
}

function scoreCommand(command: CommandMetadata, tokens: string[], query: string) {
  const name = normalize(command.name)
  const aliases = (command.aliases ?? []).map(normalize)
  const category = normalize(command.category)
  const description = normalize(command.description)
  const usage = normalize(command.usage ?? '')
  const normalizedTokens = tokens.map(normalize)

  if (name === query) return 1000
  if (aliases.includes(query)) return 950
  if (normalizedTokens.includes(query)) return 925
  if (name.startsWith(query)) return 800
  if (aliases.some((alias) => alias.startsWith(query))) return 760
  if (normalizedTokens.some((token) => token.startsWith(query))) return 740
  if (name.includes(query)) return 650
  if (aliases.some((alias) => alias.includes(query))) return 620
  if (category === query) return 580
  if (description.includes(query)) return 420
  if (usage.includes(query)) return 380
  if (category.includes(query)) return 340
  return 0
}

function visibleTo(ctx: LegacyCompatibleCommandContext, command: CommandMetadata, groupAdmin: boolean) {
  if (command.permissions.ownerOnly && !ctx.isOwner) return false
  if (command.permissions.staffOnly && !ctx.isBotStaff && !(command.permissions.subbotOwnerAllowed && ctx.isSubbotOwner) && !ctx.isOwner) return false
  const runtime = commandRuntimeDecision({
    commandName: command.name,
    category: command.category,
    platform: 'whatsapp',
    isGroup: ctx.isGroup,
    userId: ctx.sender,
    isOwner: ctx.isOwner,
    isStaff: ctx.isBotStaff,
    isSubbotOwner: ctx.isSubbotOwner,
    checkCooldown: false,
  })
  if (!runtime.allowed) return false
  if (ctx.isGroup && !ctx.isOwner && !ctx.isBotStaff && !ctx.isSubbotOwner && !groupAdmin) {
    if (!isGroupCommandCategoryAllowed(ctx.chatId, command.category)) return false
  }
  return true
}

function searchCommands(query: string): SearchHit[] {
  return effectiveCommandMetadata()
    .map(({ metadata, tokens }) => ({ command: metadata, tokens, score: scoreCommand(metadata, tokens, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
}

export const commandSearchCommands: BotCommand[] = [
  {
    name: 'buscarcomando',
    aliases: ['buscarcmd', 'findcmd', 'comandobuscar'],
    category: 'tools',
    description: 'Busca comandos activos por nombre, alias, categoría, descripción o uso.',
    usage: '.buscarcomando <texto>',
    async handler(ctx) {
      const query = normalize(ctx.argText)
      if (!query) {
        await ctx.reply([
          '*BUSCADOR DE COMANDOS*',
          '',
          `Uso: ${ctx.prefix}buscarcomando <texto>`,
          '',
          `Ejemplos:`,
          `${ctx.prefix}buscarcomando instagram`,
          `${ctx.prefix}buscarcomando admin`,
          `${ctx.prefix}buscarcomando descargas`,
        ].join('\n'))
        return
      }

      const groupAdmin = ctx.isGroup ? await isGroupAdministrator(ctx).catch(() => false) : false
      const hits = searchCommands(query).filter((hit) => visibleTo(ctx, hit.command, groupAdmin)).slice(0, 12)
      if (!hits.length) {
        await ctx.reply(`No encontré comandos activos relacionados con *${ctx.argText.trim()}*.`)
        return
      }

      const lines = [
        '*BUSCADOR DE COMANDOS*',
        `Consulta: *${ctx.argText.trim()}*`,
        `Resultados: *${hits.length}*`,
        '',
      ]

      for (const [index, hit] of hits.entries()) {
        const aliases = (hit.command.aliases ?? []).filter((alias) => normalize(alias) !== normalize(hit.command.name))
        lines.push(
          `*${index + 1}. ${ctx.prefix}${hit.command.name}*`,
          `Categoría: ${hit.command.category}`,
          `Descripción: ${hit.command.description}`,
          `Uso: ${hit.command.usage || `${ctx.prefix}${hit.command.name}`}`,
          `Permisos: ${permissions(hit.command)}`,
          ...(aliases.length ? [`Alias: ${aliases.map((alias) => `${ctx.prefix}${alias}`).join(', ')}`] : []),
          '',
        )
      }

      await ctx.reply(lines.join('\n').trim())
    },
  },
]
